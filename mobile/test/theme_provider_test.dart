import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:roadwatch/state/theme_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('stored preference mapping', () {
    test('reads the web app\'s light/dark values', () {
      expect(ThemeProvider.modeFromStored('dark'), ThemeMode.dark);
      expect(ThemeProvider.modeFromStored('light'), ThemeMode.light);
    });

    test('an absent or unrecognised value means "follow the system"', () {
      expect(ThemeProvider.modeFromStored(null), ThemeMode.system);
      expect(ThemeProvider.modeFromStored(''), ThemeMode.system);
      expect(ThemeProvider.modeFromStored('sepia'), ThemeMode.system);
    });

    test('only light and dark are ever persisted', () {
      expect(ThemeProvider.storedFor(ThemeMode.dark), 'dark');
      expect(ThemeProvider.storedFor(ThemeMode.light), 'light');
      expect(ThemeProvider.storedFor(ThemeMode.system), isNull);
    });
  });

  test('defaults to the system theme, then persists an explicit choice', () async {
    SharedPreferences.setMockInitialValues({});
    final provider = ThemeProvider();
    await provider.load();
    expect(provider.mode, ThemeMode.system);
    expect(provider.isLoaded, isTrue);

    await provider.setMode(ThemeMode.dark);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(ThemeProvider.storageKey), 'dark');

    // "System" clears the key instead of storing a third value, so the stored
    // format stays byte-compatible with the web platform.
    await provider.setMode(ThemeMode.system);
    expect(prefs.getString(ThemeProvider.storageKey), isNull);
  });

  test('a saved preference is restored on load', () async {
    SharedPreferences.setMockInitialValues({ThemeProvider.storageKey: 'dark'});
    final provider = ThemeProvider();
    await provider.load();
    expect(provider.mode, ThemeMode.dark);
  });

  test('toggling from the resolved brightness flips the other way', () async {
    SharedPreferences.setMockInitialValues({});
    final provider = ThemeProvider();

    // In system mode the enum says nothing about what is on screen, so the
    // resolved brightness decides the direction.
    await provider.toggleFrom(Brightness.dark);
    expect(provider.mode, ThemeMode.light);

    await provider.toggleFrom(Brightness.light);
    expect(provider.mode, ThemeMode.dark);
  });
}
