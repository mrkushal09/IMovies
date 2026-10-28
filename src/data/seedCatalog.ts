import { MovieItem, ShowItem, TheatreItem } from '../types';

export const HERO_BACKDROP_IMAGE = '/src/assets/images/hero_cinema_premiere_1793180160879.jpg';

export const CITIES = ['Mumbai', 'Bengaluru', 'Delhi NCR', 'Hyderabad'];

export function getUpcomingDates(daysCount = 5): { iso: string; dayLabel: string; dateNum: string; monthLabel: string }[] {
  const result = [];
  const base = new Date();
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;
    const dayLabel = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' });
    const monthLabel = d.toLocaleDateString('en-US', { month: 'short' });
    result.push({
      iso,
      dayLabel,
      dateNum: dd,
      monthLabel,
    });
  }
  return result;
}

export const INITIAL_MOVIES: MovieItem[] = [
  {
    id: 'mov_orbital_horizon',
    title: 'Orbital Horizon',
    synopsis:
      'When deep-space telemetry aboard Station Helios goes silent near a ringed gas giant, Commander Aria Vance leads a perilous solo descent to recover the crew black box before orbital decay.',
    genre: 'Sci-Fi · Adventure',
    language: 'English',
    format: 'IMAX 2D',
    certificate: 'UA 13+',
    durationMins: 148,
    rating: 9.1,
    votesCount: 42800,
    releaseDate: '2026-10-16',
    director: 'Devika Menon',
    castSummary: 'Rohan Verma · Elena Rostova · Marcus Vance',
    posterUrl: '/src/assets/images/poster_orbital_horizon_1793180161322.jpg',
    backdropUrl: HERO_BACKDROP_IMAGE,
    status: 'now_showing',
  },
  {
    id: 'mov_midnight_monsoon',
    title: 'Midnight Monsoon',
    synopsis:
      'Over one relentless monsoon night in South Mumbai, a veteran detective and a forensic archivist trace a missing vintage ledger across rain-drenched jazz clubs anddockyard vaults.',
    genre: 'Crime · Thriller',
    language: 'Hindi',
    format: 'Dolby Atmos',
    certificate: 'UA 16+',
    durationMins: 134,
    rating: 8.8,
    votesCount: 31450,
    releaseDate: '2026-10-23',
    director: 'Kabir Suryavanshi',
    castSummary: 'Vikramaditya Rao · Tara Deshmukh · Naseer Siddiqui',
    posterUrl: '/src/assets/images/poster_midnight_monsoon_1793180170662.jpg',
    backdropUrl: HERO_BACKDROP_IMAGE,
    status: 'now_showing',
  },
  {
    id: 'mov_velvet_dynasty',
    title: 'The Amber Citadel',
    synopsis:
      'Set amidst sandstone palaces lit by ten thousand oil lamps, a royal cartographer uncovers a secret succession treaty that reshapes three sovereign kingdoms.',
    genre: 'Period · Drama',
    language: 'Hindi',
    format: '4DX · 2D',
    certificate: 'UA',
    durationMins: 162,
    rating: 8.6,
    votesCount: 28900,
    releaseDate: '2026-10-09',
    director: 'Meera Rathore',
    castSummary: 'Aditi Chauhan · Samarjeet Singh ·Prakash Belawadi',
    posterUrl: '/src/assets/images/poster_velvet_dynasty_1793180165753.jpg',
    backdropUrl: HERO_BACKDROP_IMAGE,
    status: 'now_showing',
  },
  {
    id: 'mov_apex_velocity',
    title: 'Apex Velocity',
    synopsis:
      'An underdog motorsport engineering team risks their final championship chassis on a wet night circuit in Singapore, battling fierce pit-wall politics and 340 km/h straights.',
    genre: 'Action · Sport',
    language: 'English',
    format: 'IMAX Laser',
    certificate: 'UA 13+',
    durationMins: 139,
    rating: 9.0,
    votesCount: 37200,
    releaseDate: '2026-10-20',
    director: 'Julian Thorne',
    castSummary: 'Liam Mercer · Kenji Takahashi · Ananya Sen',
    posterUrl: '/src/assets/images/poster_apex_velocity_1793180167416.jpg',
    backdropUrl: HERO_BACKDROP_IMAGE,
    status: 'now_showing',
  },
  {
    id: 'mov_echoes_kyoto',
    title: 'Lanterns Over Arashiyama',
    synopsis:
      'During the autumn river festival, a young clockmaker discovers that floating paper lanterns carry unspoken memories across generations in a quiet bamboo valley.',
    genre: 'Animation · Fantasy',
    language: 'Japanese',
    format: '2D Subtitled',
    certificate: 'U',
    durationMins: 118,
    rating: 9.3,
    votesCount: 19600,
    releaseDate: '2026-10-25',
    director: 'Haruto Miyazaki',
    castSummary: 'Sora Takahashi · Yui Nakamura · Renji Sato',
    posterUrl: '/src/assets/images/poster_echoes_of_kyoto_1793180166985.jpg',
    backdropUrl: HERO_BACKDROP_IMAGE,
    status: 'now_showing',
  },
];

