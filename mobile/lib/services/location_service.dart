import 'package:geolocator/geolocator.dart';

enum LocationOutcome { success, denied, deniedForever, serviceDisabled, error }

class LocationResult {
  const LocationResult(this.outcome, {this.position, this.message});

  final LocationOutcome outcome;
  final Position? position;
  final String? message;

  bool get isSuccess => outcome == LocationOutcome.success && position != null;
}

/// Wraps geolocator with friendly, non-crashing permission handling.
class LocationService {
  const LocationService._();

  static Future<LocationResult> getCurrentPosition() async {
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        return const LocationResult(
          LocationOutcome.serviceDisabled,
          message: 'Location services are turned off. Enable GPS to detect your position.',
        );
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied) {
        return const LocationResult(
          LocationOutcome.denied,
          message: 'Location permission denied. You can still drop a pin on the map manually.',
        );
      }
      if (permission == LocationPermission.deniedForever) {
        return const LocationResult(
          LocationOutcome.deniedForever,
          message: 'Location permission is permanently denied. Enable it in system settings, or pick the location manually.',
        );
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 20)),
      );
      return LocationResult(LocationOutcome.success, position: position);
    } catch (_) {
      return const LocationResult(
        LocationOutcome.error,
        message: 'Could not determine your location. You can place the pin manually.',
      );
    }
  }

  static Future<void> openAppSettings() => Geolocator.openAppSettings();

  static Future<void> openLocationSettings() => Geolocator.openLocationSettings();
}
