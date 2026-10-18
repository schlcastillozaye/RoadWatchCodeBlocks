import 'package:flutter_test/flutter_test.dart';
import 'package:roadwatch/models/enums.dart';
import 'package:roadwatch/models/maintenance_notification.dart';

void main() {
  test('parses persistent assignment notification fields', () {
    final notification = MaintenanceNotification.fromJson({
      'id': 'notification-1',
      'assignmentId': 'assignment-1',
      'reportId': 'report-1',
      'referenceNo': 'RW-2026-000001',
      'title': 'New road issue assigned',
      'message': 'RW-2026-000001 · POTHOLE · Main Road',
      'category': 'POTHOLE',
      'location': 'Main Road',
      'repairStatus': 'AWAITING_MAINTENANCE',
      'isRead': true,
      'createdAt': '2026-01-20T10:00:00Z',
      'readAt': '2026-01-20T10:05:00Z',
    });

    expect(notification.id, 'notification-1');
    expect(notification.assignmentId, 'assignment-1');
    expect(notification.reportId, 'report-1');
    expect(notification.category, IssueCategory.pothole);
    expect(notification.repairStatus, RepairStatus.awaitingMaintenance);
    expect(notification.isRead, isTrue);
    expect(
      notification.createdAt,
      DateTime.parse('2026-01-20T10:00:00Z').toLocal(),
    );
    expect(
      notification.readAt,
      DateTime.parse('2026-01-20T10:05:00Z').toLocal(),
    );
  });
}
