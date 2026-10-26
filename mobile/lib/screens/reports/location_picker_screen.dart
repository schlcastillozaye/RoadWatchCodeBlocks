import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../core/format.dart';
import '../../services/roadwatch_api.dart';
import '../../services/location_service.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_typography.dart';
import '../../widgets/app_button.dart';
import '../../widgets/roadwatch_map.dart';

class PickedLocation {
  const PickedLocation({
    required this.latitude,
    required this.longitude,
    this.address,
    this.areaLabel,
  });

  final double latitude;
  final double longitude;
  final String? address;
  final String? areaLabel;
}

/// Lets the citizen confirm the exact location on an OpenStreetMap map (no API
/// key needed), with GPS and manual coordinate entry as alternatives.
class LocationPickerScreen extends StatefulWidget {
  const LocationPickerScreen({
    super.key,
    this.initialLatitude,
    this.initialLongitude,
  });

  final double? initialLatitude;
  final double? initialLongitude;

  @override
  State<LocationPickerScreen> createState() => _LocationPickerScreenState();
}

class _LocationPickerScreenState extends State<LocationPickerScreen> {
  static const _defaultTarget = LatLng(
    14.7942,
    120.8790,
  ); // Bulacan State University area

  late double _latitude;
  late double _longitude;
  LatLng _center = _defaultTarget;

  final MapController _mapController = MapController();
  bool _mapReady = false;
  bool _showManual = false;
  Timer? _idleTimer;
  final _latController = TextEditingController();
  final _lngController = TextEditingController();

  String? _address;
  bool _locating = false;
  bool _geocoding = false;
  String? _notice;
  int _geocodeRequest = 0;

