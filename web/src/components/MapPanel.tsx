import { useEffect, useRef, useState } from 'react';
import { MAPS_ENABLED } from '../lib/config';
import { loadGoogleMaps, REPAIR_COLORS, type GoogleMapInstance, type GoogleMarkerInstance } from '../lib/maps';
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

const FALLBACK_CENTRE = { lat: 14.7942, lng: 120.879 };

/**
 * Renders a real Google Map when a key is configured. Markers are colour-coded
 * by repair status and clickable. If the API fails to load, the component
 * renders a clear message so the caller can fall back to a list view.
 */
export function MapCanvas({
  markers,
  onSelect,
  className = 'h-full w-full',
  focusId,
  focusPoint = null,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markerRefs = useRef<Map<string, GoogleMarkerInstance>>(new Map());
  const searchMarkerRef = useRef<GoogleMarkerInstance | null>(null);
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
    if (mapRef.current) return;

    let cancelled = false;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.maps) return;
        mapRef.current = new window.google.maps.Map(containerRef.current, {
          center: FALLBACK_CENTRE,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
        });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      markerRefs.current.forEach((marker) => marker.setMap(null));
      markerRefs.current.clear();
      searchMarkerRef.current?.setMap(null);
      searchMarkerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  // Sync markers with the current data.
  useEffect(() => {
    if (status !== 'ready' || !window.google?.maps || !mapRef.current) return;
    const maps = window.google.maps;
    const map = mapRef.current;

    const seen = new Set<string>();
    for (const marker of markers) {
      seen.add(marker.id);
      if (markerRefs.current.has(marker.id)) continue;

      const colour = REPAIR_COLORS[marker.status] ?? REPAIR_COLORS.NOT_ASSIGNED;
      const instance = new maps.Marker({
        position: new maps.LatLng(marker.lat, marker.lng),
        map,
        title: marker.title,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: colour,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });

      instance.addListener('click', () => selectRef.current?.(marker.id));
      markerRefs.current.set(marker.id, instance);
    }

    for (const [id, instance] of markerRefs.current) {
      if (!seen.has(id)) {
        instance.setMap(null);
        markerRefs.current.delete(id);
      }
    }

    // Fit the viewport to the visible markers once per dataset change.
    const signature = markers
      .map((marker) => marker.id)
      .sort()
      .join('|');
    if (markers.length > 0 && signature !== fitSignature && map) {
      if (markers.length === 1) {
        map.setCenter(new maps.LatLng(markers[0].lat, markers[0].lng));
        map.setZoom(15);
      } else {
        const bounds = new maps.LatLngBounds();
        markers.forEach((marker) => bounds.extend(new maps.LatLng(marker.lat, marker.lng)));
        map.fitBounds(bounds, 64);
      }
      setFitSignature(signature);
    }
  }, [markers, status, fitSignature]);

  // Focus a specific marker (e.g. after clicking a list row).
  useEffect(() => {
    if (status !== 'ready' || !focusId || !window.google?.maps || !mapRef.current) return;
    const marker = markers.find((item) => item.id === focusId);
    if (!marker) return;
    const maps = window.google.maps;
    mapRef.current.panTo(new maps.LatLng(marker.lat, marker.lng));
    mapRef.current.setZoom(16);
  }, [focusId, markers, status]);

  // Pan to a searched place and mark it (not a report, so a distinct pin).
  useEffect(() => {
    if (status !== 'ready' || !focusSignature || !window.google?.maps || !mapRef.current) return;
    const [lat, lng] = focusSignature.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const maps = window.google.maps;
    const map = mapRef.current;
    map.panTo(new maps.LatLng(lat, lng));
    map.setZoom(15);

    searchMarkerRef.current?.setMap(null);
    searchMarkerRef.current = new maps.Marker({
      position: new maps.LatLng(lat, lng),
      map,
      title: 'Searched location',
      icon: {
        path: maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#071633',
        fillOpacity: 1,
        strokeColor: '#c3e6ff',
        strokeWeight: 3,
      },
    });
  }, [focusSignature, status]);

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
