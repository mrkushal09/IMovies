import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Calendar, Clock, MapPin, Ticket, XCircle } from 'lucide-react';
import { BookingItem, PaymentItem } from '../types';
import { cancelBookingAtomically } from '../services/cinemaService';
import { ResilientPoster } from './ResilientPoster';

interface BookingsViewProps {
  bookings: BookingItem[];
  payments: PaymentItem[];
  highlightedBookingId: string | null;
  onExploreMovies: () => void;
  onNotify: (message: string, variant?: 'success' | 'error' | 'info') => void;
}

export const BookingsView: React.FC<BookingsViewProps> = ({
  bookings,
  payments,
  highlightedBookingId,
  onExploreMovies,
  onNotify,
}) => {
  const [filterMode, setFilterMode] = useState<'upcoming' | 'past_cancelled'>('upcoming');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(6);

  const todayIso = new Date().toISOString().slice(0, 10);

  const paymentByBooking = new Map<string, PaymentItem>();
  payments.forEach((p) => paymentByBooking.set(p.bookingId, p));

  const upcomingBookings = bookings.filter(
    (b) => b.status === 'confirmed' && b.showDate >= todayIso
  );
  const pastOrCancelledBookings = bookings.filter(
    (b) => b.status === 'cancelled' || b.showDate < todayIso
  );

  const displayedList =
    filterMode === 'upcoming' ? upcomingBookings : pastOrCancelledBookings;
  const paginatedList = displayedList.slice(0, visibleCount);

  const handleConfirmCancel = async (booking: BookingItem) => {
    setCancellingId(booking.id);
    try {
      await cancelBookingAtomically({
        bookingId: booking.id,
        paymentId: booking.paymentId,
        showId: booking.showId,
        seatCodes: booking.seatCodes,
        movieTitle: booking.movieTitle,
        bookingCode: booking.bookingCode,
        userId: booking.userId,
      });
      setConfirmCancelId(null);
      onNotify(
        `Booking ${booking.bookingCode} cancelled. Seats released & payment refunded.`,
        'info'
      );
    } catch (error) {
      onNotify(
        error instanceof Error ? error.message : 'Unable to cancel booking.',
        'error'
      );
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-10 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-zinc-50">
            My Cinema Tickets
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Digital QR passes, payment receipts, and instant seat release cancellations.
          </p>
        </div>

        {/* Interactive Filter Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setFilterMode('upcoming');
              setVisibleCount(6);
            }}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterMode === 'upcoming'
                ? 'bg-zinc-800 text-zinc-50 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Upcoming ({upcomingBookings.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterMode('past_cancelled');
              setVisibleCount(6);
            }}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterMode === 'past_cancelled'
                ? 'bg-zinc-800 text-zinc-50 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Past & Cancelled ({pastOrCancelledBookings.length})
          </button>
        </div>
      </div>

      {paginatedList.length === 0 ? (
        <div className="py-20 text-center">
          <Ticket className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <h2 className="font-display text-lg font-semibold text-zinc-200">
            {filterMode === 'upcoming'
              ? 'No upcoming reservations yet'
              : 'No past or cancelled bookings'}
          </h2>
          <p className="text-sm text-zinc-400 mt-1 max-w-md mx-auto">
            Browse current IMAX, Dolby Atmos, and Recliner screenings in your city to reserve your seats.
          </p>
          <button
            type="button"
            onClick={onExploreMovies}
            className="mt-6 px-5 py-2.5 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500 transition-colors cursor-pointer"
          >
            Browse Now Showing
          </button>
        </div>
      ) : (
        <div className="space-y-6 pt-8">
          {paginatedList.map((booking) => {
            const payment = paymentByBooking.get(booking.id);
            const isHighlighted = highlightedBookingId === booking.id;
            const isConfirmed = booking.status === 'confirmed';

            return (
              <article
                key={booking.id}
                className={`grid grid-cols-1 md:grid-cols-12 gap-6 bg-zinc-900/60 border rounded-xl p-6 transition-colors ${
                  isHighlighted
                    ? 'border-rose-500/80'
                    : 'border-zinc-800/80'
                }`}
              >
                {/* Movie Poster + Details */}
                <div className="md:col-span-8 flex flex-col sm:flex-row gap-5">
                  <ResilientPoster
                    src={booking.posterUrl}
                    alt={booking.movieTitle}
                    title={booking.movieTitle}
                    className="w-24 h-36 object-cover rounded-lg shrink-0"
                  />

                  <div className="flex-1 min-w-0 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <span className="font-mono font-semibold text-zinc-200">
                        {booking.bookingCode}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{booking.format}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          isConfirmed ? 'text-emerald-400 font-medium' : 'text-zinc-500'
                        }
                      >
                        {isConfirmed ? 'Confirmed Pass' : 'Cancelled & Refunded'}
                      </span>
                    </div>

                    <h3 className="font-display text-xl font-bold text-zinc-50">
                      {booking.movieTitle}
                    </h3>

                    <div className="space-y-1 text-xs text-zinc-300">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                        <span>
                          {booking.theatreName} ({booking.city}) · {booking.screenName}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 font-mono tabular-nums text-zinc-300">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                          {booking.showDate}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-zinc-500" />
                          {booking.showTime}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-zinc-400 font-mono tabular-nums">
                      <span>
                        Seats ({booking.seatCount}):{' '}
                        <strong className="text-zinc-100">
                          {booking.seatCodes.join(', ')}
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Total Paid: <strong className="text-zinc-100">₹{booking.totalAmount}</strong>
                      </span>
                      {payment && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {payment.method.toUpperCase()} ({payment.status})
                          </span>
                        </>
                      )}
                    </div>

                    {/* Inline Cancellation Confirmation */}
                    {isConfirmed && booking.showDate >= todayIso && (
                      <div className="pt-3">
                        {confirmCancelId === booking.id ? (
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-xs text-amber-300">
                              Release {booking.seatCodes.join(', ')} and refund ₹{booking.totalAmount}?
                            </span>
                            <button
                              type="button"
                              disabled={cancellingId === booking.id}
                              onClick={() => handleConfirmCancel(booking)}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-500 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                            >
                              {cancellingId === booking.id ? 'Cancelling...' : 'Confirm Cancel'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmCancelId(null)}
                              className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 rounded-md hover:bg-zinc-700 whitespace-nowrap cursor-pointer"
                            >
                              Keep Ticket
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmCancelId(booking.id)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Cancel Reservation & Refund</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right QR Entry Stub */}
                <div className="md:col-span-4 md:border-l md:border-dashed md:border-zinc-800 md:pl-6 flex flex-col items-center justify-center text-center">
                  <div
                    className={`p-3 bg-white rounded-lg ${
                      !isConfirmed ? 'opacity-30 grayscale' : ''
                    }`}
                  >
                    <QRCodeSVG
                      value={`IMOVIES|${booking.bookingCode}|${booking.showId}|${booking.seatCodes.join(',')}`}
                      size={96}
                      level="M"
                    />
                  </div>
                  <p className="font-mono text-xs font-semibold text-zinc-200 mt-2.5">
                    {booking.bookingCode}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {isConfirmed ? 'Scan at Cinema Podium' : 'Voided Pass'}
                  </p>
                </div>
              </article>
            );
          })}

          {displayedList.length > visibleCount && (
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + 6)}
                className="px-5 py-2 text-xs font-semibold text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Load More Bookings
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
