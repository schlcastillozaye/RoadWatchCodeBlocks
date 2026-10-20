import '../core/json.dart';
import 'enums.dart';

class StatusHistoryEntry {
  const StatusHistoryEntry({
    required this.id,
    required this.type,
    required this.toValue,
    this.fromValue,
    this.note,
    this.actorName,
    this.actorRole,
    this.createdAt,
  });

  final String id;
  final String type;
  final String? fromValue;
  final String toValue;
  final String? note;
  final String? actorName;
  final UserRole? actorRole;
  final DateTime? createdAt;

  String get typeLabel => switch (type) {
    'CREATION' => 'Report submitted',
    'MODERATION' => 'Moderation',
    'ASSIGNMENT' => 'Assignment',
    'REPAIR' when actorRole == UserRole.admin => 'Admin repair verification',
    'REPAIR' when note?.startsWith('Completion evidence submitted: ') == true =>
      'Officer completion notes',
    'REPAIR' when actorRole == UserRole.maintenanceOfficer =>
      'Officer progress update',
    'REPAIR' => 'Repair update',
    _ => 'Update',
  };

  factory StatusHistoryEntry.fromJson(Map<String, dynamic> json) =>
      StatusHistoryEntry(
        id: asString(json['id']),
        type: asString(json['type'], 'UPDATE'),
        fromValue: asStringOrNull(json['fromValue']),
        toValue: asString(json['toValue']),
        note: asStringOrNull(json['note']),
        actorName: json['actor'] is Map
            ? asStringOrNull((json['actor'] as Map)['fullName'])
            : null,
        actorRole: json['actorRole'] != null
            ? UserRole.fromApi(asStringOrNull(json['actorRole']))
            : null,
        createdAt: asDate(json['createdAt']),
      );
}
