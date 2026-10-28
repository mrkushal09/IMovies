import React from 'react';
import { User } from 'firebase/auth';

export type NavTab = 'movies' | 'theatres' | 'bookings' | 'notifications' | 'admin';

interface TopNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  user: User | null;
  isAdmin: boolean;
  unreadNotificationsCount: number;
  onAuthAction: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  onSelectTab,
  user,
  isAdmin,
  unreadNotificationsCount,
  onAuthAction,
}) => {
  const navItems: { id: NavTab; label: string }[] = [
    { id: 'movies', label: 'Movies' },
    { id: 'theatres', label: 'Cinemas' },
    { id: 'bookings', label: 'My Tickets' },
    {
      id: 'notifications',
      label: unreadNotificationsCount > 0 ? `Alerts (${unreadNotificationsCount})` : 'Alerts',
    },
  ];

  if (isAdmin) {
    navItems.push({ id: 'admin', label: 'Studio Admin' });
  }

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-8 px-6 lg:px-10 py-4 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80">
      {/* Zone 1: Single text element wordmark */}
      <button
        type="button"
        onClick={() => onSelectTab('movies')}
        className="font-display text-xl font-bold tracking-tight text-zinc-50 hover:text-rose-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
      >
        IMovies
      </button>

      {/* Zone 2: 4-5 single-line text navigation links */}
      <nav className="flex items-center gap-5 sm:gap-7 overflow-x-auto no-scrollbar">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded ${
                isActive
                  ? 'text-zinc-50 underline underline-offset-8 decoration-rose-500 decoration-2'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onAuthAction}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
            user
              ? 'bg-zinc-900 text-zinc-200 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800'
              : 'bg-rose-600 text-white hover:bg-rose-500'
          }`}
        >
          {user ? `Sign Out (${(user.displayName || user.email || 'Account').split(' ')[0]})` : 'Sign In'}
        </button>
      </div>
    </header>
  );
};
