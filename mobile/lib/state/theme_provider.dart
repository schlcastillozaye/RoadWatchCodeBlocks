import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Owns the light/dark preference.
///
/// Mirrors the web platform's behaviour (`web/js/app.js`): the choice is stored
/// under the same key name, and when the user has never chosen, the app follows
/// the operating system's setting. The web toggle is strictly light↔dark, so
/// storing only `light`/`dark` and *removing* the key for "system" keeps the two
/// platforms expressing the same thing.
class ThemeProvider extends ChangeNotifier {
  /// Same key the web app writes to `localStorage`.
  static const String storageKey = 'roadwatch_theme';

  ThemeMode _mode = ThemeMode.system;

  ThemeMode get mode => _mode;

  /// True once a stored preference has been read (or its absence established).
  bool _loaded = false;
  bool get isLoaded => _loaded;

  /// Reads the saved preference. Call before the first frame so a dark-mode
  /// user never sees a flash of the light theme.
  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _mode = modeFromStored(prefs.getString(storageKey));
    } catch (_) {
      // Unreadable preferences are not fatal — fall back to following the OS.
      _mode = ThemeMode.system;
    }
    _loaded = true;
    notifyListeners();
  }

  /// Maps a stored value back to a [ThemeMode]. Anything unrecognised (or
  /// absent) means "no explicit choice" → follow the system.
  @visibleForTesting
  static ThemeMode modeFromStored(String? stored) => switch (stored) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };

  /// The value written for [mode]: `null` for [ThemeMode.system], which clears
  /// the stored key.
  @visibleForTesting
  static String? storedFor(ThemeMode mode) => switch (mode) {
        ThemeMode.light => 'light',
        ThemeMode.dark => 'dark',
        ThemeMode.system => null,
      };

  Future<void> setMode(ThemeMode mode) async {
    if (_mode == mode) return;
    _mode = mode;
    notifyListeners();

    try {
      final prefs = await SharedPreferences.getInstance();
      final stored = storedFor(mode);
      if (stored == null) {
        await prefs.remove(storageKey);
      } else {
        await prefs.setString(storageKey, stored);
      }
    } catch (_) {
      // A write failure only costs persistence, not the current session.
    }
  }

  /// Flips light↔dark relative to what is on screen [currentlyShown].
  ///
  /// The argument matters when the mode is [ThemeMode.system]: the opposite of
  /// the *resolved* theme is what the user expects, not the opposite of the
  /// enum value.
  Future<void> toggleFrom(Brightness currentlyShown) =>
      setMode(currentlyShown == Brightness.dark ? ThemeMode.light : ThemeMode.dark);
}
