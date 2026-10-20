import 'package:flutter/foundation.dart';

/// Environment configuration for the mobile app.
///
/// Override at build/run time, e.g.:
///   flutter run --dart-define=API_BASE_URL=http://192.168.1.20:4000
///   flutter build apk --release --dart-define=API_BASE_URL=https://your-api.up.railway.app
class AppConfig {
  AppConfig._();

  static const String productName = 'RoadBlocks';
  static const String brandName = 'Code Blocks Inc.';
  static const String tagline = 'Report road issues. Track the repair.';

  /// Application version, kept in step with `version:` in `pubspec.yaml` (and
  /// therefore with the Android `versionName`/`versionCode` of a release build).
  /// `test/version_test.dart` asserts the two agree, so the Profile screen can
  /// never advertise a version the APK was not built with.
  static const String appVersion = '1.0.3';
  static const String buildNumber = '5';

  /// e.g. `1.0.1+2`.
  static String get versionLabel => '$appVersion+$buildNumber';

  static const String _apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:4000',
  );

  /// The API origin this build talks to.
  ///
  /// A **release** build must be given a real, publicly reachable origin via
  /// `--dart-define=API_BASE_URL=…`; otherwise this throws instead of silently
  /// shipping an app that can only reach a developer's localhost.
  static String get apiBaseUrl => resolveApiBaseUrl(
    _apiBaseUrl,
    release: kReleaseMode,
    android: !kIsWeb && defaultTargetPlatform == TargetPlatform.android,
  );

  /// Pure resolver so the behaviour is unit-testable without a real build.
  ///
  /// - `release` + a `localhost`/`127.0.0.1` origin → throws (misconfiguration).
  /// - `android` + a `localhost` origin → rewritten to `10.0.2.2` (the emulator's
  ///   view of the host machine) — development only.
  @visibleForTesting
  static String resolveApiBaseUrl(
    String raw, {
    required bool release,
    required bool android,
  }) {
    if (release && (raw.contains('localhost') || raw.contains('127.0.0.1'))) {
      throw FlutterError(
        'API_BASE_URL was not configured for this release build.\n'
        'Rebuild with the deployed API origin, e.g.\n'
        '  flutter build apk --release --dart-define=API_BASE_URL=https://your-api.up.railway.app',
      );
    }
    if (android && raw.contains('localhost')) {
      return raw.replaceAll('localhost', '10.0.2.2');
    }
    return raw;
  }

  /// Normalises a possibly-relative URL returned by the API into an absolute one.
  static String absoluteUrl(String url) {
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    final base = apiBaseUrl.endsWith('/')
        ? apiBaseUrl.substring(0, apiBaseUrl.length - 1)
        : apiBaseUrl;
    return url.startsWith('/') ? '$base$url' : '$base/$url';
  }
}
