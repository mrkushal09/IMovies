import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, CreditCard, Lock, ShieldCheck, Smartphone, Users, Wallet } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { io, Socket } from 'socket.io-client';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { LiveSeatHold, MovieItem, PaymentMethod, SeatReservationItem, SeatTier, ShowItem } from '../types';
import { commitBookingTransaction } from '../services/cinemaService';
import { ResilientPoster } from './ResilientPoster';

interface SeatBookingViewProps {
  movie: MovieItem;
  show: ShowItem;
  user: User | null;
  onRequireSignIn: () => void;
  onBack: () => void;
  onBookingConfirmed: (bookingId: string) => void;
  onNotify: (message: string, variant?: 'success' | 'error' | 'info') => void;
}

interface SeatCell {
  code: string;
  row: string;
  col: number;
  tier: SeatTier;
  price: number;
}

const ROWS: { row: string; tier: SeatTier }[] = [
  { row: 'A', tier: 'classic' },
  { row: 'B', tier: 'classic' },
  { row: 'C', tier: 'classic' },
  { row: 'D', tier: 'prime' },
  { row: 'E', tier: 'prime' },
  { row: 'F', tier: 'prime' },
  { row: 'G', tier: 'recliner' },
  { row: 'H', tier: 'recliner' },
];

