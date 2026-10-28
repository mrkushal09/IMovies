import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { buildInitialShows, INITIAL_MOVIES, INITIAL_THEATRES } from '../data/seedCatalog';
import { MovieItem, PaymentMethod, SeatTier, ShowItem, TheatreItem } from '../types';

function clampStr(val: string, maxLen: number): string {
  return String(val || '').trim().slice(0, maxLen);
}

/**
 * Ensures the authenticated user's split public/private profile exists in Firestore,
 * strictly enforcing PII isolation.
 */
export async function syncUserProfile(user: User, preferredCity = 'Mumbai'): Promise<void> {
  if (!user.uid || !user.emailVerified) return;

  const publicRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');

  try {
    const existingSnap = await getDoc(publicRef);
    const displayName = clampStr(user.displayName || user.email?.split('@')[0] || 'Cinema Patron', 80);
    const photoURL = clampStr(user.photoURL || '', 500);
    const email = clampStr(user.email || 'patron@imovies.app', 254);

    if (!existingSnap.exists()) {
      const batch = writeBatch(db);
      batch.set(publicRef, {
        uid: user.uid,
        displayName,
        ...(photoURL ? { photoURL } : {}),
        city: clampStr(preferredCity, 50),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(privateRef, {
        uid: user.uid,
        email,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

/**
 * Idempotently seeds initial movies, theatres, and multi-city showtimes into Firestore
 * if the catalog is empty when an authenticated verified user visits.
 */
export async function ensureCatalogSeeded(isVerifiedUser: boolean): Promise<void> {
  if (!isVerifiedUser) return;

  try {
    const moviesQuery = query(collection(db, 'movies'), where('status', 'in', ['now_showing', 'coming_soon']));
    const snap = await getDocs(moviesQuery);
    if (!snap.empty) return;

    const batch = writeBatch(db);

    for (const m of INITIAL_MOVIES) {
      const mRef = doc(db, 'movies', m.id);
      batch.set(mRef, {
        title: clampStr(m.title, 120),
        synopsis: clampStr(m.synopsis, 1200),
        genre: clampStr(m.genre, 60),
        language: clampStr(m.language, 40),
        format: clampStr(m.format, 40),
        certificate: m.certificate,
        durationMins: m.durationMins,
        rating: m.rating,
        votesCount: m.votesCount,
        releaseDate: clampStr(m.releaseDate, 20),
        director: clampStr(m.director, 80),
        castSummary: clampStr(m.castSummary, 240),
        posterUrl: clampStr(m.posterUrl, 500),
        ...(m.backdropUrl ? { backdropUrl: clampStr(m.backdropUrl, 500) } : {}),
        status: m.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const t of INITIAL_THEATRES) {
      const tRef = doc(db, 'theatres', t.id);
      batch.set(tRef, {
        name: clampStr(t.name, 120),
        city: clampStr(t.city, 50),
        address: clampStr(t.address, 240),
        amenities: clampStr(t.amenities, 200),
        screensCount: t.screensCount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const initialShows = buildInitialShows();
    for (const s of initialShows) {
      const sRef = doc(db, 'shows', s.id);
      batch.set(sRef, {
        movieId: s.movieId,
        movieTitle: clampStr(s.movieTitle, 120),
        theatreId: s.theatreId,
        theatreName: clampStr(s.theatreName, 120),
        city: clampStr(s.city, 50),
        screenName: clampStr(s.screenName, 60),
        format: clampStr(s.format, 40),
        language: clampStr(s.language, 40),
        showDate: s.showDate,
        showTime: clampStr(s.showTime, 12),
        classicPrice: s.classicPrice,
        primePrice: s.primePrice,
        reclinerPrice: s.reclinerPrice,
        totalSeats: s.totalSeats,
        status: 'scheduled',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    // Ignore benign race if two sessions seed simultaneously
    console.warn('Catalog seed check completed:', error);
  }
}

export interface CreateBookingParams {
  userId: string;
  show: ShowItem;
  movie: MovieItem;
  selectedSeats: { code: string; tier: SeatTier; price: number }[];
  method: PaymentMethod;
  transactionRef: string;
  bookingCode: string;
}

/**
 * Atomically writes:
 * 1. /payments/{paymentId}
 * 2. /bookings/{bookingId}
 * 3. /shows/{showId}/seats/{seatCode} for each selected seat
 * 4. /notifications/{notificationId}
 */
export async function commitBookingTransaction(params: CreateBookingParams): Promise<string> {
  const { userId, show, movie, selectedSeats, method, transactionRef, bookingCode } = params;

  const cleanRand = Math.random().toString(36).substring(2, 10);
  const bookingId = `bkg_${Date.now()}_${cleanRand}`;
  const paymentId = `pay_${Date.now()}_${cleanRand}`;
  const notifId = `ntf_${Date.now()}_${cleanRand}`;

  const seatCodes = selectedSeats.map((s) => s.code);
  const subtotalAmount = selectedSeats.reduce((acc, s) => acc + s.price, 0);
  const convenienceFee = Math.round(selectedSeats.length * 35);
  const totalAmount = subtotalAmount + convenienceFee;

  try {
    // Double-check none of the seats were committed in Firestore in the last millisecond
    const seatsPath = `shows/${show.id}/seats`;
    for (const s of selectedSeats) {
      const seatSnap = await getDoc(doc(db, seatsPath, s.code));
      if (seatSnap.exists()) {
        throw new Error(`Seat ${s.code} was just booked by another patron. Please pick another seat.`);
      }
    }

    const batch = writeBatch(db);

    const paymentRef = doc(db, 'payments', paymentId);
    batch.set(paymentRef, {
      userId,
      bookingId,
      amount: totalAmount,
      currency: 'INR',
      method,
      transactionRef: clampStr(transactionRef, 64),
      status: 'succeeded',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const bookingRef = doc(db, 'bookings', bookingId);
    batch.set(bookingRef, {
      userId,
      showId: show.id,
      movieId: movie.id,
      movieTitle: clampStr(movie.title, 120),
      posterUrl: clampStr(movie.posterUrl, 500),
      theatreName: clampStr(show.theatreName, 120),
      city: clampStr(show.city, 50),
      screenName: clampStr(show.screenName, 60),
      format: clampStr(show.format, 40),
      showDate: show.showDate,
      showTime: clampStr(show.showTime, 12),
      seatCodes,
      seatCount: seatCodes.length,
      subtotalAmount,
      convenienceFee,
      totalAmount,
      paymentId,
      bookingCode: clampStr(bookingCode, 24),
      status: 'confirmed',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const s of selectedSeats) {
      const seatRef = doc(db, 'shows', show.id, 'seats', s.code);
      batch.set(seatRef, {
        seatCode: s.code,
        tier: s.tier,
        price: s.price,
        showId: show.id,
        bookingId,
        userId,
        status: 'booked',
        createdAt: serverTimestamp(),
      });
    }

    const notifRef = doc(db, 'notifications', notifId);
    batch.set(notifRef, {
      userId,
      title: 'Tickets Confirmed',
      message: clampStr(
        `${movie.title} (${seatCodes.join(', ')}) at ${show.theatreName} on ${show.showDate} · ${show.showTime}. Code: ${bookingCode}`,
        400
      ),
      type: 'booking_confirmed',
      read: false,
      relatedBookingId: bookingId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return bookingId;
  } catch (error) {
    if (error instanceof Error && error.message.includes('was just booked')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `bookings/${bookingId}`);
  }
}

/**
 * Atomically cancels a confirmed booking, refunds its payment record,
 * releases all reserved seats in `/shows/{showId}/seats`, and logs a notification.
 */
export async function cancelBookingAtomically(params: {
  bookingId: string;
  paymentId: string;
  showId: string;
  seatCodes: string[];
  movieTitle: string;
  bookingCode: string;
  userId: string;
}): Promise<void> {
  const { bookingId, paymentId, showId, seatCodes, movieTitle, bookingCode, userId } = params;
  const notifId = `ntf_cancel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    const batch = writeBatch(db);

    const bookingRef = doc(db, 'bookings', bookingId);
    batch.update(bookingRef, {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });

    const paymentRef = doc(db, 'payments', paymentId);
    batch.update(paymentRef, {
      status: 'refunded',
      updatedAt: serverTimestamp(),
    });

    for (const code of seatCodes) {
      const seatRef = doc(db, 'shows', showId, 'seats', code);
      batch.delete(seatRef);
    }

    const notifRef = doc(db, 'notifications', notifId);
    batch.set(notifRef, {
      userId,
      title: 'Booking Cancelled & Refunded',
      message: clampStr(
        `Reservation ${bookingCode} for ${movieTitle} (${seatCodes.join(', ')}) has been cancelled and full refund initiated.`,
        400
      ),
      type: 'booking_cancelled',
      read: false,
      relatedBookingId: bookingId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

// ---------------------------------------------------------------------------
// Admin CRUD Operations (Movies, Theatres, Shows)
// ---------------------------------------------------------------------------

export async function adminCreateMovie(input: Omit<MovieItem, 'id'>): Promise<string> {
  const movieId = `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  try {
    await setDoc(doc(db, 'movies', movieId), {
      title: clampStr(input.title, 120),
      synopsis: clampStr(input.synopsis, 1200),
      genre: clampStr(input.genre, 60),
      language: clampStr(input.language, 40),
      format: clampStr(input.format, 40),
      certificate: input.certificate,
      durationMins: Number(input.durationMins) || 120,
      rating: Number(input.rating) || 8.5,
      votesCount: Number(input.votesCount) || 100,
      releaseDate: clampStr(input.releaseDate, 20),
      director: clampStr(input.director, 80),
      castSummary: clampStr(input.castSummary, 240),
      posterUrl: clampStr(input.posterUrl, 500),
      ...(input.backdropUrl ? { backdropUrl: clampStr(input.backdropUrl, 500) } : {}),
      status: input.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return movieId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `movies/${movieId}`);
  }
}

export async function adminArchiveMovie(movieId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'movies', movieId), {
      status: 'archived',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `movies/${movieId}`);
  }
}

export async function adminCreateTheatre(input: Omit<TheatreItem, 'id'>): Promise<string> {
  const theatreId = `th_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  try {
    await setDoc(doc(db, 'theatres', theatreId), {
      name: clampStr(input.name, 120),
      city: clampStr(input.city, 50),
      address: clampStr(input.address, 240),
      amenities: clampStr(input.amenities, 200),
      screensCount: Math.min(30, Math.max(1, Number(input.screensCount) || 4)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return theatreId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `theatres/${theatreId}`);
  }
}

export async function adminDeleteTheatre(theatreId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'theatres', theatreId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `theatres/${theatreId}`);
  }
}

export async function adminCreateShow(input: Omit<ShowItem, 'id' | 'status'>): Promise<string> {
  const showId = `sh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  try {
    await setDoc(doc(db, 'shows', showId), {
      movieId: input.movieId,
      movieTitle: clampStr(input.movieTitle, 120),
      theatreId: input.theatreId,
      theatreName: clampStr(input.theatreName, 120),
      city: clampStr(input.city, 50),
      screenName: clampStr(input.screenName, 60),
      format: clampStr(input.format, 40),
      language: clampStr(input.language, 40),
      showDate: input.showDate,
      showTime: clampStr(input.showTime, 12),
      classicPrice: Math.min(5000, Math.max(50, Number(input.classicPrice) || 220)),
      primePrice: Math.min(5000, Math.max(50, Number(input.primePrice) || 350)),
      reclinerPrice: Math.min(5000, Math.max(50, Number(input.reclinerPrice) || 600)),
      totalSeats: 96,
      status: 'scheduled',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return showId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `shows/${showId}`);
  }
}

export async function adminCancelShow(showId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'shows', showId), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `shows/${showId}`);
  }
}
