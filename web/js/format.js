/** Shared labels and formatters (port of the React app's lib/format.ts). */

export const CATEGORY_LABELS = {
  POTHOLE: 'Pothole',
  DAMAGED_PAVEMENT: 'Damaged pavement',
  ROAD_CRACK: 'Road crack',
  FLOODING: 'Flooding',
  DAMAGED_DRAINAGE: 'Damaged drainage',
  OTHER: 'Other road issue',
};

export const CATEGORY_ICONS = {
  POTHOLE: '◉',
  DAMAGED_PAVEMENT: '▤',
  ROAD_CRACK: '〰',
  FLOODING: '≈',
  DAMAGED_DRAINAGE: '⬡',
  OTHER: '⚑',
};

export const MODERATION_LABELS = {
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const REPAIR_LABELS = {
  NOT_ASSIGNED: 'Not assigned',
  AWAITING_MAINTENANCE: 'Awaiting maintenance',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

export const PRIORITY_LABELS = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const ROLE_LABELS = {
  ADMIN: 'Administrator',
  MAINTENANCE_OFFICER: 'Maintenance Officer',
  CITIZEN: 'Citizen',
};

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function relativeTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return `${weeks}w ago`;
  return formatDate(value);
}

export function formatCoords(lat, lng) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function locationLabel(lat, lng, address, area) {
  const parts = [address, area].filter((p) => p && p.trim());
  return parts.length ? parts.join(' · ') : formatCoords(lat, lng);
}

/** Great-circle distance in kilometres between two coordinates. */
export function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Human-friendly distance, e.g. "120 m away" or "3.4 km away". */
export function formatDistance(km) {
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m away`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km away`;
}

export function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Extracts a user-presentable message from any thrown value. */
export function errorMessage(error) {
  if (error && typeof error.message === 'string' && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
