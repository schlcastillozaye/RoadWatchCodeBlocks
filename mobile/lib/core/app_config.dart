import 'package:flutter/foundation.dart';

/// Environment configuration for the mobile app.
///
/// Override at build/run time, e.g.:
///   flutter run --dart-define=API_BASE_URL=http://192.168.1.20:4000
class AppConfig {
  AppConfig._();

  static const String productName = 'RoadWatch';
  static const String brandName = 'Code Blocks Inc.';
  static const String tagline = 'Report road issues. Track the repair.';

  static const String _apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:4000',
  );

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
