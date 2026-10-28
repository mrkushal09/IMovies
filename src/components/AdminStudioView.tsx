import React, { useState } from 'react';
import { Archive, Film, MapPin, Plus, Trash2 } from 'lucide-react';
import { CertificateRating, MovieItem, ShowItem, TheatreItem } from '../types';
import {
  adminArchiveMovie,
  adminCancelShow,
  adminCreateMovie,
  adminCreateShow,
  adminCreateTheatre,
  adminDeleteTheatre,
} from '../services/cinemaService';
import { CITIES, getUpcomingDates, INITIAL_MOVIES } from '../data/seedCatalog';

interface AdminStudioViewProps {
  movies: MovieItem[];
  theatres: TheatreItem[];
  shows: ShowItem[];
  onNotify: (message: string, variant?: 'success' | 'error' | 'info') => void;
}

export const AdminStudioView: React.FC<AdminStudioViewProps> = ({
  movies,
  theatres,
  shows,
  onNotify,
}) => {
  const [section, setSection] = useState<'movies' | 'theatres' | 'shows'>('movies');
  const [busy, setBusy] = useState(false);

  // Movie Form State
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('Action · Thriller');
  const [language, setLanguage] = useState('English');
  const [format, setFormat] = useState('IMAX 2D');
  const [certificate, setCertificate] = useState<CertificateRating>('UA 13+');
  const [durationMins, setDurationMins] = useState(135);
  const [director, setDirector] = useState('');
  const [castSummary, setCastSummary] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [posterUrl, setPosterUrl] = useState(INITIAL_MOVIES[0].posterUrl);

  // Theatre Form State
  const [thName, setThName] = useState('');
  const [thCity, setThCity] = useState(CITIES[0]);
  const [thAddress, setThAddress] = useState('');
  const [thAmenities, setThAmenities] = useState('IMAX Laser · Dolby Atmos · Recliner Suites');
  const [thScreens, setThScreens] = useState(6);

  // Show Form State
  const upcomingDates = getUpcomingDates(5);
  const [selectedMovieId, setSelectedMovieId] = useState(movies[0]?.id || '');
  const [selectedTheatreId, setSelectedTheatreId] = useState(theatres[0]?.id || '');
  const [screenName, setScreenName] = useState('Audi 01 · IMAX Laser');
  const [showDate, setShowDate] = useState(upcomingDates[0]?.iso || '');
  const [showTime, setShowTime] = useState('07:30 PM');
  const [classicPrice, setClassicPrice] = useState(260);
  const [primePrice, setPrimePrice] = useState(400);
  const [reclinerPrice, setReclinerPrice] = useState(680);

  const handleAddMovie = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await adminCreateMovie({
        title,
        synopsis,
        genre,
        language,
        format,
        certificate,
        durationMins: Number(durationMins),
        rating: 8.7,
        votesCount: 1200,
        releaseDate: upcomingDates[0].iso,
        director,
        castSummary,
        posterUrl,
        status: 'now_showing',
      });
      setTitle('');
      setDirector('');
      setCastSummary('');
      setSynopsis('');
      onNotify('Movie published to live catalog.', 'success');
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Failed to create movie.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleAddTheatre = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await adminCreateTheatre({
        name: thName,
        city: thCity,
        address: thAddress,
        amenities: thAmenities,
        screensCount: Number(thScreens),
      });
      setThName('');
      setThAddress('');
      onNotify('Cinema venue added.', 'success');
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Failed to add theatre.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleAddShow = async (e: React.FormEvent) => {
    e.preventDefault();
    const movie = movies.find((m) => m.id === selectedMovieId) || movies[0];
    const theatre = theatres.find((t) => t.id === selectedTheatreId) || theatres[0];
    if (!movie || !theatre) {
      onNotify('Ensure at least one movie and theatre exist first.', 'error');
      return;
    }

    setBusy(true);
    try {
      await adminCreateShow({
        movieId: movie.id,
        movieTitle: movie.title,
        theatreId: theatre.id,
        theatreName: theatre.name,
        city: theatre.city,
        screenName,
        format: movie.format,
        language: movie.language,
        showDate,
        showTime,
        classicPrice: Number(classicPrice),
        primePrice: Number(primePrice),
        reclinerPrice: Number(reclinerPrice),
        totalSeats: 96,
      });
      onNotify(`Scheduled ${movie.title} at ${theatre.name} (${showTime}).`, 'success');
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Failed to schedule show.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-zinc-50">
            Cinema Studio Administration
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Role-protected catalog management for theatrical releases, venues, and showtime schedules.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
          {[
            { id: 'movies' as const, label: `Movies (${movies.length})` },
            { id: 'theatres' as const, label: `Cinemas (${theatres.length})` },
            { id: 'shows' as const, label: `Shows (${shows.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                section === tab.id
                  ? 'bg-zinc-800 text-zinc-50 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* MOVIES MANAGEMENT */}
      {section === 'movies' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-8">
          <form
            onSubmit={handleAddMovie}
            className="lg:col-span-5 bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-6 space-y-4 h-fit"
          >
            <h2 className="font-display text-lg font-semibold text-zinc-100">
              Publish New Release
            </h2>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Movie Title</label>
              <input
                type="text"
                required
                minLength={1}
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Solaris Protocol"
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Genre</label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Language</label>
                <input
                  type="text"
                  required
                  maxLength={40}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Format</label>
                <input
                  type="text"
                  required
                  maxLength={40}
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Certificate</label>
                <select
                  value={certificate}
                  onChange={(e) => setCertificate(e.target.value as CertificateRating)}
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                >
                  <option value="U">U</option>
                  <option value="UA">UA</option>
                  <option value="UA 13+">UA 13+</option>
                  <option value="UA 16+">UA 16+</option>
                  <option value="A">A</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Runtime (min)</label>
                <input
                  type="number"
                  required
                  min={30}
                  max={360}
                  value={durationMins}
                  onChange={(e) => setDurationMins(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Director</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={director}
                  onChange={(e) => setDirector(e.target.value)}
                  placeholder="Director name"
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Key Artwork Preset</label>
                <select
                  value={posterUrl}
                  onChange={(e) => setPosterUrl(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                >
                  {INITIAL_MOVIES.map((m) => (
                    <option key={m.id} value={m.posterUrl}>
                      {m.title} Key Art
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Lead Cast</label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={240}
                value={castSummary}
                onChange={(e) => setCastSummary(e.target.value)}
                placeholder="Actor 1 · Actor 2 · Actor 3"
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Synopsis</label>
              <textarea
                required
                minLength={10}
                maxLength={1200}
                rows={3}
                value={synopsis}
                onChange={(e) => setSynopsis(e.target.value)}
                placeholder="Concise theatrical synopsis..."
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Publish Movie</span>
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {movies.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-4 p-4 bg-zinc-900/50 border border-zinc-800/80 rounded-xl"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <span>{m.language}</span>
                    <span aria-hidden="true">·</span>
                    <span>{m.format}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{m.durationMins}m</span>
                  </div>
                  <h3 className="font-display text-base font-bold text-zinc-100 truncate mt-0.5">
                    {m.title}
                  </h3>
                  <p className="text-xs text-zinc-500 truncate">{m.genre} · Dir. {m.director}</p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await adminArchiveMovie(m.id);
                      onNotify(`Archived ${m.title}.`, 'info');
                    } catch (e) {
                      onNotify(e instanceof Error ? e.message : 'Archive failed.', 'error');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-rose-500/60 hover:text-rose-400 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Archive className="h-3.5 w-3.5" />
                  <span>Archive</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* THEATRES MANAGEMENT */}
      {section === 'theatres' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-8">
          <form
            onSubmit={handleAddTheatre}
            className="lg:col-span-5 bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-6 space-y-4 h-fit"
          >
            <h2 className="font-display text-lg font-semibold text-zinc-100">
              Register Cinema Venue
            </h2>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Cinema Name</label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={thName}
                onChange={(e) => setThName(e.target.value)}
                placeholder="e.g. PVR ICON: Phoenix Citadel"
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">City</label>
                <select
                  value={thCity}
                  onChange={(e) => setThCity(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                >
                  {CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Screens Count</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={30}
                  value={thScreens}
                  onChange={(e) => setThScreens(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Street Address</label>
              <input
                type="text"
                required
                minLength={5}
                maxLength={240}
                value={thAddress}
                onChange={(e) => setThAddress(e.target.value)}
                placeholder="Full mall or street address"
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Sound & Seating Amenities</label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={200}
                value={thAmenities}
                onChange={(e) => setThAmenities(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Add Cinema Venue</span>
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {theatres.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-4 p-4 bg-zinc-900/50 border border-zinc-800/80 rounded-xl"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <MapPin className="h-3.5 w-3.5 text-zinc-500" />
                    <span>{t.city}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{t.screensCount} Screens</span>
                  </div>
                  <h3 className="font-display text-base font-bold text-zinc-100 truncate mt-0.5">
                    {t.name}
                  </h3>
                  <p className="text-xs text-zinc-500 truncate">{t.amenities}</p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await adminDeleteTheatre(t.id);
                      onNotify(`Removed ${t.name}.`, 'info');
                    } catch (e) {
                      onNotify(e instanceof Error ? e.message : 'Remove failed.', 'error');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-rose-500/60 hover:text-rose-400 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SHOWS MANAGEMENT */}
      {section === 'shows' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-8">
          <form
            onSubmit={handleAddShow}
            className="lg:col-span-5 bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-6 space-y-4 h-fit"
          >
            <h2 className="font-display text-lg font-semibold text-zinc-100">
              Schedule Screening
            </h2>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Select Movie</label>
              <select
                value={selectedMovieId}
                onChange={(e) => setSelectedMovieId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
              >
                {movies.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} ({m.language})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Select Cinema</label>
              <select
                value={selectedTheatreId}
                onChange={(e) => setSelectedTheatreId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
              >
                {theatres.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.city})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Show Date</label>
                <select
                  value={showDate}
                  onChange={(e) => setShowDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                >
                  {upcomingDates.map((d) => (
                    <option key={d.iso} value={d.iso}>
                      {d.iso} ({d.dayLabel})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Show Time</label>
                <input
                  type="text"
                  required
                  maxLength={12}
                  value={showTime}
                  onChange={(e) => setShowTime(e.target.value)}
                  placeholder="07:30 PM"
                  className="w-full px-3 py-2 text-sm font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Auditorium Screen</label>
              <input
                type="text"
                required
                maxLength={60}
                value={screenName}
                onChange={(e) => setScreenName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Classic ₹</label>
                <input
                  type="number"
                  required
                  min={50}
                  max={5000}
                  value={classicPrice}
                  onChange={(e) => setClassicPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Prime ₹</label>
                <input
                  type="number"
                  required
                  min={50}
                  max={5000}
                  value={primePrice}
                  onChange={(e) => setPrimePrice(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Recliner ₹</label>
                <input
                  type="number"
                  required
                  min={50}
                  max={5000}
                  value={reclinerPrice}
                  onChange={(e) => setReclinerPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
            >
              <Film className="h-4 w-4" />
              <span>Schedule Showtime</span>
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3 max-h-[620px] overflow-y-auto pr-1">
            {shows.slice(0, 30).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-4 p-4 bg-zinc-900/50 border border-zinc-800/80 rounded-xl"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-zinc-400">
                    <span>{s.showDate}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-zinc-200">{s.showTime}</span>
                    <span aria-hidden="true">·</span>
                    <span>{s.city}</span>
                  </div>
                  <h3 className="font-display text-sm font-bold text-zinc-100 truncate mt-0.5">
                    {s.movieTitle}
                  </h3>
                  <p className="text-xs text-zinc-500 truncate">
                    {s.theatreName} · {s.screenName} · ₹{s.classicPrice}/₹{s.primePrice}/₹{s.reclinerPrice}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await adminCancelShow(s.id);
                      onNotify(`Cancelled showtime ${s.showTime}.`, 'info');
                    } catch (e) {
                      onNotify(e instanceof Error ? e.message : 'Cancel failed.', 'error');
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-rose-500/60 hover:text-rose-400 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Cancel Show
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
