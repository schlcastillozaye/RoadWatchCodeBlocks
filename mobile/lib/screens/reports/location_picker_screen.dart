import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';

import '../../core/app_config.dart';
import '../../core/format.dart';
import '../../services/roadwatch_api.dart';
import '../../services/location_service.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_typography.dart';
import '../../widgets/app_button.dart';
import '../../widgets/section_card.dart';

class PickedLocation {
  const PickedLocation({required this.latitude, required this.longitude, this.address, this.areaLabel});

  final double latitude;
  final double longitude;
  final String? address;
  final String? areaLabel;
}

/// Lets the citizen confirm the exact location. Uses a real Google Map when an
/// API key is configured, and degrades to precise manual coordinates otherwise.
class LocationPickerScreen extends StatefulWidget {
  const LocationPickerScreen({super.key, this.initialLatitude, this.initialLongitude});

  final double? initialLatitude;
  final double? initialLongitude;

  @override
  State<LocationPickerScreen> createState() => _LocationPickerScreenState();
}

class _LocationPickerScreenState extends State<LocationPickerScreen> {
  static const _defaultTarget = LatLng(14.7942, 120.8790); // Bulacan State University area

  late double _latitude;
  late double _longitude;
  LatLng _center = _defaultTarget;

  GoogleMapController? _mapController;
  final _latController = TextEditingController();
  final _lngController = TextEditingController();

  String? _address;
  bool _locating = false;
  bool _geocoding = false;
  String? _notice;

  @override
  void initState() {
    super.initState();
    _latitude = widget.initialLatitude ?? _defaultTarget.latitude;
    _longitude = widget.initialLongitude ?? _defaultTarget.longitude;
    _center = LatLng(_latitude, _longitude);
    _latController.text = _latitude.toStringAsFixed(6);
    _lngController.text = _longitude.toStringAsFixed(6);

    if (widget.initialLatitude == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _useCurrentLocation(auto: true));
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => _reverseGeocode());
    }
  }

  @override
  void dispose() {
    _latController.dispose();
    _lngController.dispose();
    _mapController?.dispose();
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
      setState(() => _notice = result.message ?? 'Could not get your location.');
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
    _mapController?.animateCamera(CameraUpdate.newLatLng(_center));
    _reverseGeocode();
  }

  Future<void> _reverseGeocode() async {
    setState(() => _geocoding = true);
    try {
      final api = context.read<RoadWatchApi>();
      final result = await api.reverseGeocode(latitude: _latitude, longitude: _longitude);
      if (!mounted) return;
      setState(() {
        if (result.available) {
          _address = result.address;
          _areaLabel = result.areaLabel;
        } else {
          _address = null;
        }
      });
    } catch (_) {
      // Geolocation lookup is optional; the coordinates alone are enough.
    } finally {
      if (mounted) setState(() => _geocoding = false);
    }
  }

  String? _areaLabel;

  void _applyManual() {
    final lat = double.tryParse(_latController.text.trim());
    final lng = double.tryParse(_lngController.text.trim());
    if (lat == null || lng == null || lat.abs() > 90 || lng.abs() > 180) {
      setState(() => _notice = 'Enter valid latitude (-90..90) and longitude (-180..180).');
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
    final mapsReady = AppConfig.mapsConfigured;

    return Scaffold(
      backgroundColor: AppColors.sheetBackground,
      appBar: AppBar(title: const Text('Confirm location')),
      body: Column(
        children: [
          Expanded(
            child: mapsReady
                ? _buildMap()
                : _buildFallback(),
          ),
          _buildFooter(mapsReady),
        ],
      ),
    );
  }

  Widget _buildMap() {
    return Stack(
      children: [
        GoogleMap(
          initialCameraPosition: CameraPosition(target: _center, zoom: 16.5),
          myLocationEnabled: false,
          myLocationButtonEnabled: false,
          zoomControlsEnabled: false,
          compassEnabled: false,
          mapToolbarEnabled: false,
          onMapCreated: (controller) => _mapController = controller,
          onCameraMove: (position) {
            _center = position.target;
            _latitude = position.target.latitude;
            _longitude = position.target.longitude;
          },
          onCameraIdle: () {
            _latController.text = _latitude.toStringAsFixed(6);
            _lngController.text = _longitude.toStringAsFixed(6);
            _reverseGeocode();
          },
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
                    BoxShadow(color: AppColors.darkBlue.withValues(alpha: 0.25), blurRadius: 10, offset: const Offset(0, 4)),
                  ],
                ),
                child: const Icon(Icons.place_rounded, color: AppColors.lightBlue, size: 22),
              ),
            ),
          ),
        ),
        Positioned(
          right: 14,
          bottom: 14,
          child: FloatingActionButton.small(
            heroTag: 'locate',
            backgroundColor: AppColors.cardSurface,
            foregroundColor: AppColors.darkBlue,
            onPressed: _locating ? null : () => _useCurrentLocation(),
            child: _locating
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.my_location_rounded),
          ),
        ),
      ],
    );
  }

  Widget _buildFallback() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionCard(
            color: AppColors.lightYellow,
            child: Row(
              children: [
                const Icon(Icons.map_outlined, color: AppColors.darkBlue),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Map preview is unavailable because no Google Maps API key is configured. '
                    'Use GPS or type the coordinates below — this works exactly the same.',
                    style: AppTypography.bodyStyle(size: 13, color: AppColors.textSecondary),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text('Coordinates', style: AppTypography.headingStyle(size: 16)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _latController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                  decoration: const InputDecoration(labelText: 'Latitude'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _lngController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                  decoration: const InputDecoration(labelText: 'Longitude'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          AppButton(
            label: 'Apply coordinates',
            variant: AppButtonVariant.secondary,
            icon: Icons.check_rounded,
            onPressed: _applyManual,
          ),
          const SizedBox(height: 10),
          AppButton(
            label: _locating ? 'Detecting…' : 'Use my current location',
            icon: Icons.my_location_rounded,
            loading: _locating,
            onPressed: _locating ? null : () => _useCurrentLocation(),
          ),
        ],
      ),
    );
  }

  Widget _buildFooter(bool mapsReady) {
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.only(topLeft: Radius.circular(28), topRight: Radius.circular(28)),
        border: Border(top: BorderSide(color: AppColors.lightAzure)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      child: SafeArea(
        top: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.place_rounded, size: 18, color: AppColors.darkBlue),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    formatCoords(_latitude, _longitude),
                    style: AppTypography.bodyStyle(size: 14, weight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            if (_geocoding)
              Row(
                children: [
                  const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2)),
                  const SizedBox(width: 8),
                  Text('Looking up address…', style: AppTypography.caption(size: 12)),
                ],
              )
            else
              Text(
                _address ?? (_notice ?? 'Address lookup unavailable — coordinates will be used.'),
                style: AppTypography.caption(size: 12, color: _notice != null ? AppColors.statusAmber : AppColors.textMuted),
              ),
            const SizedBox(height: 14),
            AppButton(
              label: 'Use this location',
              icon: Icons.check_circle_rounded,
              onPressed: _confirm,
            ),
            if (mapsReady)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'Drag the map to move the pin.',
                  style: AppTypography.caption(size: 11.5),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
