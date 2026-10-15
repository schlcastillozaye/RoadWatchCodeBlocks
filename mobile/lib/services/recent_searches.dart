import 'package:shared_preferences/shared_preferences.dart';

/// Manages recent address/place searches for the public map.
class RecentSearchesService {
  static const String _key = 'rw_recent_searches';
  static const int _maxItems = 8;

  /// Loads the list of recent searches (most recent first).
  static Future<List<String>> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getStringList(_key);
      return raw ?? <String>[];
    } catch (_) {
      return <String>[];
    }
  }

  /// Adds a search query to the top of the list, deduplicating and trimming.
  static Future<void> add(String query) async {
    final trimmed = query.trim();
    if (trimmed.length < 2) return;

    final existing = await load();
    final updated = <String>[trimmed];
    for (final item in existing) {
      if (item.toLowerCase() != trimmed.toLowerCase()) {
        updated.add(item);
      }
    }
    if (updated.length > _maxItems) {
      updated.removeRange(_maxItems, updated.length);
    }

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(_key, updated);
    } catch (_) {}
  }

  /// Removes a specific recent search.
  static Future<void> remove(String query) async {
    final existing = await load();
    existing.removeWhere((item) => item.toLowerCase() == query.toLowerCase());
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(_key, existing);
    } catch (_) {}
  }

  /// Clears all recent searches.
  static Future<void> clear() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_key);
    } catch (_) {}
  }
}