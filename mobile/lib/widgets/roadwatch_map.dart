/// Shared OpenStreetMap building blocks for every RoadWatch map.
///
/// The app renders maps with `flutter_map` on OpenStreetMap raster tiles —
/// **no API key, no account, no billing**. This mirrors the web platform,
/// which uses Leaflet on the same tiles.
library;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/app_colors.dart';

/// OpenStreetMap standard raster tiles.
const String kOsmTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/// Sent as the `User-Agent` so OpenStreetMap can identify the app. Their tile
/// usage policy requires it; keep in sync with the Android `applicationId`.
const String kOsmUserAgentPackageName = 'gov.roadwatch.roadwatch';

const String kOsmAttributionText = 'OpenStreetMap contributors';
const String kOsmAttributionUrl = 'https://www.openstreetmap.org/copyright';

/// Standard tile layer used by every RoadWatch map.
TileLayer roadwatchTileLayer() => TileLayer(
  urlTemplate: kOsmTileUrl,
  userAgentPackageName: kOsmUserAgentPackageName,
  maxZoom: 19,
);

/// Attribution box — required by the OpenStreetMap tile usage policy.
Widget roadwatchAttribution() => LayoutBuilder(
  builder: (context, constraints) {
    final maxWidth = constraints.maxWidth.isFinite
        ? constraints.maxWidth
        : 240.0;
    return Align(
      alignment: Alignment.bottomRight,
      child: SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth),
          child: Material(
            color: AppColors.cardSurface.withValues(alpha: 0.9),
            child: InkWell(
              onTap: () => launchUrl(
                Uri.parse(kOsmAttributionUrl),
                mode: LaunchMode.externalApplication,
              ),
              child: Padding(
                padding: const EdgeInsets.all(3),
                child: Text.rich(
                  const TextSpan(
                    children: [
                      TextSpan(text: 'flutter_map | © '),
                      TextSpan(text: kOsmAttributionText),
                    ],
                  ),
                  style: TextStyle(
                    fontSize: 10,
                    color: AppColors.textSecondary,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  },
);

/// A public link to these coordinates on OpenStreetMap.
Uri openStreetMapUri(double latitude, double longitude) => Uri.parse(
  'https://www.openstreetmap.org/?mlat=$latitude&mlon=$longitude#map=17/$latitude/$longitude',
);

/// Circular, white-ringed status pin — the mobile twin of the web platform's
/// Leaflet dots.
class MapStatusDot extends StatelessWidget {
  const MapStatusDot({
    super.key,
    required this.color,
    this.size = 20,
    this.strokeColor = Colors.white,
  });

  final Color color;
  final double size;
  final Color strokeColor;

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: strokeColor, width: 2.5),
        boxShadow: [
          BoxShadow(
            color: AppColors.darkBlue.withValues(alpha: 0.28),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
    );
  }
}

/// The pin used for a searched place, which is not a report.
class MapSearchPoint extends StatelessWidget {
  const MapSearchPoint({super.key, this.size = 22});

  final double size;

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    return MapStatusDot(
      color: AppColors.darkBlue,
      strokeColor: AppColors.lightBlue,
      size: size,
    );
  }
}