export const SeatBookingView: React.FC<SeatBookingViewProps> = ({
  movie,
  show,
  user,
  onRequireSignIn,
  onBack,
  onBookingConfirmed,
  onNotify,
}) => {
  const [bookedSeats, setBookedSeats] = useState<Record<string, SeatReservationItem>>({});
  const [liveHolds, setLiveHolds] = useState<LiveSeatHold[]>([]);
  const [socketRef, setSocketRef] = useState<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const [step, setStep] = useState<'seats' | 'payment'>('seats');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [upiHandle, setUpiHandle] = useState('patron@okicici');
  const [cardLastFour, setCardLastFour] = useState('4242');
  const [simulateDecline, setSimulateDecline] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Anonymous guest session ID for previewing holds if not signed in yet, or real UID
  const activeActorId = useMemo(
    () => user?.uid || `guest_${Math.random().toString(36).substring(2, 9)}`,
    [user?.uid]
  );
  const activeActorName = user?.displayName || user?.email?.split('@')[0] || 'Cinema Guest';

  // 1. Real-time Firestore listener on `/shows/{showId}/seats`
  useEffect(() => {
    const seatsPath = `shows/${show.id}/seats`;
    const seatsQuery = query(collection(db, seatsPath), where('status', '==', 'booked'));
    const unsub = onSnapshot(
      seatsQuery,
      (snap) => {
        const nextMap: Record<string, SeatReservationItem> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as Omit<SeatReservationItem, 'id'>;
          nextMap[data.seatCode] = { id: d.id, ...data };
        });
        setBookedSeats(nextMap);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, seatsPath);
      }
    );
    return () => unsub();
  }, [show.id]);

  // 2. Real-time Socket.io connection for live multi-user seat holds
  useEffect(() => {
    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    setSocketRef(socket);

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('show:join', { showId: show.id });
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('holds:sync', (payload: { showId: string; holds: LiveSeatHold[] }) => {
      if (payload.showId === show.id) {
        setLiveHolds(payload.holds);
      }
    });

    socket.on('seat:hold_rejected', (payload: { seatCode: string; reason: string }) => {
      onNotify(`${payload.seatCode}: ${payload.reason}`, 'error');
    });

    return () => {
      socket.emit('seat:release_user_holds', { showId: show.id, userId: activeActorId });
      socket.disconnect();
    };
  }, [show.id, activeActorId, onNotify]);

  // Build auditorium seat matrix (8 rows x 12 columns = 96 seats)
  const auditoriumRows = useMemo(() => {
    return ROWS.map(({ row, tier }) => {
      const price =
        tier === 'classic'
          ? show.classicPrice
          : tier === 'prime'
          ? show.primePrice
          : show.reclinerPrice;

      const cells: SeatCell[] = [];
      for (let col = 1; col <= 12; col++) {
        cells.push({
          code: `${row}${col}`,
          row,
          col,
          tier,
          price,
        });
      }
      return { row, tier, price, cells };
    });
  }, [show.classicPrice, show.primePrice, show.reclinerPrice]);

  const myHeldSeatCodes = useMemo(() => {
    return new Set(
      liveHolds.filter((h) => h.userId === activeActorId && !bookedSeats[h.seatCode]).map((h) => h.seatCode)
    );
  }, [liveHolds, activeActorId, bookedSeats]);

  const otherUserHolds = useMemo(() => {
    const map: Record<string, LiveSeatHold> = {};
    liveHolds.forEach((h) => {
      if (h.userId !== activeActorId && !bookedSeats[h.seatCode]) {
        map[h.seatCode] = h;
      }
    });
    return map;
  }, [liveHolds, activeActorId, bookedSeats]);

  const selectedSeatObjects = useMemo(() => {
    const flat: SeatCell[] = auditoriumRows.flatMap((r) => r.cells);
    return flat.filter((c) => myHeldSeatCodes.has(c.code));
  }, [auditoriumRows, myHeldSeatCodes]);

  const subtotalAmount = selectedSeatObjects.reduce((sum, s) => sum + s.price, 0);
  const convenienceFee = selectedSeatObjects.length * 35;
  const totalAmount = subtotalAmount + convenienceFee;

  const availableSeatsCount = 96 - Object.keys(bookedSeats).length;

  const handleToggleSeat = (cell: SeatCell) => {
    if (bookedSeats[cell.code]) return;
    if (otherUserHolds[cell.code]) {
      onNotify(`Seat ${cell.code} is currently held by another patron.`, 'info');
      return;
    }
    if (!socketRef) return;

    socketRef.emit('seat:toggle_hold', {
      showId: show.id,
      seatCode: cell.code,
      userId: activeActorId,
      userName: activeActorName,
    });
  };

  const handleProceedToCheckout = () => {
    if (selectedSeatObjects.length === 0) {
      onNotify('Select at least one seat to continue.', 'info');
      return;
    }
    if (!user) {
      onNotify('Please sign in with Google to reserve your selected seats.', 'info');
      onRequireSignIn();
      return;
    }
    setStep('payment');
  };

  const handleCompletePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireSignIn();
      return;
    }
    if (selectedSeatObjects.length === 0) {
      onNotify('Your seat selection expired. Please re-select seats.', 'error');
      setStep('seats');
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Server-side payment verification & rate-limited authorization
      const res = await fetch('/api/payments/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showId: show.id,
          seatCodes: selectedSeatObjects.map((s) => s.code),
          amount: totalAmount,
          method: paymentMethod,
          userId: user.uid,
          simulateFailure: simulateDecline,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Payment authorization declined.', 'error');
        setIsProcessing(false);
        return;
      }

      // 2. Atomic Firestore write (Payment + Booking + Individual Seat Locks + Notification)
      const bookingId = await commitBookingTransaction({
        userId: user.uid,
        show,
        movie,
        selectedSeats: selectedSeatObjects.map((s) => ({
          code: s.code,
          tier: s.tier,
          price: s.price,
        })),
        method: paymentMethod,
        transactionRef: data.transactionRef,
        bookingCode: data.bookingCode,
      });

      // 3. Release temporary Socket holds now that seats are permanently booked
      socketRef?.emit('seat:release_user_holds', { showId: show.id, userId: activeActorId });

      onNotify(`Booking ${data.bookingCode} confirmed!`, 'success');
      onBookingConfirmed(bookingId);
    } catch (error) {
      onNotify(
        error instanceof Error ? error.message : 'Unable to finalize booking. Please try again.',
        'error'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={step === 'payment' ? () => setStep('seats') : onBack}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{step === 'payment' ? 'Back to Seat Map' : 'Back to Showtimes'}</span>
          </button>
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-zinc-50">
              {movie.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mt-0.5">
              <span>{show.theatreName}</span>
              <span aria-hidden="true">·</span>
              <span>{show.screenName}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{show.showDate}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-zinc-200">{show.showTime}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-zinc-400 font-mono tabular-nums">
          <span>{availableSeatsCount} / 96 seats available</span>
          {socketConnected && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5 text-zinc-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Live Seat Sync
              </span>
            </>
          )}
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-8 items-start">
        {/* Left 8 Cols: Auditorium Seat Map OR Payment Form */}
        <div className="lg:col-span-8 bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-6 sm:p-8">
          {step === 'seats' ? (
            <div>
              {/* Curved Cinema Screen */}
              <div className="max-w-lg mx-auto mb-10 text-center">
                <div className="cinema-screen-arc w-full mb-2" />
                <p className="text-xs text-zinc-500 tracking-wide">
                  Screen this way · All eyes forward
                </p>
              </div>

              {/* Tier Pricing Reference */}
              <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-400 mb-8 pb-4 border-b border-zinc-800/60 font-mono tabular-nums">
                <span>Classic (Rows A–C): ₹{show.classicPrice}</span>
                <span aria-hidden="true">·</span>
                <span>Prime (Rows D–F): ₹{show.primePrice}</span>
                <span aria-hidden="true">·</span>
                <span className="text-amber-400">Recliner Suite (Rows G–H): ₹{show.reclinerPrice}</span>
              </div>

              {/* Auditorium Rows */}
              <div className="overflow-x-auto pb-2">
                <div className="min-w-[540px] space-y-3">
                  {auditoriumRows.map(({ row, tier, cells }) => (
                    <React.Fragment key={row}>
                      {row === 'D' && (
                        <div className="pt-3 pb-1 text-center text-xs text-zinc-500">
                          Prime Acoustic Tier — ₹{show.primePrice}
                        </div>
                      )}
                      {row === 'G' && (
                        <div className="pt-4 pb-1 text-center text-xs text-amber-400/90">
                          Luxury Recliner Suites — ₹{show.reclinerPrice}
                        </div>
                      )}
                      <div className="flex items-center justify-center gap-3">
                        <span className="w-5 text-xs font-mono font-semibold text-zinc-500 text-right">
                          {row}
                        </span>

                        <div className="flex items-center gap-1.5 sm:gap-2">
                          {cells.map((cell) => {
                            const isBooked = Boolean(bookedSeats[cell.code]);
                            const heldByOther = Boolean(otherUserHolds[cell.code]);
                            const isSelected = myHeldSeatCodes.has(cell.code);

                            // Add central aisle spacing after col 3 and col 9
                            const aisleMargin =
                              cell.col === 3 || cell.col === 9 ? 'mr-4 sm:mr-6' : '';

                            let seatClasses =
                              'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-rose-500 hover:text-white cursor-pointer';
                            let seatLabel = `${cell.code} Available ₹${cell.price}`;

                            if (isBooked) {
                              seatClasses =
                                'border-zinc-800/80 bg-zinc-800/40 text-zinc-600 cursor-not-allowed';
                              seatLabel = `${cell.code} Sold`;
                            } else if (heldByOther) {
                              seatClasses =
                                'border-amber-500/60 bg-amber-500/15 text-amber-300 cursor-not-allowed';
                              seatLabel = `${cell.code} Held by another patron`;
                            } else if (isSelected) {
                              seatClasses =
                                'border-rose-500 bg-rose-600 text-white shadow-sm cursor-pointer';
                              seatLabel = `${cell.code} Selected`;
                            } else if (tier === 'recliner') {
                              seatClasses =
                                'border-amber-500/40 bg-zinc-900 text-amber-200 hover:border-amber-400 cursor-pointer';
                            }

                            return (
                              <button
                                key={cell.code}
                                type="button"
                                disabled={isBooked || heldByOther}
                                title={seatLabel}
                                aria-label={seatLabel}
                                onClick={() => handleToggleSeat(cell)}
                                className={`h-8 w-8 sm:h-9 sm:w-9 rounded-t-lg rounded-b-sm border text-[11px] font-mono tabular-nums font-medium transition-transform duration-150 active:scale-95 flex items-center justify-center ${seatClasses} ${aisleMargin}`}
                              >
                                {isBooked ? '×' : isSelected ? <Check className="h-3.5 w-3.5" /> : cell.col}
                              </button>
                            );
                          })}
                        </div>

                        <span className="w-5 text-xs font-mono font-semibold text-zinc-500">
                          {row}
                        </span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Accessible Seat Legend (Color + Text/Symbol) */}
              <div className="mt-8 pt-5 border-t border-zinc-800/70 flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-400">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-t-md border border-zinc-700 bg-zinc-900 inline-flex items-center justify-center font-mono text-[10px] text-zinc-300">
                    1
                  </span>
                  <span>Available</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-t-md border border-rose-500 bg-rose-600 inline-flex items-center justify-center text-white">
                    <Check className="h-3 w-3" />
                  </span>
                  <span>Your Selection</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-t-md border border-amber-500/60 bg-amber-500/15 inline-flex items-center justify-center font-mono text-[10px] text-amber-300">
                    <Users className="h-3 w-3" />
                  </span>
                  <span>Live Hold (Other Patron)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-t-md border border-zinc-800 bg-zinc-800/40 inline-flex items-center justify-center font-mono text-[10px] text-zinc-600">
                    ×
                  </span>
                  <span>Sold</span>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCompletePayment} className="space-y-6">
              <div>
                <h2 className="font-display text-lg font-semibold text-zinc-100">
                  Complete Ticket Payment
                </h2>
                <p className="text-sm text-zinc-400 mt-1">
                  Your seats ({selectedSeatObjects.map((s) => s.code).join(', ')}) are locked for 5 minutes while you complete checkout.
                </p>
              </div>

              {/* Payment Method Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { id: 'upi' as PaymentMethod, label: 'UPI Instant', icon: Smartphone },
                  { id: 'card' as PaymentMethod, label: 'Card', icon: CreditCard },
                  { id: 'wallet' as PaymentMethod, label: 'Cinema Wallet', icon: Wallet },
                  { id: 'netbanking' as PaymentMethod, label: 'NetBanking', icon: ShieldCheck },
                ].map((m) => {
                  const Icon = m.icon;
                  const active = paymentMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id)}
                      className={`flex flex-col items-start gap-2 p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-rose-500 bg-rose-500/10 text-zinc-50'
                          : 'border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${active ? 'text-rose-400' : 'text-zinc-500'}`} />
                      <span className="text-xs font-semibold whitespace-nowrap">{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Payment Input Fields */}
              {paymentMethod === 'upi' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-2">
                    Verified UPI ID
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={upiHandle}
                    onChange={(e) => setUpiHandle(e.target.value)}
                    placeholder="username@upi"
                    className="w-full px-3.5 py-2.5 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-rose-500"
                  />
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-2">
                      Card Last 4 Digits (Demo Gateway)
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={4}
                      pattern="[0-9]{4}"
                      value={cardLastFour}
                      onChange={(e) => setCardLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-full px-3.5 py-2.5 text-sm font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-2">
                      Cardholder Name
                    </label>
                    <input
                      type="text"
                      required
                      defaultValue={user?.displayName || 'Cinema Patron'}
                      className="w-full px-3.5 py-2.5 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>
              )}

              {/* Payment Failure Simulation Toggle for QA Testing Requirement #6 */}
              <div className="pt-2 border-t border-zinc-800/70 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-zinc-300">
                    Test Payment Decline Handling
                  </p>
                  <p className="text-xs text-zinc-500">
                    Enable to verify graceful bank failure recovery without losing held seats.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={simulateDecline}
                  onChange={(e) => setSimulateDecline(e.target.checked)}
                  className="h-4 w-4 accent-rose-600 rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between gap-4 pt-4">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Lock className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Atomic Seat & Payment Commit</span>
                </div>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-6 py-3 text-sm font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isProcessing ? 'Authorizing...' : `Pay ₹${totalAmount} & Issue Tickets`}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right 4 Cols: Contiguous Booking Summary Module */}
        <aside className="lg:col-span-4 bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-6 sticky top-24">
          <div className="flex items-start gap-4 pb-5 border-b border-zinc-800/80">
            <ResilientPoster
              src={movie.posterUrl}
              alt={movie.title}
              title={movie.title}
              className="w-16 h-24 object-cover rounded-lg shrink-0"
            />
            <div className="min-w-0">
              <h3 className="font-display text-base font-bold text-zinc-50 truncate">
                {movie.title}
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                {movie.certificate} · {movie.language} · {show.format}
              </p>
              <p className="text-xs text-zinc-400 mt-1 truncate">{show.theatreName}</p>
              <p className="text-xs font-mono tabular-nums text-zinc-300 mt-1">
                {show.showDate} · {show.showTime}
              </p>
            </div>
          </div>

          <div className="py-5 space-y-3 border-b border-zinc-800/80 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">
                Selected Seats ({selectedSeatObjects.length})
              </span>
              <span className="font-mono text-xs text-zinc-100 text-right">
                {selectedSeatObjects.length > 0
                  ? selectedSeatObjects.map((s) => s.code).join(', ')
                  : 'None selected'}
              </span>
            </div>

            <div className="flex items-center justify-between font-mono tabular-nums text-xs text-zinc-400">
              <span>Tickets Subtotal</span>
              <span>₹{subtotalAmount}</span>
            </div>

            <div className="flex items-center justify-between font-mono tabular-nums text-xs text-zinc-400">
              <span>Cinema Convenience Fee</span>
              <span>₹{convenienceFee}</span>
            </div>
          </div>

          <div className="pt-5 space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-zinc-300">Payable Total</span>
              <span className="font-display text-2xl font-bold font-mono tabular-nums text-zinc-50">
                ₹{totalAmount}
              </span>
            </div>

            {step === 'seats' && (
              <button
                type="button"
                disabled={selectedSeatObjects.length === 0}
                onClick={handleProceedToCheckout}
                className="w-full py-3 px-4 text-sm font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer"
              >
                {selectedSeatObjects.length === 0
                  ? 'Select Seats to Continue'
                  : user
                  ? `Continue to Payment · ₹${totalAmount}`
                  : `Sign In to Reserve · ₹${totalAmount}`}
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
