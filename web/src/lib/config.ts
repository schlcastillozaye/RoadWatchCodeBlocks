export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

// Guard against shipping a production bundle that still points at localhost.
if (
  import.meta.env.PROD &&
  /(^|\/\/)(localhost|127\.0\.0\.1)(:|\/|$)/.test(API_BASE_URL) &&
  typeof window !== 'undefined' &&
  !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
) {
  // eslint-disable-next-line no-console
  console.warn(
    '[RoadWatch] VITE_API_BASE_URL still points at localhost. Set it to your deployed ' +
      'API URL (e.g. https://roadwatch-api.onrender.com) and rebuild the web platform.',
  );
}

/** Google Maps JS API key. Empty -> map panels fall back to a list view. */
export const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim();

export const MAPS_ENABLED = GOOGLE_MAPS_API_KEY.length > 0;

export const BRAND = {
  product: 'RoadWatch',
  company: 'Code Blocks Inc.',
  tagline: 'Your friendly coding helper',
  system: 'Road issue reporting & maintenance management',
} as const;

/** Turns a possibly-relative API path into an absolute URL. */
export function absoluteUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}
