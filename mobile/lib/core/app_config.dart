import 'package:flutter/foundation.dart';

/// Environment configuration for the mobile app.
///
/// Override at build/run time, e.g.:
///   flutter run --dart-define=API_BASE_URL=http://192.168.1.20:4000
///               --dart-define=GOOGLE_MAPS_API_KEY=your_key
class AppConfig {
  AppConfig._();

  static const String productName = 'RoadWatch';
  static const String brandName = 'Code Blocks Inc.';
  static const String tagline = 'Report road issues. Track the repair.';

  static const String _apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:4000',
  );

  /// Google Maps key for the mobile SDK. When empty the app degrades
  /// gracefully to a list-based map view instead of failing.
  ///
  /// This dart-define only tells the Dart side that maps are enabled. The
  /// native SDK still needs the key delivered separately:
  ///   - Android: Gradle manifest placeholder (see android/app/build.gradle.kts)
  ///   - iOS:     GOOGLE_MAPS_API_KEY in ios/Flutter/Maps.xcconfig
  static const String googleMapsApiKey = String.fromEnvironment('GOOGLE_MAPS_API_KEY');

  static bool get mapsConfigured => googleMapsApiKey.trim().isNotEmpty;

  /// On the Android emulator `localhost` is the emulator itself; the host
  /// machine is reachable at 10.0.2.2.
  static String get apiBaseUrl {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android && _apiBaseUrl.contains('localhost')) {
      return _apiBaseUrl.replaceAll('localhost', '10.0.2.2');
    }
    return _apiBaseUrl;
  }

  /// Normalises a possibly-relative URL returned by the API into an absolute one.
  static String absoluteUrl(String url) {
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    final base = apiBaseUrl.endsWith('/') ? apiBaseUrl.substring(0, apiBaseUrl.length - 1) : apiBaseUrl;
    return url.startsWith('/') ? '$base$url' : '$base/$url';
  }
}
