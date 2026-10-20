import '../core/json.dart';
import 'enums.dart';
import 'report_photo.dart';

class RoadReport {
  const RoadReport({
    required this.id,
    required this.referenceNo,
    required this.title,
    required this.description,
    required this.category,
    this.categoryOther,
    required this.priority,
    required this.latitude,
    required this.longitude,
    required this.moderationStatus,
    required this.repairStatus,
    this.addressText,
    this.areaLabel,
    this.rejectionReason,
    this.moderationNotes,
    this.moderatedAt,
    this.assignedAt,
    this.completedAt,
    this.completionNotes,
    this.completionOverride = false,
    this.citizenName,
    this.officerName,
    this.assignedOfficerId,
    this.photos = const [],
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String referenceNo;
  final String title;
  final String description;
  final IssueCategory category;

  /// Free-text description of the issue, only for [IssueCategory.other].
  final String? categoryOther;
  final Priority priority;
  final double latitude;
  final double longitude;
  final String? addressText;
  final String? areaLabel;
  final ModerationStatus moderationStatus;
  final RepairStatus repairStatus;
  final String? rejectionReason;
  final String? moderationNotes;
  final DateTime? moderatedAt;
  final DateTime? assignedAt;
  final DateTime? completedAt;
  final String? completionNotes;
  final bool completionOverride;
  final String? citizenName;
  final String? officerName;
  final String? assignedOfficerId;
  final List<ReportPhoto> photos;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  bool get onPublicMap => moderationStatus == ModerationStatus.approved;
  bool get isRejected => moderationStatus == ModerationStatus.rejected;
  bool get isCompleted =>
      repairStatus == RepairStatus.completed ||
      repairStatus == RepairStatus.verifiedCompleted;
  bool get isAwaitingVerification =>
      repairStatus == RepairStatus.awaitingVerification;

  String get locationLabel {
    final parts = [
      addressText,
      areaLabel,
    ].where((e) => e != null && e.trim().isNotEmpty).cast<String>();
    if (parts.isNotEmpty) return parts.join(' · ');
    return '${latitude.toStringAsFixed(5)}, ${longitude.toStringAsFixed(5)}';
  }

  /// Category as shown to users: `Other — <description>` when the reporter
  /// described the issue, the plain category label otherwise.
  String get categoryLabel {
    final other = categoryOther?.trim() ?? '';
    if (category == IssueCategory.other && other.isNotEmpty) {
      return '${category.label} — $other';
    }
    return category.label;
  }

  List<ReportPhoto> photosOf(PhotoKind kind) =>
      photos.where((p) => p.kind == kind).toList();

  ReportPhoto? get coverPhoto {
    final before = photosOf(PhotoKind.before);
    if (before.isNotEmpty) return before.first;
    return photos.isNotEmpty ? photos.first : null;
  }

  factory RoadReport.fromJson(Map<String, dynamic> json) => RoadReport(
    id: asString(json['id']),
    referenceNo: asString(json['referenceNo']),
    title: asString(json['title']),
    description: asString(json['description']),
    category: IssueCategory.fromApi(asStringOrNull(json['category'])),
    categoryOther: asStringOrNull(json['categoryOther']),
    priority: Priority.fromApi(asStringOrNull(json['priority'])),
    latitude: asDouble(json['latitude']),
    longitude: asDouble(json['longitude']),
    addressText: asStringOrNull(json['addressText']),
    areaLabel: asStringOrNull(json['areaLabel']),
    moderationStatus: ModerationStatus.fromApi(
      asStringOrNull(json['moderationStatus']),
    ),
    repairStatus: RepairStatus.fromApi(asStringOrNull(json['repairStatus'])),
    rejectionReason: asStringOrNull(json['rejectionReason']),
    moderatedAt: asDate(json['moderatedAt']),
    assignedAt: asDate(json['assignedAt']),
    completedAt: asDate(json['completedAt']),
    completionNotes: asStringOrNull(json['completionNotes']),
    completionOverride: asBool(json['completionOverride']),
    citizenName: json['citizen'] is Map
        ? asStringOrNull((json['citizen'] as Map)['fullName'])
        : null,
    officerName: json['assignedOfficer'] is Map
        ? asStringOrNull((json['assignedOfficer'] as Map)['fullName'])
        : null,
    assignedOfficerId: json['assignedOfficer'] is Map
        ? asStringOrNull((json['assignedOfficer'] as Map)['id'])
        : null,
    photos: asList(json['photos'])
        .map((p) => ReportPhoto.fromJson(asMap(p)))
        .toList(),
    createdAt: asDate(json['createdAt']),
    updatedAt: asDate(json['updatedAt']),
  );

  /// Used for local (offline) caching so submitted reports survive app restarts.
  Map<String, dynamic> toJson() => {
    'id': id,
    'referenceNo': referenceNo,
    'title': title,
    'description': description,
    'category': category.api,
    'categoryOther': categoryOther,
    'priority': priority.api,
    'latitude': latitude,
    'longitude': longitude,
    'addressText': addressText,
    'areaLabel': areaLabel,
    'moderationStatus': moderationStatus.api,
    'repairStatus': repairStatus.api,
    'rejectionReason': rejectionReason,
    'moderatedAt': moderatedAt?.toIso8601String(),
    'assignedAt': assignedAt?.toIso8601String(),
    'completedAt': completedAt?.toIso8601String(),
    'completionNotes': completionNotes,
    'completionOverride': completionOverride,
    'citizen': citizenName != null ? {'fullName': citizenName} : null,
    'assignedOfficer': officerName != null
        ? {'id': assignedOfficerId, 'fullName': officerName}
        : null,
    'photos': photos.map((p) => p.toJson()).toList(),
    'createdAt': createdAt?.toIso8601String(),
    'updatedAt': updatedAt?.toIso8601String(),
  };
}
