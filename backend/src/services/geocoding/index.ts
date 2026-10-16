import { env } from '../../config/env';
import { logger } from '../../utils/logger';

/**
 * Server-side geocoding with two interchangeable providers:
 *
 *  - **Google** — used automatically when `GOOGLE_MAPS_SERVER_API_KEY` is set.
 *    Best quality, but the key needs a billing account with a card.
 *  - **OpenStreetMap Nominatim** — the default, and always free. No key, no
 *    account, no billing, so the deployed platform keeps address search and
 *    reverse geocoding working out of the box.
 *
 * Both providers are normalised to the same shapes, and every failure is a
 * graceful `available: false` result (never a thrown error) so clients can fall
 * back to text filtering.
 */

export interface GeocodePlace {
  address: string;
  lat: number;
  lng: number;
  areaLabel: string | null;
}

export interface ReverseGeocodeResult {
  available: boolean;
  address: string | null;
  areaLabel: string | null;
  reason: string | null;
}

export interface PlaceSearchResult {
  available: boolean;
  results: GeocodePlace[];
  reason: string | null;
}

const REQUEST_TIMEOUT_MS = 8000;

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
/**
 * Nominatim's usage policy requires a descriptive User-Agent identifying the
 * application, and asks for at most one request per second.
 */
const NOMINATIM_USER_AGENT =
  'RoadWatch/1.0 (road issue reporting; +https://github.com/schlcastillozaye/RoadWatchCodeBlocks)';
const NOMINATIM_MIN_INTERVAL_MS = 1000;

export type GeocodingProvider = 'google' | 'nominatim';

/** The provider in use — Google only when a server key is configured. */
export function geocodingProvider(): GeocodingProvider {
  return env.googleMaps.serverApiKey ? 'google' : 'nominatim';
}

/* -------------------------------------------------------------------------- */
/* Small in-memory cache + throttle                                           */
/* -------------------------------------------------------------------------- */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function cacheSet<T>(key: string, value: T): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Serialises Nominatim calls so we never exceed one request per second.
let nominatimQueue: Promise<unknown> = Promise.resolve();
let lastNominatimAt = 0;

function scheduleNominatim<T>(task: () => Promise<T>): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const wait = Math.max(0, NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastNominatimAt));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastNominatimAt = Date.now();
    return task();
  });
  // Keep the chain alive even if a task rejects.
  nominatimQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function fetchJson<T>(url: URL, headers: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* Address helpers                                                            */
/* -------------------------------------------------------------------------- */

type AddressParts = Record<string, string | undefined>;

/** Picks the most useful human "area" label out of a Nominatim address. */
function nominatimAreaLabel(address: AddressParts | undefined): string | null {
  if (!address) return null;
  const order = [
    'city',
    'town',
    'village',
    'municipality',
    'city_district',
    'suburb',
    'county',
    'state',
    'region',
  ];
  for (const key of order) {
    const value = address[key];
    if (value) return value;
  }
  return null;
}

/** Turns a Google Geocoding status into something a person can act on. */
function describeGoogleStatus(status: string, errorMessage?: string): string {
  switch (status) {
    case 'ZERO_RESULTS':
      return 'No matching place was found.';
    case 'REQUEST_DENIED':
      return errorMessage
        ? `Google rejected the request: ${errorMessage}`
        : 'Google rejected the request — check that billing is enabled and the Geocoding API is turned on.';
    case 'OVER_QUERY_LIMIT':
      return 'The Google Maps quota for this project has been exceeded.';
    case 'OVER_DAILY_LIMIT':
      return 'The daily Google Maps limit has been reached. Try again tomorrow.';
    case 'INVALID_REQUEST':
      return 'That search was not understood — try a more specific address.';
    default:
      return `No result (${status}).`;
  }
}

/* -------------------------------------------------------------------------- */
/* Provider: Google                                                           */
/* -------------------------------------------------------------------------- */

interface GoogleGeocodeResponse {
  status: string;
  error_message?: string;
  results?: Array<{
    formatted_address: string;
    geometry: { location: { lat: number; lng: number } };
    address_components: Array<{ long_name: string; types: string[] }>;
  }>;
}

type GoogleGeocodeResult = NonNullable<GoogleGeocodeResponse['results']>[number];

function googleAreaLabel(result: GoogleGeocodeResult | undefined): string | null {
  return (
    result?.address_components.find(
      (component) => component.types.includes('sublocality') || component.types.includes('locality'),
    )?.long_name ?? null
  );
}

async function googleReverse(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('key', env.googleMaps.serverApiKey);

  const data = await fetchJson<GoogleGeocodeResponse>(url, { Accept: 'application/json' });
  const first = data.results?.[0];
  return {
    available: Boolean(first),
    address: first?.formatted_address ?? null,
    areaLabel: googleAreaLabel(first),
    reason: first ? null : describeGoogleStatus(data.status, data.error_message),
  };
}

async function googleSearch(query: string, limit: number): Promise<PlaceSearchResult> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('key', env.googleMaps.serverApiKey);

  const data = await fetchJson<GoogleGeocodeResponse>(url, { Accept: 'application/json' });
  const results = (data.results ?? []).slice(0, limit).map((result) => ({
    address: result.formatted_address,
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    areaLabel: googleAreaLabel(result),
  }));

  return {
    available: results.length > 0,
    results,
    reason: results.length > 0 ? null : describeGoogleStatus(data.status, data.error_message),
  };
}

