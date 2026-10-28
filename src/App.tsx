/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock,
  MapPin,
  Search,
  Star,
  Ticket,
  X,
} from 'lucide-react';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  BookingItem,
  MovieItem,
  NotificationRecord,
  PaymentItem,
  ShowItem,
  TheatreItem,
} from './types';
import {
  buildInitialShows,
  CITIES,
  getUpcomingDates,
  HERO_BACKDROP_IMAGE,
  INITIAL_MOVIES,
  INITIAL_THEATRES,
} from './data/seedCatalog';
import {
  ensureCatalogSeeded,
  markNotificationRead,
  syncUserProfile,
} from './services/cinemaService';
import { NavTab, TopNav } from './components/TopNav';
import { ResilientPoster } from './components/ResilientPoster';
import { SeatBookingView } from './components/SeatBookingView';
import { BookingsView } from './components/BookingsView';
import { AdminStudioView } from './components/AdminStudioView';

interface ToastBanner {
  id: number;
  message: string;
  variant: 'success' | 'error' | 'info';
}

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  return Date.now();
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Navigation & View Flow State
  const [activeTab, setActiveTab] = useState<NavTab>('movies');
  const [selectedCity, setSelectedCity] = useState<string>('Mumbai');
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [highlightedBookingId, setHighlightedBookingId] = useState<string | null>(null);

  // Search & Filter Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [languageFilter, setLanguageFilter] = useState<string>('All');
  const [genreFilter, setGenreFilter] = useState<string>('All');
  const upcomingDates = useMemo(() => getUpcomingDates(4), []);
  const [selectedDateIso, setSelectedDateIso] = useState<string>(upcomingDates[0].iso);

  // Live Firestore Catalog State (with seamless fallback before first authenticated seed)
  const [dbMovies, setDbMovies] = useState<MovieItem[] | null>(null);
  const [dbTheatres, setDbTheatres] = useState<TheatreItem[] | null>(null);
  const [dbShows, setDbShows] = useState<ShowItem[] | null>(null);

  // User-Isolated Firestore Collections
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  // Toast Notification Queue
  const [toasts, setToasts] = useState<ToastBanner[]>([]);

  const pushToast = useCallback(
    (message: string, variant: 'success' | 'error' | 'info' = 'info') => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev.slice(-2), { id, message, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  // 1. Firebase Auth Listener & Admin Verification
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);

      if (currentUser && currentUser.emailVerified) {
        await syncUserProfile(currentUser, selectedCity);
        await ensureCatalogSeeded(true);

        const isOwnerEmail =
          currentUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
        if (isOwnerEmail) {
          setIsAdmin(true);
        } else {
          try {
            const adminSnap = await getDoc(doc(db, 'admins', currentUser.uid));
            setIsAdmin(adminSnap.exists());
          } catch {
            setIsAdmin(false);
          }
        }
      } else {
        setIsAdmin(false);
        setBookings([]);
        setPayments([]);
        setNotifications([]);
      }
    });
    return () => unsub();
  }, [selectedCity]);

  // 2. Public Catalog Real-time Listeners (Movies, Theatres, Shows)
  useEffect(() => {
    const moviesQ = query(
      collection(db, 'movies'),
      where('status', 'in', ['now_showing', 'coming_soon'])
    );
    const unsubMovies = onSnapshot(
      moviesQ,
      (snap) => {
        if (!snap.empty) {
          setDbMovies(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<MovieItem, 'id'>),
            }))
          );
        } else {
          setDbMovies(null);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'movies')
    );

    const theatresQ = query(collection(db, 'theatres'), where('screensCount', '>=', 1));
    const unsubTheatres = onSnapshot(
      theatresQ,
      (snap) => {
        if (!snap.empty) {
          setDbTheatres(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<TheatreItem, 'id'>),
            }))
          );
        } else {
          setDbTheatres(null);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'theatres')
    );

    const showsQ = query(collection(db, 'shows'), where('status', '==', 'scheduled'));
    const unsubShows = onSnapshot(
      showsQ,
      (snap) => {
        if (!snap.empty) {
          setDbShows(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<ShowItem, 'id'>),
            }))
          );
        } else {
          setDbShows(null);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'shows')
    );

    return () => {
      unsubMovies();
      unsubTheatres();
      unsubShows();
    };
  }, []);

  // 3. Authenticated User Listeners (Bookings, Payments, Notifications)
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;

    const bookingsQ = query(collection(db, 'bookings'), where('userId', '==', user.uid));
    const unsubBookings = onSnapshot(
      bookingsQ,
      (snap) => {
        const items: BookingItem[] = snap.docs
          .map((d) => {
            const raw = d.data();
            return {
              id: d.id,
              userId: raw.userId,
              showId: raw.showId,
              movieId: raw.movieId,
              movieTitle: raw.movieTitle,
              posterUrl: raw.posterUrl,
              theatreName: raw.theatreName,
              city: raw.city,
              screenName: raw.screenName,
              format: raw.format,
              showDate: raw.showDate,
              showTime: raw.showTime,
              seatCodes: raw.seatCodes || [],
              seatCount: raw.seatCount,
              subtotalAmount: raw.subtotalAmount,
              convenienceFee: raw.convenienceFee,
              totalAmount: raw.totalAmount,
              paymentId: raw.paymentId,
              bookingCode: raw.bookingCode,
              status: raw.status,
              createdAtMs: toMillis(raw.createdAt),
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setBookings(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bookings')
    );

    const paymentsQ = query(collection(db, 'payments'), where('userId', '==', user.uid));
    const unsubPayments = onSnapshot(
      paymentsQ,
      (snap) => {
        const items: PaymentItem[] = snap.docs.map((d) => {
          const raw = d.data();
          return {
            id: d.id,
            userId: raw.userId,
            bookingId: raw.bookingId,
            amount: raw.amount,
            currency: raw.currency,
            method: raw.method,
            transactionRef: raw.transactionRef,
            status: raw.status,
            createdAtMs: toMillis(raw.createdAt),
          };
        });
        setPayments(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
    );

    const notifsQ = query(collection(db, 'notifications'), where('userId', '==', user.uid));
    const unsubNotifs = onSnapshot(
      notifsQ,
      (snap) => {
        const items: NotificationRecord[] = snap.docs
          .map((d) => {
            const raw = d.data();
            return {
              id: d.id,
              userId: raw.userId,
              title: raw.title,
              message: raw.message,
              type: raw.type,
              read: Boolean(raw.read),
              relatedBookingId: raw.relatedBookingId,
              createdAtMs: toMillis(raw.createdAt),
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setNotifications(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    return () => {
      unsubBookings();
      unsubPayments();
      unsubNotifs();
    };
  }, [authReady, user]);

  // Resolved Catalogs (Firestore live data or deterministic seed prior to first auth write)
  const movies = useMemo(() => dbMovies ?? INITIAL_MOVIES, [dbMovies]);
  const theatres = useMemo(() => dbTheatres ?? INITIAL_THEATRES, [dbTheatres]);
  const fallbackShows = useMemo(() => buildInitialShows(), []);
  const shows = useMemo(() => dbShows ?? fallbackShows, [dbShows, fallbackShows]);

  // Sign In / Sign Out Handler
  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      pushToast('Signed in successfully.', 'success');
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : 'Google Sign-In was cancelled.',
        'error'
      );
    }
  };

  const handleAuthAction = async () => {
    if (user) {
      await signOut(auth);
      setActiveTab('movies');
      pushToast('Signed out of IMovies.', 'info');
    } else {
      await handleSignIn();
    }
  };

  // Filtered Movies List
  const languagesList = useMemo(() => {
    const unique = Array.from(new Set(movies.map((m) => m.language)));
    return ['All', ...unique];
  }, [movies]);

  const genresList = useMemo(() => {
    const tokens = new Set<string>();
    movies.forEach((m) => {
      m.genre.split('·').forEach((part) => {
        const clean = part.trim();
        if (clean) tokens.add(clean);
      });
    });
    return ['All', ...Array.from(tokens)];
  }, [movies]);

  const filteredMovies = useMemo(() => {
    return movies.filter((m) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        m.title.toLowerCase().includes(q) ||
        m.genre.toLowerCase().includes(q) ||
        m.director.toLowerCase().includes(q) ||
        m.castSummary.toLowerCase().includes(q);
      const matchesLang = languageFilter === 'All' || m.language === languageFilter;
      const matchesGenre = genreFilter === 'All' || m.genre.includes(genreFilter);
      return matchesQuery && matchesLang && matchesGenre;
    });
  }, [movies, searchQuery, languageFilter, genreFilter]);

  const featuredMovie = movies[0] || INITIAL_MOVIES[0];
  const activeMovie = useMemo(
    () => movies.find((m) => m.id === selectedMovieId) || null,
    [movies, selectedMovieId]
  );
  const activeShow = useMemo(
    () => shows.find((s) => s.id === selectedShowId) || null,
    [shows, selectedShowId]
  );

  // Group showtimes by theatre for the active movie + city + date
  const groupedShowsByTheatre = useMemo(() => {
    if (!activeMovie) return [];
    const matching = shows.filter(
      (s) =>
        s.movieId === activeMovie.id &&
        s.city === selectedCity &&
        s.showDate === selectedDateIso &&
        s.status === 'scheduled'
    );

    const map = new Map<string, { theatreName: string; theatre: TheatreItem | undefined; items: ShowItem[] }>();
    matching.forEach((s) => {
      const existing = map.get(s.theatreId);
      if (existing) {
        existing.items.push(s);
      } else {
        map.set(s.theatreId, {
          theatreName: s.theatreName,
          theatre: theatres.find((t) => t.id === s.theatreId),
          items: [s],
        });
      }
    });
    return Array.from(map.values());
  }, [activeMovie, shows, selectedCity, selectedDateIso, theatres]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleSelectNavTab = (tab: NavTab) => {
    setSelectedShowId(null);
    if (tab !== 'movies') {
      setSelectedMovieId(null);
    }
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-50">
      {/* Strict 3-Zone Top Bar */}
      <TopNav
        activeTab={activeTab}
        onSelectTab={handleSelectNavTab}
        user={user}
        isAdmin={isAdmin}
        unreadNotificationsCount={unreadCount}
        onAuthAction={handleAuthAction}
      />

      {/* Floating Non-Intrusive Toast Stack */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border shadow-lg text-xs font-medium backdrop-blur-md ${
                t.variant === 'success'
                  ? 'bg-zinc-900/95 border-emerald-500/50 text-emerald-200'
                  : t.variant === 'error'
                  ? 'bg-zinc-900/95 border-rose-500/60 text-rose-200'
                  : 'bg-zinc-900/95 border-zinc-700 text-zinc-100'
              }`}
            >
              <span>{t.message}</span>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
                className="text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Content Router */}
      <main className="flex-1">
        {/* 1. Seat Selection & Checkout Screen */}
        {activeShow && activeMovie ? (
          <SeatBookingView
            movie={activeMovie}
            show={activeShow}
            user={user}
            onRequireSignIn={handleSignIn}
            onBack={() => setSelectedShowId(null)}
            onBookingConfirmed={(bookingId) => {
              setSelectedShowId(null);
              setSelectedMovieId(null);
              setHighlightedBookingId(bookingId);
              setActiveTab('bookings');
            }}
            onNotify={pushToast}
          />
        ) : activeTab === 'movies' && activeMovie ? (
          /* 2. Movie Details & Theatre Showtime Selection Screen */
          <div>
            {/* Movie Backdrop Showcase */}
            <section className="relative border-b border-zinc-800/80 overflow-hidden">
              <div className="absolute inset-0">
                <img
                  src={activeMovie.backdropUrl || HERO_BACKDROP_IMAGE}
                  alt={activeMovie.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover opacity-25"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/85 to-zinc-950/60" />
              </div>

              <div className="relative max-w-7xl mx-auto px-6 lg:px-10 py-10">
                <button
                  type="button"
                  onClick={() => setSelectedMovieId(null)}
                  className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-100 mb-6 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>All Movies</span>
                </button>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-end">
                  <div className="md:col-span-3 max-w-[240px]">
                    <ResilientPoster
                      src={activeMovie.posterUrl}
                      alt={activeMovie.title}
                      title={activeMovie.title}
                      className="w-full aspect-[3/4] object-cover rounded-xl border border-zinc-800 shadow-xl"
                    />
                  </div>

                  <div className="md:col-span-9 space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums font-semibold text-amber-400">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        {activeMovie.rating.toFixed(1)}/10
                      </span>
                      <span className="text-zinc-500 font-mono tabular-nums">
                        ({activeMovie.votesCount.toLocaleString()} votes)
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{activeMovie.certificate}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{activeMovie.durationMins} mins</span>
                      <span aria-hidden="true">·</span>
                      <span>{activeMovie.language}</span>
                      <span aria-hidden="true">·</span>
                      <span>{activeMovie.format}</span>
                    </div>

                    <h1
                      className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-zinc-50"
                      style={{ textWrap: 'balance' }}
                    >
                      {activeMovie.title}
                    </h1>

                    <p className="text-sm sm:text-base text-zinc-300 max-w-3xl leading-relaxed">
                      {activeMovie.synopsis}
                    </p>

                    <div className="pt-2 flex flex-wrap items-center gap-6 text-xs text-zinc-400">
                      <span>
                        Genre: <strong className="text-zinc-200 font-medium">{activeMovie.genre}</strong>
                      </span>
                      <span>
                        Director: <strong className="text-zinc-200 font-medium">{activeMovie.director}</strong>
                      </span>
                      <span>
                        Cast: <strong className="text-zinc-200 font-medium">{activeMovie.castSummary}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Showtimes Filter Toolbar (City + Date Tabs) */}
            <section className="max-w-7xl mx-auto px-6 lg:px-10 py-8">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
                {/* Date Selector Tabs */}
                <div className="flex items-center gap-2 overflow-x-auto">
                  {upcomingDates.map((d) => {
                    const active = selectedDateIso === d.iso;
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        onClick={() => setSelectedDateIso(d.iso)}
                        className={`px-4 py-2 rounded-lg border text-left transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'bg-rose-600 border-rose-500 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        <div className="text-[11px] opacity-85">{d.dayLabel}</div>
                        <div className="font-mono tabular-nums text-sm font-bold">
                          {d.dateNum} {d.monthLabel}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* City Switcher */}
                <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
                  {CITIES.map((city) => (
                    <button
                      key={city}
                      type="button"
                      onClick={() => setSelectedCity(city)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        selectedCity === city
                          ? 'bg-zinc-800 text-zinc-50 shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>

              {/* Theatre Showtime Matrix */}
              {groupedShowsByTheatre.length === 0 ? (
                <div className="py-16 text-center">
                  <Clock className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
                  <h3 className="font-display text-lg font-semibold text-zinc-200">
                    No screenings scheduled for {selectedDateIso} in {selectedCity}
                  </h3>
                  <p className="text-sm text-zinc-400 mt-1">
                    Try selecting an earlier date tab or switching cities above.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/80">
                  {groupedShowsByTheatre.map((group) => (
                    <div
                      key={group.theatreName}
                      className="py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center"
                    >
                      <div className="lg:col-span-5">
                        <h3 className="font-display text-base font-bold text-zinc-100">
                          {group.theatreName}
                        </h3>
                        {group.theatre && (
                          <>
                            <p className="text-xs text-zinc-400 mt-1">{group.theatre.address}</p>
                            <p className="text-xs text-zinc-500 mt-1">{group.theatre.amenities}</p>
                          </>
                        )}
                      </div>

                      <div className="lg:col-span-7 flex flex-wrap items-center gap-3">
                        {group.items.map((showItem) => (
                          <button
                            key={showItem.id}
                            type="button"
                            onClick={() => setSelectedShowId(showItem.id)}
                            className="group px-4 py-2.5 bg-zinc-900 border border-zinc-700/90 hover:border-emerald-500 rounded-lg text-left transition-colors cursor-pointer"
                          >
                            <div className="font-mono tabular-nums text-sm font-semibold text-emerald-400 group-hover:text-emerald-300">
                              {showItem.showTime}
                            </div>
                            <div className="text-[11px] text-zinc-400 mt-0.5 whitespace-nowrap">
                              {showItem.screenName} · From ₹{showItem.classicPrice}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : activeTab === 'movies' ? (
          /* 3. Storefront Home: Premiere Hero + Workspace Discovery Bar + Curated Grid */
          <div>
            {/* Section 1: Premiere Split Hero */}
            <section className="relative border-b border-zinc-800/80 overflow-hidden">
              <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10 lg:py-14">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
                  {/* Left 6 Cols: Editorial Feature Copy */}
                  <div className="lg:col-span-6 flex flex-col justify-center space-y-5">
                    <div className="flex items-center gap-2 text-xs font-medium text-rose-400">
                      <span>IMAX Premiere Selection</span>
                      <span aria-hidden="true">·</span>
                      <span>{selectedCity} Theatres</span>
                      <span aria-hidden="true">·</span>
                      <span>{featuredMovie.format}</span>
                    </div>

                    <h1
                      className="font-display font-bold tracking-tight text-zinc-50 leading-[1.08]"
                      style={{
                        fontSize: 'clamp(2.25rem, 4vw, 3.5rem)',
                        textWrap: 'balance',
                      }}
                    >
                      {featuredMovie.title}
                    </h1>

                    <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-xl">
                      {featuredMovie.synopsis}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 font-mono tabular-nums">
                      <span className="inline-flex items-center gap-1 text-amber-400 font-semibold">
                        <Star className="h-3.5 w-3.5 fill-amber-400" />
                        {featuredMovie.rating.toFixed(1)}/10
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{featuredMovie.durationMins} mins</span>
                      <span aria-hidden="true">·</span>
                      <span>{featuredMovie.certificate}</span>
                      <span aria-hidden="true">·</span>
                      <span>{featuredMovie.genre}</span>
                    </div>

                    <div className="pt-2 flex flex-wrap items-center gap-4">
                      <button
                        type="button"
                        onClick={() => setSelectedMovieId(featuredMovie.id)}
                        className="px-6 py-3 text-sm font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Book Premiere Tickets
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('theatres')}
                        className="px-5 py-3 text-sm font-medium text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Explore {selectedCity} Cinemas
                      </button>
                    </div>
                  </div>

                  {/* Right 6 Cols: High-Contrast Auditorium Visual */}
                  <div className="lg:col-span-6 relative rounded-2xl overflow-hidden border border-zinc-800/90 min-h-[280px] lg:min-h-[380px]">
                    <img
                      src={HERO_BACKDROP_IMAGE}
                      alt="IMovies IMAX Auditorium"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent flex items-end p-6">
                      <div className="text-xs text-zinc-200">
                        <p className="font-semibold text-zinc-50">
                          Real-Time Seat Locking Across 5 Flagship Multiplexes
                        </p>
                        <p className="text-zinc-300 mt-0.5">
                          Instant QR m-Ticket delivery · Zero-conflict auditorium holds · Full cancellation refunds
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: Interactive Search, City & Genre Discovery Bar + 3-Col Movie Grid */}
            <section className="max-w-7xl mx-auto px-6 lg:px-10 py-12">
              {/* Discovery Filter Controls */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-8 border-b border-zinc-800/80">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                  <Search className="h-4 w-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search movies, genres, directors, or cast..."
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-rose-500"
                  />
                </div>

                {/* City + Language + Genre Segmented Filters */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* City Selector */}
                  <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
                    {CITIES.map((city) => (
                      <button
                        key={city}
                        type="button"
                        onClick={() => setSelectedCity(city)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          selectedCity === city
                            ? 'bg-zinc-800 text-zinc-50 shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {city}
                      </button>
                    ))}
                  </div>

                  {/* Language Filter */}
                  <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
                    {languagesList.map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setLanguageFilter(lang)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          languageFilter === lang
                            ? 'bg-zinc-800 text-zinc-50 shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Genre Sub-Filter Bar */}
              <div className="flex items-center justify-between gap-4 pt-6 pb-8">
                <div className="flex items-center gap-2 overflow-x-auto">
                  {genresList.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGenreFilter(g)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        genreFilter === g
                          ? 'bg-rose-600 border-rose-500 text-white'
                          : 'bg-zinc-900/70 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>

                <span className="text-xs font-mono tabular-nums text-zinc-500 whitespace-nowrap shrink-0">
                  {filteredMovies.length} {filteredMovies.length === 1 ? 'Release' : 'Releases'}
                </span>
              </div>

              {/* Uniform 3-Column Now Showing Grid */}
              {filteredMovies.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm text-zinc-400">
                    No movies matched your filter criteria.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setLanguageFilter('All');
                      setGenreFilter('All');
                    }}
                    className="mt-4 px-4 py-2 text-xs font-semibold text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                  {filteredMovies.map((movie) => (
                    <article
                      key={movie.id}
                      onClick={() => setSelectedMovieId(movie.id)}
                      className="group bg-zinc-900/50 border border-zinc-800/80 rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 hover:border-zinc-700 cursor-pointer flex flex-col"
                    >
                      <div className="relative aspect-[3/4] w-full bg-zinc-900 overflow-hidden">
                        <ResilientPoster
                          src={movie.posterUrl}
                          alt={movie.title}
                          title={movie.title}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 py-3 flex items-center justify-between text-xs font-mono tabular-nums">
                          <span className="inline-flex items-center gap-1 text-amber-400 font-semibold">
                            <Star className="h-3.5 w-3.5 fill-amber-400" />
                            {movie.rating.toFixed(1)}/10
                          </span>
                          <span className="text-zinc-300">
                            {(movie.votesCount / 1000).toFixed(1)}K votes
                          </span>
                        </div>
                      </div>

                      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                        <div>
                          {/* Unboxed Clean Metadata Kicker */}
                          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <span>{movie.language}</span>
                            <span aria-hidden="true">·</span>
                            <span>{movie.format}</span>
                            <span aria-hidden="true">·</span>
                            <span>{movie.certificate}</span>
                          </div>

                          <h2 className="font-display text-lg font-bold text-zinc-50 mt-1.5 group-hover:text-rose-400 transition-colors">
                            {movie.title}
                          </h2>

                          <p className="text-xs text-zinc-400 mt-1">{movie.genre}</p>
                        </div>

                        <div className="pt-3 border-t border-zinc-800/70 flex items-center justify-between">
                          <span className="text-xs font-mono tabular-nums text-zinc-400">
                            {movie.durationMins} mins
                          </span>
                          <span className="text-xs font-semibold text-rose-400 group-hover:text-rose-300">
                            View Showtimes →
                          </span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Section 3: Architectural Cinema Experience Assurance */}
            <section className="border-t border-zinc-900 bg-zinc-900/30">
              <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14 grid grid-cols-1 md:grid-cols-3 gap-8">
                <div>
                  <h3 className="font-display text-base font-bold text-zinc-100">
                    01. Live Auditorium Seat Sync
                  </h3>
                  <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                    Every seat tap broadcasts instant 5-minute holds across connected patrons via WebSockets and commits atomically to Firestore.
                  </p>
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-zinc-100">
                    02. Instant QR M-Ticket Entry
                  </h3>
                  <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                    Skip box-office queues with cryptographically referenced booking codes and scannable auditorium passes in My Tickets.
                  </p>
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-zinc-100">
                    03. One-Click Refund & Seat Release
                  </h3>
                  <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                    Plans changed? Cancel upcoming reservations in one click to immediately free auditorium seats and trigger payment refunds.
                  </p>
                </div>
              </div>
            </section>
          </div>
        ) : activeTab === 'theatres' ? (
          /* 4. Cinemas Directory View */
          <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
            <div className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-zinc-800/80">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-zinc-50">
                  Flagship Partner Cinemas
                </h1>
                <p className="text-sm text-zinc-400 mt-1">
                  Explore IMAX Laser, Dolby Atmos, and luxury recliner multiplexes by city.
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
                {['All Cities', ...CITIES].map((c) => {
                  const active =
                    (c === 'All Cities' && selectedCity === 'All') || selectedCity === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedCity(c === 'All Cities' ? 'All' : c)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-zinc-800 text-zinc-50 shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-8">
              {theatres
                .filter((t) => selectedCity === 'All' || t.city === selectedCity)
                .map((theatre) => {
                  const theatreShows = shows.filter(
                    (s) =>
                      s.theatreId === theatre.id &&
                      s.showDate === upcomingDates[0].iso &&
                      s.status === 'scheduled'
                  );

                  return (
                    <div
                      key={theatre.id}
                      className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-6 flex flex-col justify-between space-y-5"
                    >
                      <div>
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          <MapPin className="h-3.5 w-3.5 text-rose-400" />
                          <span>{theatre.city}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {theatre.screensCount} Screens
                          </span>
                        </div>
                        <h2 className="font-display text-lg font-bold text-zinc-50 mt-1.5">
                          {theatre.name}
                        </h2>
                        <p className="text-xs text-zinc-400 mt-1">{theatre.address}</p>
                        <p className="text-xs text-zinc-500 mt-2">{theatre.amenities}</p>
                      </div>

                      <div className="pt-4 border-t border-zinc-800/70">
                        <p className="text-xs font-medium text-zinc-300 mb-2.5">
                          Today’s Screenings ({theatreShows.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {theatreShows.slice(0, 4).map((sh) => (
                            <button
                              key={sh.id}
                              type="button"
                              onClick={() => {
                                if (selectedCity === 'All') setSelectedCity(theatre.city);
                                setSelectedMovieId(sh.movieId);
                                setSelectedShowId(sh.id);
                              }}
                              className="px-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 hover:border-emerald-500 rounded-lg text-left transition-colors cursor-pointer"
                            >
                              <span className="font-medium text-zinc-200">{sh.movieTitle}</span>
                              <span className="text-emerald-400 font-mono tabular-nums ml-2">
                                {sh.showTime}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : activeTab === 'bookings' ? (
          /* 5. Bookings & Cancellation View */
          !user ? (
            <div className="max-w-xl mx-auto px-6 py-24 text-center">
              <Ticket className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
              <h1 className="font-display text-2xl font-bold text-zinc-100">
                Sign in to view your tickets
              </h1>
              <p className="text-sm text-zinc-400 mt-2">
                Access your confirmed QR cinema passes, payment receipts, and instant seat cancellations across devices.
              </p>
              <button
                type="button"
                onClick={handleSignIn}
                className="mt-6 px-6 py-3 text-sm font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500 transition-colors cursor-pointer"
              >
                Sign In with Google
              </button>
            </div>
          ) : (
            <BookingsView
              bookings={bookings}
              payments={payments}
              highlightedBookingId={highlightedBookingId}
              onExploreMovies={() => setActiveTab('movies')}
              onNotify={pushToast}
            />
          )
        ) : activeTab === 'notifications' ? (
          /* 6. User Alerts & Transaction Notifications View */
          <div className="max-w-4xl mx-auto px-6 lg:px-10 py-10">
            <div className="pb-6 border-b border-zinc-800/80">
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-zinc-50">
                Booking & Refund Alerts
              </h1>
              <p className="text-sm text-zinc-400 mt-1">
                Real-time confirmation logs and refund updates for your account.
              </p>
            </div>

            {!user ? (
              <div className="py-20 text-center">
                <Bell className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-sm text-zinc-400">
                  Sign in to view your personalized booking notifications.
                </p>
                <button
                  type="button"
                  onClick={handleSignIn}
                  className="mt-5 px-5 py-2.5 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500 cursor-pointer"
                >
                  Sign In with Google
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-20 text-center text-sm text-zinc-400">
                No alerts yet. Your ticket confirmations and refunds will appear here automatically.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/80 pt-4">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="py-5 flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span
                          className={
                            n.type === 'booking_confirmed'
                              ? 'text-emerald-400 font-semibold'
                              : 'text-amber-300 font-semibold'
                          }
                        >
                          {n.title}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {new Date(n.createdAtMs).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-200">{n.message}</p>
                    </div>

                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => markNotificationRead(n.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Mark Read</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* 7. Admin Studio Management Panel */
          isAdmin && (
            <AdminStudioView
              movies={movies}
              theatres={theatres}
              shows={shows}
              onNotify={pushToast}
            />
          )
        )}
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-zinc-900 py-8 px-6 lg:px-10 text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} IMovies Cinema Ticketing Platform. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => handleSelectNavTab('movies')}
              className="hover:text-zinc-300 transition-colors cursor-pointer"
            >
              Now Showing
            </button>
            <button
              type="button"
              onClick={() => handleSelectNavTab('theatres')}
              className="hover:text-zinc-300 transition-colors cursor-pointer"
            >
              Partner Cinemas
            </button>
            <button
              type="button"
              onClick={() => handleSelectNavTab('bookings')}
              className="hover:text-zinc-300 transition-colors cursor-pointer"
            >
              My Tickets
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
