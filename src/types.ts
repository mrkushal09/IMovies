export type CertificateRating = 'U' | 'UA' | 'UA 13+' | 'UA 16+' | 'A';
export type MovieStatus = 'now_showing' | 'coming_soon' | 'archived';
export type SeatTier = 'classic' | 'prime' | 'recliner';
export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'wallet';

export interface MovieItem {
  id: string;
  title: string;
  synopsis: string;
  genre: string;
  language: string;
  format: string;
  certificate: CertificateRating;
  durationMins: number;
  rating: number;
  votesCount: number;
  releaseDate: string;
  director: string;
  castSummary: string;
  posterUrl: string;
  backdropUrl?: string;
  status: MovieStatus;
}

export interface TheatreItem {
  id: string;
  name: string;
  city: string;
  address: string;
  amenities: string;
  screensCount: number;
}

export interface ShowItem {
  id: string;
  movieId: string;
  movieTitle: string;
  theatreId: string;
  theatreName: string;
  city: string;
  screenName: string;
  format: string;
  language: string;
  showDate: string; // YYYY-MM-DD
  showTime: string; // e.g. 07:30 PM
  classicPrice: number;
  primePrice: number;
  reclinerPrice: number;
  totalSeats: number;
  status: 'scheduled' | 'cancelled';
}

export interface SeatReservationItem {
  id: string;
  seatCode: string;
  tier: SeatTier;
  price: number;
  showId: string;
  bookingId: string;
  userId: string;
  status: 'booked';
}

export interface LiveSeatHold {
  seatCode: string;
  userId: string;
  userName: string;
  socketId: string;
  expiresAt: number;
}

export interface BookingItem {
  id: string;
  userId: string;
  showId: string;
  movieId: string;
  movieTitle: string;
  posterUrl: string;
  theatreName: string;
  city: string;
  screenName: string;
  format: string;
  showDate: string;
  showTime: string;
  seatCodes: string[];
  seatCount: number;
  subtotalAmount: number;
  convenienceFee: number;
  totalAmount: number;
  paymentId: string;
  bookingCode: string;
  status: 'confirmed' | 'cancelled';
  createdAtMs: number;
}

export interface PaymentItem {
  id: string;
  userId: string;
  bookingId: string;
  amount: number;
  currency: 'INR' | 'USD';
  method: PaymentMethod;
  transactionRef: string;
  status: 'succeeded' | 'refunded';
  createdAtMs: number;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'booking_confirmed' | 'booking_cancelled' | 'system';
  read: boolean;
  relatedBookingId?: string;
  createdAtMs: number;
}
