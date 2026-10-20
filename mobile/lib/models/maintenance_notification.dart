import '../core/json.dart';
import 'enums.dart';

class MaintenanceNotification {
  const MaintenanceNotification({
    required this.id,
    this.assignmentId,
    required this.reportId,
    required this.referenceNo,
    required this.title,
    required this.message,
    required this.category,
    required this.location,
    required this.repairStatus,
    required this.isRead,
    required this.createdAt,
    this.readAt,
    this.expiresAt,
  });

  final String id;
  final String? assignmentId;
  final String reportId;
  final String referenceNo;
  final String title;
  final String message;
  final IssueCategory category;
  final String location;
  final RepairStatus repairStatus;
  final bool isRead;
  final DateTime? createdAt;
  final DateTime? readAt;
  final DateTime? expiresAt;

  factory MaintenanceNotification.fromJson(Map<String, dynamic> json) =>
      MaintenanceNotification(
        id: asString(json['id']),
        assignmentId: asStringOrNull(json['assignmentId']),
        reportId: asString(json['reportId']),
        referenceNo: asString(json['referenceNo']),
        title: asString(json['title']),
        message: asString(json['message']),
        category: IssueCategory.fromApi(asStringOrNull(json['category'])),
        location: asString(json['location']),
        repairStatus: RepairStatus.fromApi(
          asStringOrNull(json['repairStatus']),
        ),
        isRead: asBool(json['isRead']),
        createdAt: asDate(json['createdAt']),
        readAt: asDate(json['readAt']),
        expiresAt: asDate(json['expiresAt']),
      );
}
