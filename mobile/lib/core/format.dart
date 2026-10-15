import 'dart:math' as math;

import 'package:intl/intl.dart';

String formatDate(DateTime? date) => date == null ? '—' : DateFormat('d MMM yyyy').format(date);

String formatDateTime(DateTime? date) => date == null ? '—' : DateFormat('d MMM yyyy, h:mm a').format(date);

/// Human-friendly relative time ("2h ago", "3d ago").
String relativeTime(DateTime? date) {
  if (date == null) return '';
  final now = DateTime.now();
  final diff = now.difference(date);
  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  if (diff.inDays < 30) return '${(diff.inDays / 7).floor()}w ago';
  return formatDate(date);
}

String formatBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}

/// Coordinates in a compact, readable form.
String formatCoords(double lat, double lng) => '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}';

double _toRadians(double degrees) => degrees * math.pi / 180;

/// Great-circle distance in kilometres between two coordinates.
double distanceKm(double lat1, double lng1, double lat2, double lng2) {
  const earthRadiusKm = 6371.0;
  final dLat = _toRadians(lat2 - lat1);
  final dLng = _toRadians(lng2 - lng1);
  final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(_toRadians(lat1)) * math.cos(_toRadians(lat2)) * math.sin(dLng / 2) * math.sin(dLng / 2);
  return 2 * earthRadiusKm * math.asin(math.min(1, math.sqrt(a)));
}

/// Human-friendly distance, e.g. "120 m away" or "3.4 km away".
String formatDistance(double km) {
  if (km < 1) return '${math.max(1, (km * 1000).round())} m away';
  return '${km.toStringAsFixed(km < 10 ? 1 : 0)} km away';
}
