import '../core/app_config.dart';
import '../core/json.dart';
import 'enums.dart';

/// Lightweight marker used by the public map (approved reports only).
class MapReport {
  const MapReport({
    required this.id,
    required this.referenceNo,
    required this.title,
    required this.category,
    required this.priority,
    required this.latitude,
    required this.longitude,
    required this.repairStatus,
    this.addressText,
    this.areaLabel,
    this.thumbnailUrl,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String referenceNo;
  final String title;
  final IssueCategory category;
  final Priority priority;
  final double latitude;
  final double longitude;
  final RepairStatus repairStatus;
  final String? addressText;
  final String? areaLabel;
  final String? thumbnailUrl;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  String get locationLabel {
    final parts = [addressText, areaLabel].where((e) => e != null && e.trim().isNotEmpty).cast<String>();
    return parts.isNotEmpty ? parts.join(' · ') : '${latitude.toStringAsFixed(5)}, ${longitude.toStringAsFixed(5)}';
  }

  factory MapReport.fromJson(Map<String, dynamic> json) => MapReport(
        id: asString(json['id']),
        referenceNo: asString(json['referenceNo']),
        title: asString(json['title']),
        category: IssueCategory.fromApi(asStringOrNull(json['category'])),
        priority: Priority.fromApi(asStringOrNull(json['priority'])),
        latitude: asDouble(json['latitude']),
        longitude: asDouble(json['longitude']),
        repairStatus: RepairStatus.fromApi(asStringOrNull(json['repairStatus'])),
        addressText: asStringOrNull(json['addressText']),
        areaLabel: asStringOrNull(json['areaLabel']),
        thumbnailUrl: json['thumbnailUrl'] != null ? AppConfig.absoluteUrl(asString(json['thumbnailUrl'])) : null,
        createdAt: asDate(json['createdAt']),
        updatedAt: asDate(json['updatedAt']),
      );
}
