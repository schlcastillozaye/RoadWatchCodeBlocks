import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MAPS_ENABLED } from '../lib/config';
import {
  FALLBACK_CENTRE,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  REPAIR_COLORS,
  SEARCH_MARKER_COLOR,
  SEARCH_MARKER_STROKE,
} from '../lib/maps';
import { Spinner } from './Feedback';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  status: string;
}

interface MapCanvasProps {
  markers: MapMarker[];
  onSelect?: (id: string) => void;
  className?: string;
  focusId?: string | null;
  /**
   * Pans the map to an arbitrary coordinate and marks it — used for place /
   * address search results, which are not reports.
   */
  focusPoint?: { lat: number; lng: number } | null;
}

const MARKER_RADIUS = 9;
const SEARCH_MARKER_RADIUS = 10;
/** Stop showing the loading veil after this long even if tiles are slow. */
const TILE_TIMEOUT_MS = 4000;

/**
 * Renders an interactive Leaflet map on OpenStreetMap tiles — no API key, no
 * account, no billing. Markers are colour-coded by repair status and clickable.
 * If Leaflet cannot initialise, a clear message is shown so callers can keep
 * using the list view.
 */
export function MapCanvas({
  markers,
  onSelect,
  className = 'h-full w-full',
  focusId,
  focusPoint = null,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRefs = useRef<Map<string, L.CircleMarker>>(new Map());
  const searchMarkerRef = useRef<L.CircleMarker | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fitSignature, setFitSignature] = useState('');

  // String signature keeps the effect stable across re-renders/inline objects.
  const focusSignature = focusPoint ? `${focusPoint.lat},${focusPoint.lng}` : '';

  // Initialise the map once.
  useEffect(() => {
    if (!MAPS_ENABLED) {
      setStatus('error');
      return;
    }
    if (mapRef.current || !containerRef.current) return;

    let map: L.Map | null = null;
    let observer: ResizeObserver | null = null;
    let timer: number | undefined;

    try {
      map = L.map(containerRef.current, {
        center: [FALLBACK_CENTRE.lat, FALLBACK_CENTRE.lng],
        zoom: 12,
        zoomControl: true,
      });

      const tiles = L.tileLayer(OSM_TILE_URL, {
        attribution: OSM_ATTRIBUTION,
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      // Reveal the map as soon as tiles land (or after a short grace period).
      const settle = () => setStatus((current) => (current === 'loading' ? 'ready' : current));
      tiles.once('load', settle);
      timer = window.setTimeout(settle, TILE_TIMEOUT_MS);

      // Leaflet only tracks window resizes; keep the canvas correct when the
      // container itself changes size (responsive layouts, panels, drawers).
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => map?.invalidateSize());
        observer.observe(containerRef.current);
      }
    } catch {
      setStatus('error');
    }

    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
      markerRefs.current.forEach((circle) => circle.remove());
      markerRefs.current.clear();
      searchMarkerRef.current?.remove();
      searchMarkerRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync markers with the current data.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();
    for (const marker of markers) {
      seen.add(marker.id);
      if (markerRefs.current.has(marker.id)) continue;

      const colour = REPAIR_COLORS[marker.status] ?? REPAIR_COLORS.NOT_ASSIGNED;
      const circle = L.circleMarker([marker.lat, marker.lng], {
        radius: MARKER_RADIUS,
        color: '#ffffff',
        weight: 2,
        fillColor: colour,
        fillOpacity: 1,
      }).addTo(map);

      circle.bindTooltip(marker.title);
      circle.on('click', () => selectRef.current?.(marker.id));
      markerRefs.current.set(marker.id, circle);
    }

    for (const [id, circle] of markerRefs.current) {
      if (!seen.has(id)) {
        circle.remove();
        markerRefs.current.delete(id);
      }
    }

    // Fit the viewport to the visible markers once per dataset change.
    const signature = markers
      .map((marker) => marker.id)
      .sort()
      .join('|');
    if (markers.length > 0 && signature !== fitSignature) {
      if (markers.length === 1) {
        map.setView([markers[0].lat, markers[0].lng], 15);
      } else {
        const bounds = L.latLngBounds(markers.map((marker) => [marker.lat, marker.lng] as [number, number]));
        map.fitBounds(bounds, { padding: [64, 64] });
      }
      setFitSignature(signature);
    }
  }, [markers, fitSignature]);

  // Focus a specific marker (e.g. after clicking a list row).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusId) return;
    const marker = markers.find((item) => item.id === focusId);
    if (!marker) return;
    map.setView([marker.lat, marker.lng], 16);
  }, [focusId, markers]);

  // Pan to a searched place and mark it (not a report, so a distinct pin).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusSignature) return;
    const [lat, lng] = focusSignature.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    map.setView([lat, lng], 15);

    searchMarkerRef.current?.remove();
    searchMarkerRef.current = L.circleMarker([lat, lng], {
      radius: SEARCH_MARKER_RADIUS,
      color: SEARCH_MARKER_STROKE,
      weight: 3,
      fillColor: SEARCH_MARKER_COLOR,
      fillOpacity: 1,
    })
      .addTo(map)
      .bindTooltip('Searched location');
  }, [focusSignature]);

  if (status === 'error') {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 bg-sheet text-center text-sm text-ink-3 ${className}`}
      >
        <span className="text-2xl" aria-hidden="true">
          🗺
        </span>
        <p className="font-semibold text-ink-2">Map view unavailable</p>
        <p className="max-w-xs text-xs">Use the list to browse and open every approved report.</p>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-sheet">
          <Spinner size={24} />
        </div>
      )}
    </div>
  );
}

export function MapLegend() {
  const items: { label: string; color: string }[] = [
    { label: 'Not assigned', color: 'bg-slate' },
    { label: 'Awaiting maintenance', color: 'bg-blue' },
    { label: 'In progress', color: 'bg-amber' },
    { label: 'Completed', color: 'bg-green' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-brand-sm border border-azure bg-surface/95 px-3 py-2 text-xs text-ink-2">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