  @override
  void initState() {
    super.initState();
    _latitude = widget.initialLatitude ?? _defaultTarget.latitude;
    _longitude = widget.initialLongitude ?? _defaultTarget.longitude;
    _center = LatLng(_latitude, _longitude);
    _latController.text = _latitude.toStringAsFixed(6);
    _lngController.text = _longitude.toStringAsFixed(6);

    if (widget.initialLatitude == null) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _useCurrentLocation(auto: true),
      );
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => _reverseGeocode());
    }
  }

  @override
  void dispose() {
    _idleTimer?.cancel();
    _latController.dispose();
    _lngController.dispose();
    _mapController.dispose();
    super.dispose();
  }

  Future<void> _useCurrentLocation({bool auto = false}) async {
    setState(() {
      _locating = true;
      if (!auto) _notice = null;
    });
    final result = await LocationService.getCurrentPosition();
    if (!mounted) return;
    setState(() => _locating = false);

    if (result.isSuccess) {
      final pos = result.position!;
      _applyPosition(pos.latitude, pos.longitude);
    } else {
      setState(
        () => _notice = result.message ?? 'Could not get your location.',
      );
    }
  }

  void _applyPosition(double lat, double lng) {
    setState(() {
      _latitude = lat;
      _longitude = lng;
      _center = LatLng(lat, lng);
      _latController.text = lat.toStringAsFixed(6);
      _lngController.text = lng.toStringAsFixed(6);
      _address = null;
    });
    if (_mapReady) {
      _mapController.move(_center, _mapController.camera.zoom);
    }
    _reverseGeocode();
  }

  /// Tracks the map centre while the user drags.
  void _onPositionChanged(MapCamera camera, bool hasGesture) {
    _center = camera.center;
    _latitude = camera.center.latitude;
    _longitude = camera.center.longitude;

    // flutter_map has no "camera idle" callback, so debounce instead: once
    // movement settles, sync the fields and look the address up again.
    _idleTimer?.cancel();
    _idleTimer = Timer(const Duration(milliseconds: 650), _onCameraIdle);
  }

  void _onCameraIdle() {
    if (!mounted) return;
    _latController.text = _latitude.toStringAsFixed(6);
    _lngController.text = _longitude.toStringAsFixed(6);
    _reverseGeocode();
  }

  Future<void> _reverseGeocode() async {
    final requestId = ++_geocodeRequest;
    final latitude = _latitude;
    final longitude = _longitude;
    final coordinateLabel =
        '${latitude.toStringAsFixed(6)}, ${longitude.toStringAsFixed(6)}';
    setState(() {
      _geocoding = true;
      _address = coordinateLabel;
      _areaLabel = null;
    });
    try {
      final api = context.read<RoadWatchApi>();
      final result = await api.reverseGeocode(
        latitude: latitude,
        longitude: longitude,
      );
      if (!mounted) return;
      if (requestId == _geocodeRequest) {
        setState(() {
          if (result.available) {
            _address = result.address ?? coordinateLabel;
            _areaLabel = result.areaLabel;
          }
        });
      }
    } catch (_) {
      if (!mounted || requestId != _geocodeRequest) return;
      setState(() => _address = coordinateLabel);
    } finally {
      if (mounted && requestId == _geocodeRequest) {
        setState(() => _geocoding = false);
      }
    }
  }

  String? _areaLabel;

  void _applyManual() {
    final lat = double.tryParse(_latController.text.trim());
    final lng = double.tryParse(_lngController.text.trim());
    if (lat == null || lng == null || lat.abs() > 90 || lng.abs() > 180) {
      setState(
        () => _notice =
            'Enter valid latitude (-90..90) and longitude (-180..180).',
      );
      return;
    }
    _applyPosition(lat, lng);
  }

  void _confirm() {
    Navigator.of(context).pop(
      PickedLocation(
        latitude: _latitude,
        longitude: _longitude,
        address: _address,
        areaLabel: _areaLabel,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    return Scaffold(
      backgroundColor: AppColors.sheetBackground,
      appBar: AppBar(title: const Text('Confirm location')),
      body: Column(
        children: [
          Expanded(child: _buildMap()),
          _buildFooter(),
        ],
      ),
    );
  }

  Widget _buildMap() {
    return Stack(
      children: [
        FlutterMap(
          mapController: _mapController,
          options: MapOptions(
            initialCenter: _center,
            initialZoom: 16.5,
            minZoom: 3,
            maxZoom: 19,
            interactionOptions: const InteractionOptions(
              flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
            ),
            onPositionChanged: _onPositionChanged,
            onMapReady: () {
              _mapReady = true;
              // The user's position may have arrived before the map was ready.
              _mapController.move(_center, 16.5);
            },
          ),
          children: [roadwatchTileLayer(), roadwatchAttribution()],
        ),
        // Fixed centre pin.
        IgnorePointer(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 34),
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.darkBlue,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.lightBlue, width: 3),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.darkBlue.withValues(alpha: 0.25),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Icon(
                  Icons.place_rounded,
                  color: AppColors.lightBlue,
                  size: 22,
                ),
              ),
            ),
          ),
        ),
        Positioned(
          top: 14,
          right: 14,
          child: RoadWatchMapZoomControls(
            controller: _mapController,
            enabled: _mapReady,
          ),
        ),
        Positioned(
          right: 14,
          bottom: 14,
          child: FloatingActionButton.small(
            heroTag: 'locate',
            tooltip: 'Use my current location',
            backgroundColor: AppColors.cardSurface,
            // `darkBlue` is near-black in dark mode and would disappear into the
            // dark card surface; the brand accent contrasts on both.
            foregroundColor: AppColors.brandAccent,
            onPressed: _locating ? null : () => _useCurrentLocation(),
            child: _locating
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.my_location_rounded),
          ),
        ),
      ],
    );
  }

  Widget _buildFooter() {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(28),
          topRight: Radius.circular(28),
        ),
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.place_rounded,
                    size: 18,
                    color: AppColors.brandAccent,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      formatCoords(_latitude, _longitude),
                      style: AppTypography.bodyStyle(
                        size: 14,
                        weight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              if (_geocoding)
                Row(
                  children: [
                    const SizedBox(
                      width: 12,
                      height: 12,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Looking up address…',
                      style: AppTypography.caption(size: 12),
                    ),
                  ],
                )
              else
                Text(
                  _address ??
                      (_notice ??
                          'Address lookup unavailable — coordinates will be used.'),
                  style: AppTypography.caption(
                    size: 12,
                    color: _notice != null
                        ? AppColors.statusAmberInk
                        : AppColors.textMuted,
                  ),
                ),
              const SizedBox(height: 14),
              AppButton(
                label: 'Use this location',
                icon: Icons.check_circle_rounded,
                onPressed: _confirm,
              ),
              const SizedBox(height: 4),
              TextButton.icon(
                onPressed: () => setState(() => _showManual = !_showManual),
                icon: Icon(
                  _showManual
                      ? Icons.expand_less_rounded
                      : Icons.keyboard_rounded,
                  size: 16,
                ),
                label: Text(
                  _showManual
                      ? 'Hide coordinate entry'
                      : 'Enter coordinates manually',
                ),
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.textSecondary,
                ),
              ),
              if (_showManual) ...[
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _latController,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                          signed: true,
                        ),
                        decoration: const InputDecoration(
                          labelText: 'Latitude',
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: _lngController,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                          signed: true,
                        ),
                        decoration: const InputDecoration(
                          labelText: 'Longitude',
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                AppButton(
                  label: 'Apply coordinates',
                  variant: AppButtonVariant.secondary,
                  icon: Icons.check_rounded,
                  onPressed: _applyManual,
                ),
              ] else
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    'Drag the map to move the pin.',
                    style: AppTypography.caption(size: 11.5),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
