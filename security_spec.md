# IMovies Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Default-Deny Catch-All**: Unmatched paths (`/{document=**}`) deny all reads and writes unconditionally.
2. **PII Split Isolation**: User PII (`email`, `phone`) is strictly isolated inside `/users/{userId}/private/info` and readable/writable ONLY by `request.auth.uid == userId` (verified email) or a verified `isAdmin()`.
3. **Trusted Admin Identity**: Admin authority (`isAdmin()`) requires `request.auth.token.email_verified == true` AND either `request.auth.token.email == 'majedarsab@gmail.com'` (bootstrapped runtime owner) OR `exists(/databases/$(database)/documents/admins/$(request.auth.uid))`. Users can NEVER self-assign roles in `/users/{userId}` or `/admins/{adminId}`.
4. **Master Gate & Relational Sync**:
   - Creating a `SeatReservation` (`/shows/{showId}/seats/{seatId}`) requires the parent `/shows/{showId}` to exist with `status == 'scheduled'`, `seatId == incoming().seatCode`, `incoming().userId == request.auth.uid`, AND `existsAfter(/databases/$(database)/documents/bookings/$(incoming().bookingId))` to guarantee atomic booking creation.
   - Deleting a `SeatReservation` is permitted ONLY by the seat's `userId` (or `isAdmin()`) when cancelling the parent booking atomically (`getAfter(/databases/$(database)/documents/bookings/$(existing().bookingId)).data.status == 'cancelled'`).
5. **Bounded Arrays**: `Booking.seatCodes` is strictly bounded (`size() >= 1 && size() <= 10`) with element type validation (`seatCodes[0] is string`). Unbounded seat lists on shows are prohibited in favor of `/shows/{showId}/seats/{seatId}`.
6. **Terminal State Locking**:
   - Once a `Booking` reaches `status == 'cancelled'`, no further non-admin updates are permitted.
   - Once a `Payment` reaches `status == 'refunded'`, no further non-admin updates are permitted.
7. **Temporal Integrity & Immutability**: All `createdAt` fields must equal `request.time` on `create` and remain immutable (`incoming().createdAt == existing().createdAt`) on `update`. All `updatedAt` fields must equal `request.time` on `update`.
8. **Query Enforcer on List Operations**: Private collections (`/bookings`, `/payments`, `/notifications`) enforce `resource.data.userId == request.auth.uid` (or `isAdmin()`) directly inside `allow list` without any `get()`/`exists()` O(n) cost leaks. Public catalog collections (`/movies`, `/theatres`, `/shows`, `/shows/{showId}/seats`) restrict `list` to non-archived/public records with zero PII.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 — Privilege Escalation via Shadow Role Field (`/users/u1`)**:
   ```json
   { "uid": "u1", "displayName": "Attacker", "city": "Mumbai", "isAdmin": true, "createdAt": "SERVER_TIME", "updatedAt": "SERVER_TIME" }
   ```
   *Expected*: `PERMISSION_DENIED` (blocked by `hasOnly` key allowlist).

2. **Payload 2 — Unverified Admin Email Spoof (`/movies/m99`)**:
   Auth token `{ uid: "spoof1", email: "majedarsab@gmail.com", email_verified: false }` attempting to create a movie.
   *Expected*: `PERMISSION_DENIED` (blocked by `request.auth.token.email_verified == true` check).

3. **Payload 3 — Cross-User PII Scrape (`/users/victim1/private/info`)**:
   Authenticated user `attacker1` issuing `get` on `/users/victim1/private/info`.
   *Expected*: `PERMISSION_DENIED` (blocked by `isOwner(userId) || isAdmin()`).

4. **Payload 4 — Blanket List Scraping on Bookings (`/bookings`)**:
   Authenticated user `attacker1` issuing `getDocs(collection(db, 'bookings'))` without `where('userId', '==', 'attacker1')`.
   *Expected*: `PERMISSION_DENIED` (blocked by `resource.data.userId == request.auth.uid` in `allow list`).

5. **Payload 5 — Identity Spoofing on Booking Creation (`/bookings/b1`)**:
   User `attacker1` creating a booking with `userId: "victim1"`.
   *Expected*: `PERMISSION_DENIED` (blocked by `data.userId == request.auth.uid`).

6. **Payload 6 — Orphaned Seat Lock Without Atomic Booking (`/shows/s1/seats/A1`)**:
   User `u1` creating `/shows/s1/seats/A1` pointing to a non-existent `bookingId: "fake_b1"`.
   *Expected*: `PERMISSION_DENIED` (blocked by `existsAfter(.../bookings/$(incoming().bookingId))`).

7. **Payload 7 — Denial of Wallet / 1MB ID Poisoning (`/bookings/AAAA...200_chars`)**:
   User `u1` creating a document with a 200-character ID or 50,000-character `movieTitle`.
   *Expected*: `PERMISSION_DENIED` (blocked by `isValidId()` `size() <= 128` and `movieTitle.size() <= 120`).

8. **Payload 8 — Unbounded Seat Array Injection (`/bookings/b2`)**:
   User `u1` submitting `seatCodes` with 25 seats (`size() == 25`).
   *Expected*: `PERMISSION_DENIED` (blocked by `data.seatCodes.size() <= 10`).

9. **Payload 9 — Terminal State Reversal (`/bookings/b1` update)**:
   User `u1` attempting to update an already `'cancelled'` booking back to `'confirmed'`.
   *Expected*: `PERMISSION_DENIED` (blocked by `existing().status == 'confirmed'` terminal lock).

10. **Payload 10 — Value Poisoning on Update (`/bookings/b1` update)**:
    User `u1` updating `status` to `12345` or modifying `totalAmount` to `0` during cancellation.
    *Expected*: `PERMISSION_DENIED` (blocked by `isValidBooking(incoming())` + `affectedKeys().hasOnly(['status', 'updatedAt'])`).

11. **Payload 11 — Forged Client Backdated Timestamp (`/bookings/b3` create)**:
    User `u1` passing `createdAt: Timestamp(2020, 1, 1)` instead of `serverTimestamp()`.
    *Expected*: `PERMISSION_DENIED` (blocked by `incoming().createdAt == request.time`).

12. **Payload 12 — SeatHijack Overwrite (`/shows/s1/seats/A1` update/delete)**:
    User `attacker1` attempting to delete or overwrite `userId` on an already booked seat `A1` owned by `victim1`.
    *Expected*: `PERMISSION_DENIED` (`allow update: if false` on seats; `allow delete` checks `existing().userId == request.auth.uid`).