/* -------------------------------------------------------------------------- */
/* Provider: OpenStreetMap Nominatim (free)                                   */
/* -------------------------------------------------------------------------- */

interface NominatimSearchItem {
  display_name: string;
  lat: string;
  lon: string;
  address?: AddressParts;
}

interface NominatimReverseItem {
  display_name?: string;
  address?: AddressParts;
}

async function nominatimReverse(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const url = new URL(`${NOMINATIM_BASE}/reverse`);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', '18');

  const data = await scheduleNominatim(() =>
    fetchJson<NominatimReverseItem>(url, {
      Accept: 'application/json',
      'Accept-Language': 'en',
      'User-Agent': NOMINATIM_USER_AGENT,
    }),
  );

  const address = data.display_name ?? null;
  return {
    available: Boolean(address),
    address,
    areaLabel: nominatimAreaLabel(data.address),
    reason: address ? null : 'No matching place was found.',
  };
}

async function nominatimSearch(query: string, limit: number): Promise<PlaceSearchResult> {
  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', String(limit));

  const data = await scheduleNominatim(() =>
    fetchJson<NominatimSearchItem[]>(url, {
      Accept: 'application/json',
      'Accept-Language': 'en',
      'User-Agent': NOMINATIM_USER_AGENT,
    }),
  );

  const results = (Array.isArray(data) ? data : [])
    .slice(0, limit)
    .map((item) => ({
      address: item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon),
      areaLabel: nominatimAreaLabel(item.address),
    }))
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

  return {
    available: results.length > 0,
    results,
    reason: results.length > 0 ? null : 'No matching place was found.',
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const provider = geocodingProvider();
  const key = `reverse:${provider}:${lat},${lng}`;
  const cached = cacheGet<ReverseGeocodeResult>(key);
  if (cached) return cached;

  try {
    const result = provider === 'google' ? await googleReverse(lat, lng) : await nominatimReverse(lat, lng);
    cacheSet(key, result);
    return result;
  } catch (error) {
    logger.warn('reverse geocoding failed', { provider, error: String(error) });
    return { available: false, address: null, areaLabel: null, reason: 'Geocoding service unavailable.' };
  }
}

export async function searchPlaces(query: string, limit = 5): Promise<PlaceSearchResult> {
  const provider = geocodingProvider();
  const key = `search:${provider}:${limit}:${query.toLowerCase()}`;
  const cached = cacheGet<PlaceSearchResult>(key);
  if (cached) return cached;

  try {
    const result = provider === 'google' ? await googleSearch(query, limit) : await nominatimSearch(query, limit);
    cacheSet(key, result);
    return result;
  } catch (error) {
    logger.warn('place search failed', { provider, error: String(error) });
    return { available: false, results: [], reason: 'Geocoding service unavailable.' };
  }
}
