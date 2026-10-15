/// Lenient JSON coercion helpers — the API is our own, but being permissive
/// here keeps the app resilient to nulls and type wobble.
library;

String asString(dynamic value, [String fallback = '']) =>
    value is String ? value : (value == null ? fallback : value.toString());

String? asStringOrNull(dynamic value) {
  if (value == null) return null;
  final s = value is String ? value : value.toString();
  return s.isEmpty ? null : s;
}

double asDouble(dynamic value, [double fallback = 0]) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? fallback;
  return fallback;
}

double? asDoubleOrNull(dynamic value) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value);
  return null;
}

int asInt(dynamic value, [int fallback = 0]) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? fallback;
  return fallback;
}

int? asIntOrNull(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}

bool asBool(dynamic value, [bool fallback = false]) {
  if (value is bool) return value;
  if (value is num) return value != 0;
  if (value is String) return value.toLowerCase() == 'true';
  return fallback;
}

DateTime? asDate(dynamic value) {
  if (value is String && value.isNotEmpty) return DateTime.tryParse(value)?.toLocal();
  return null;
}

Map<String, dynamic> asMap(dynamic value) =>
    value is Map ? value.map((k, v) => MapEntry(k.toString(), v)) : <String, dynamic>{};

List<dynamic> asList(dynamic value) => value is List ? value : const [];
