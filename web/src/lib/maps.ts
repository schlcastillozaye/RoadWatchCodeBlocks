import { GOOGLE_MAPS_API_KEY } from './config';

export interface GoogleMapInstance {
  fitBounds: (bounds: unknown, padding?: number) => void;
  setCenter: (position: unknown) => void;
  setZoom: (zoom: number) => void;
  panTo: (position: unknown) => void;
}

export interface GoogleMarkerInstance {
  setMap: (map: GoogleMapInstance | null) => void;
  addListener: (event: string, handler: () => void) => void;
}

interface GoogleMapsApi {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
  Marker: new (options: Record<string, unknown>) => GoogleMarkerInstance;
  LatLng: new (lat: number, lng: number) => unknown;
  LatLngBounds: new () => { extend: (point: unknown) => void };
  SymbolPath: { CIRCLE: number };
}

declare global {
  interface Window {
    google?: { maps: GoogleMapsApi };
  }
}

let loader: Promise<void> | null = null;

/** Loads the Google Maps JS API once; resolves immediately if already present. */
export function loadGoogleMaps(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.maps) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Maps failed to load'));
    document.head.appendChild(script);
  });

  return loader;
}

/** Functional repair-status colours (identical to the mobile app). */
export const REPAIR_COLORS: Record<string, string> = {
  NOT_ASSIGNED: '#5b6a82',
  AWAITING_MAINTENANCE: '#2f6fd0',
  IN_PROGRESS: '#c9821f',
  COMPLETED: '#1f8a5b',
};
