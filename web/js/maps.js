/**
 * Map configuration for the web platform.
 *
 * RoadWatch uses Leaflet with OpenStreetMap raster tiles: an interactive map
 * with no API key, no account and no billing.
 */

export const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Fallback viewport centre (Metro Manila) when there is nothing to fit. */
export const FALLBACK_CENTRE = { lat: 14.7942, lng: 120.879 };

/** Functional repair-status colours (identical to the mobile app). */
export const REPAIR_COLORS = {
  NOT_ASSIGNED: '#5b6a82',
  AWAITING_MAINTENANCE: '#2f6fd0',
  IN_PROGRESS: '#c9821f',
  COMPLETED: '#1f8a5b',
};

/** Distinct colour for a searched place, which is not a report. */
export const SEARCH_MARKER_COLOR = '#071633';
export const SEARCH_MARKER_STROKE = '#c3e6ff';
