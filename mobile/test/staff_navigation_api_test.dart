import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:roadwatch/core/api_client.dart';
import 'package:roadwatch/core/token_store.dart';
import 'package:roadwatch/models/enums.dart';
import 'package:roadwatch/services/roadwatch_api.dart';

void main() {
  test(
    'admin report deletion uses the admin endpoint and selected id',
    () async {
      final api = RoadWatchApi(
        ApiClient(
          tokenStore: TokenStore(),
          httpClient: MockClient((request) async {
            expect(request.method, 'DELETE');
            expect(
              request.url.toString(),
              'http://example.test/api/admin/reports/report%2F1',
            );
            return http.Response(
              jsonEncode({'success': true}),
              200,
              headers: {'content-type': 'application/json'},
            );
          }),
          baseUrl: 'http://example.test',
        ),
      );

      await api.deleteAdminReport('report/1');
    },
  );

  test(
    'admin statistics are read from the protected reports endpoint',
    () async {
      final api = RoadWatchApi(
        ApiClient(
          tokenStore: TokenStore(),
          httpClient: MockClient((request) async {
            expect(request.method, 'GET');
            expect(request.url.path, '/api/reports/stats');
            return http.Response(
              jsonEncode({
                'totals': {
                  'total': 20,
                  'pending': 3,
                  'approved': 12,
                  'rejected': 5,
                  'awaiting': 4,
                  'inProgress': 2,
                  'awaitingVerification': 1,
                  'returnedForWork': 1,
                  'completed': 4,
                },
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }),
          baseUrl: 'http://example.test',
        ),
      );

      expect(await api.adminReportStatistics(), {
        'total': 20,
        'pending': 3,
        'approved': 12,
        'rejected': 5,
        'awaiting': 4,
        'inProgress': 2,
        'awaitingVerification': 1,
        'returnedForWork': 1,
        'completed': 4,
      });
    },
  );

  test(
    'repair history requests only administrator-verified assignments',
    () async {
      final api = RoadWatchApi(
        ApiClient(
          tokenStore: TokenStore(),
          httpClient: MockClient((request) async {
            expect(request.url.path, '/api/maintenance/assignments');
            expect(
              request.url.queryParameters['repairStatus'],
              'VERIFIED_COMPLETED',
            );
            return http.Response(
              jsonEncode({
                'items': [],
                'total': 0,
                'page': 1,
                'pageSize': 50,
                'totalPages': 0,
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }),
          baseUrl: 'http://example.test',
        ),
      );

      await api.maintenanceAssignments(
        repairStatus: RepairStatus.verifiedCompleted,
      );
    },
  );

  test(
    'starting assigned repair sends the allowed in-progress transition',
    () async {
      final api = RoadWatchApi(
        ApiClient(
          tokenStore: TokenStore(),
          httpClient: MockClient((request) async {
            expect(request.method, 'PATCH');
            expect(request.url.path, '/api/reports/report-1/repair');
            expect(jsonDecode(request.body), {'repairStatus': 'IN_PROGRESS'});
            return http.Response(
              jsonEncode({
                'report': {
                  'id': 'report-1',
                  'referenceNo': 'RW-2026-000001',
                  'title': 'Road repair',
                  'description': 'A damaged road surface.',
                  'category': 'POTHOLE',
                  'latitude': 14.6,
                  'longitude': 121.0,
                  'moderationStatus': 'APPROVED',
                  'repairStatus': 'IN_PROGRESS',
                  'assignedOfficerId': 'officer-1',
                },
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }),
          baseUrl: 'https://example.test',
        ),
      );

      final updated = await api.updateRepair(
        'report-1',
        status: RepairStatus.inProgress,
      );
      expect(updated.repairStatus, RepairStatus.inProgress);
    },
  );
}
