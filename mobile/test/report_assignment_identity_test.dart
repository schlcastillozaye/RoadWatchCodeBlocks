import 'package:flutter_test/flutter_test.dart';
import 'package:roadwatch/models/report.dart';

void main() {
  test('report model retains assigned officer identity for action gating', () {
    final report = RoadReport.fromJson({
      'id': 'report-1',
      'referenceNo': 'RW-2026-000001',
      'title': 'Road damage',
      'description': 'A damaged road needs attention.',
      'category': 'POTHOLE',
      'priority': 'MEDIUM',
      'latitude': 14.8,
      'longitude': 120.9,
      'moderationStatus': 'APPROVED',
      'repairStatus': 'IN_PROGRESS',
      'assignedOfficer': {
        'id': 'officer-42',
        'fullName': 'Maintenance Officer',
      },
    });

    expect(report.assignedOfficerId, 'officer-42');
    expect(
      (report.toJson()['assignedOfficer'] as Map<String, dynamic>)['id'],
      'officer-42',
    );
  });
}