export const INITIAL_THEATRES: TheatreItem[] = [
  {
    id: 'th_palladium_imax',
    name: 'PVR ICON: Palladium Lower Parel',
    city: 'Mumbai',
    address: 'Level 4, Palladium Mall, Senapati Bapat Marg, Lower Parel, Mumbai',
    amenities: 'IMAX Laser · Dolby Atmos · Gourmet Lounge',
    screensCount: 9,
  },
  {
    id: 'th_maison_bkc',
    name: 'INOX Maison: Jio World Drive',
    city: 'Mumbai',
    address: 'Bandra Kurla Complex, Bandra East, Mumbai',
    amenities: 'Laserplex · Recliner Suites · Valet Parking',
    screensCount: 6,
  },
  {
    id: 'th_vega_bengaluru',
    name: 'PVR Director’s Cut: Forum Rex Walk',
    city: 'Bengaluru',
    address: 'Brigade Road, Ashok Nagar, Bengaluru',
    amenities: 'IMAX 2D · 4K Barco Laser · Dine-In Seat Service',
    screensCount: 7,
  },
  {
    id: 'th_select_delhi',
    name: 'PVR Select Citywalk IMAX',
    city: 'Delhi NCR',
    address: 'A-3 District Centre, Saket, New Delhi',
    amenities: 'IMAX · Gold Class Recliners · Dolby 7.1',
    screensCount: 8,
  },
  {
    id: 'th_prasads_hyd',
    name: 'AMB Cinemas: Gachibowli',
    city: 'Hyderabad',
    address: 'Sarath City Capital Mall, Kondapur, Hyderabad',
    amenities: 'Barco Flagship Laser · VIP Lounge · Dolby Atmos',
    screensCount: 7,
  },
];

export function buildInitialShows(): ShowItem[] {
  const dates = getUpcomingDates(4).map((d) => d.iso);
  const shows: ShowItem[] = [];

  const timeTemplates = [
    { time: '01:15 PM', screen: 'Audi 01 · IMAX Laser', classic: 280, prime: 420, recliner: 680 },
    { time: '04:45 PM', screen: 'Audi 02 · Dolby Atmos', classic: 240, prime: 360, recliner: 590 },
    { time: '08:15 PM', screen: 'Audi 01 · Premiere Suite', classic: 320, prime: 480, recliner: 760 },
    { time: '10:50 PM', screen: 'Audi 04 · Late Screening', classic: 220, prime: 340, recliner: 540 },
  ];

  for (const dateIso of dates.slice(0, 3)) {
    const compactDate = dateIso.replace(/-/g, '');
    for (const theatre of INITIAL_THEATRES) {
      INITIAL_MOVIES.forEach((movie, mIdx) => {
        // Assign 2 curated showtimes per movie per theatre per day so every city/movie combination works immediately
        const slotA = timeTemplates[mIdx % timeTemplates.length];
        const slotB = timeTemplates[(mIdx + 2) % timeTemplates.length];

        [slotA, slotB].forEach((slot, sIdx) => {
          const showId = `sh_${compactDate}_${theatre.id.slice(3, 9)}_${movie.id.slice(4, 10)}_${sIdx}`;
          shows.push({
            id: showId,
            movieId: movie.id,
            movieTitle: movie.title,
            theatreId: theatre.id,
            theatreName: theatre.name,
            city: theatre.city,
            screenName: slot.screen,
            format: movie.format,
            language: movie.language,
            showDate: dateIso,
            showTime: slot.time,
            classicPrice: slot.classic,
            primePrice: slot.prime,
            reclinerPrice: slot.recliner,
            totalSeats: 96,
            status: 'scheduled',
          });
        });
      });
    }
  }

  return shows;
}
