/**
 * Firestore Security Rules Specification & Red-Team Verification Suite
 * Verifies that all 12 "Dirty Dozen" adversarial payloads are rejected by the
 * hardened invariants defined in firestore.rules.
 */

export interface DirtyPayloadCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
  enforcedByRuleGate: string;
}

export const DIRTY_DOZEN_CASES: DirtyPayloadCase[] = [
  {
    id: 1,
    name: 'Shadow Role Field Injection on User Profile',
    collectionPath: '/users/u1',
    operation: 'create',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    payload: {
      uid: 'u1',
      displayName: 'Attacker',
      city: 'Mumbai',
      isAdmin: true,
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'data.keys().hasOnly([uid, displayName, photoURL, city, createdAt, updatedAt])',
  },
  {
    id: 2,
    name: 'Unverified Admin Email Spoof on Movie Catalog',
    collectionPath: '/movies/m_spoof',
    operation: 'create',
    auth: { uid: 'spoof1', email: 'majedarsab@gmail.com', email_verified: false },
    payload: { title: 'Spoofed Movie' },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'isVerifiedUser() -> request.auth.token.email_verified == true',
  },
  {
    id: 3,
    name: 'Cross-User PII Read on Split Private Subcollection',
    collectionPath: '/users/victim1/private/info',
    operation: 'get',
    auth: { uid: 'attacker1', email: 'attacker@example.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'isOwner(userId) || isAdmin()',
  },
  {
    id: 4,
    name: 'Unfiltered List Query Scraping on Bookings',
    collectionPath: '/bookings',
    operation: 'list',
    auth: { uid: 'attacker1', email: 'attacker@example.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'resource.data.userId == request.auth.uid || isAdmin()',
  },
  {
    id: 5,
    name: 'Identity Spoofing on Booking Creation',
    collectionPath: '/bookings/b_spoof',
    operation: 'create',
    auth: { uid: 'attacker1', email: 'attacker@example.com', email_verified: true },
    payload: { userId: 'victim1', showId: 'show_1' },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'incoming().userId == request.auth.uid',
  },
  {
    id: 6,
    name: 'Orphaned Seat Lock Without Atomic Booking Batch',
    collectionPath: '/shows/show_1/seats/A1',
    operation: 'create',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    payload: { seatCode: 'A1', bookingId: 'non_existent_booking', userId: 'u1' },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'existsAfter(/databases/$(database)/documents/bookings/$(incoming().bookingId))',
  },
  {
    id: 7,
    name: 'ID Poisoning with 200-Char Document ID',
    collectionPath: `/bookings/${'X'.repeat(200)}`,
    operation: 'create',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    payload: { userId: 'u1' },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'isValidId(bookingId) -> id.size() <= 128',
  },
  {
    id: 8,
    name: 'Unbounded Seat Array Exhaustion (>10 Seats)',
    collectionPath: '/bookings/b_overflow',
    operation: 'create',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    payload: {
      userId: 'u1',
      seatCodes: Array.from({ length: 25 }, (_, i) => `A${i + 1}`),
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'data.seatCodes.size() >= 1 && data.seatCodes.size() <= 10',
  },
  {
    id: 9,
    name: 'Terminal State Reversal (Cancelled -> Confirmed)',
    collectionPath: '/bookings/b_cancelled',
    operation: 'update',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    payload: { status: 'confirmed', updatedAt: 'REQUEST_TIME' },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'existing().status == "confirmed" && incoming().status == "cancelled"',
  },
  {
    id: 10,
    name: 'Value Poisoning Price Tampering on Booking Update',
    collectionPath: '/bookings/b_active',
    operation: 'update',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    payload: { status: 'cancelled', totalAmount: 0, updatedAt: 'REQUEST_TIME' },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'incoming().diff(existing()).affectedKeys().hasOnly(["status", "updatedAt"])',
  },
  {
    id: 11,
    name: 'Backdated Client Timestamp Forgery',
    collectionPath: '/bookings/b_forged_time',
    operation: 'create',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    payload: { userId: 'u1', createdAt: '2020-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'incoming().createdAt == request.time',
  },
  {
    id: 12,
    name: 'Cross-User Seat Reservation Deletion Hijack',
    collectionPath: '/shows/show_1/seats/A1',
    operation: 'delete',
    auth: { uid: 'attacker1', email: 'attacker@example.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRuleGate: 'existing().userId == request.auth.uid && getAfter(booking).status == "cancelled"',
  },
];
