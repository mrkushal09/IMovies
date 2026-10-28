import React, { useState } from 'react';
import { Film } from 'lucide-react';

interface ResilientPosterProps {
  src: string;
  alt: string;
  title: string;
  className?: string;
}

export const ResilientPoster: React.FC<ResilientPosterProps> = ({
  src,
  alt,
  title,
  className = '',
}) => {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-950 to-rose-950/40 p-6 text-center ${className}`}
      >
        <Film className="h-10 w-10 text-rose-500/80 mb-3" />
        <span className="font-display text-sm font-semibold text-zinc-200 line-clamp-2">
          {title}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
