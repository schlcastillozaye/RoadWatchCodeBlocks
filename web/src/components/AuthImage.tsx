import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { absoluteUrl } from '../lib/config';
import type { ReportPhoto } from '../lib/types';
import { Spinner } from './Feedback';

interface AuthImageProps {
  src: string;
  isPublic?: boolean;
  alt: string;
  className?: string;
  onClick?: () => void;
}

/**
 * Renders an API image. Public (approved) photos load directly; private photos
 * are fetched with the bearer token and rendered from an object URL, because
 * <img> cannot send Authorization headers.
 */
export function AuthImage({ src, isPublic = false, alt, className = '', onClick }: AuthImageProps) {
  const [url, setUrl] = useState<string | null>(isPublic ? absoluteUrl(src) : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);

    if (isPublic) {
      setUrl(absoluteUrl(src));
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);

    fetch(absoluteUrl(src), { headers: api.authHeader() })
      .then((response) => {
        if (!response.ok) throw new Error('Image request failed');
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, isPublic]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-sheet text-ink-3 ${className}`} title="Image unavailable">
        <span aria-hidden="true">🖼</span>
        <span className="sr-only">{alt} (unavailable)</span>
      </div>
    );
  }

  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-sheet ${className}`}>
        <Spinner size={18} />
      </div>
    );
  }

  return <img src={url} alt={alt} className={className} loading="lazy" onClick={onClick} />;
}

export function PhotoGallery({
  photos,
  onSelect,
  size = 'h-24 w-24',
}: {
  photos: ReportPhoto[];
  onSelect?: (index: number) => void;
  size?: string;
}) {
  if (photos.length === 0) {
    return <p className="text-sm text-ink-3">No photos attached.</p>;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {photos.map((photo, index) => (
        <figure key={photo.id} className="w-max">
          <div className="relative overflow-hidden rounded-brand-sm border border-azure">
            <AuthImage
              src={photo.url}
              isPublic={photo.isPublic}
              alt={`${photo.kind.toLowerCase()} photo ${index + 1}`}
              className={`${size} cursor-pointer object-cover transition hover:opacity-90`}
              onClick={() => onSelect?.(index)}
            />
            <span className="pointer-events-none absolute bottom-1 left-1 rounded-full bg-navy/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky">
              {photo.kind}
            </span>
          </div>
        </figure>
      ))}
    </div>
  );
}

export function Lightbox({
  photos,
  index,
  onClose,
  onIndexChange,
}: {
  photos: ReportPhoto[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const photo = photos[index];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') onIndexChange((index + 1) % photos.length);
      if (event.key === 'ArrowLeft') onIndexChange((index - 1 + photos.length) % photos.length);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [index, photos.length, onClose, onIndexChange]);

  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-navy/95" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between px-5 py-4 text-surface">
        <span className="font-display text-sm font-semibold uppercase tracking-wide text-sky">
          {photo.kind} photo · {index + 1}/{photos.length}
        </span>
        <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-lg text-surface hover:bg-white/10">
          ✕
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden px-4" onClick={onClose}>
        <div onClick={(event) => event.stopPropagation()} className="max-h-full">
          <AuthImage src={photo.url} isPublic={photo.isPublic} alt="Report photo" className="max-h-[78vh] max-w-full rounded-brand object-contain" />
        </div>
      </div>

      {photos.length > 1 && (
        <div className="flex items-center justify-center gap-4 pb-6">
          <button
            type="button"
            className="btn btn-ghost text-surface"
            onClick={() => onIndexChange((index - 1 + photos.length) % photos.length)}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="btn btn-ghost text-surface"
            onClick={() => onIndexChange((index + 1) % photos.length)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
