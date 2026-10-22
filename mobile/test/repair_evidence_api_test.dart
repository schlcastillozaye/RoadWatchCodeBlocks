import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:roadwatch/core/api_client.dart';
import 'package:roadwatch/core/api_exception.dart';
import 'package:roadwatch/core/token_store.dart';
import 'package:roadwatch/services/roadwatch_api.dart';

void main() {
  group('RoadWatchApi.submitRepairEvidence', () {
    test(
      'posts completion notes and after photos in one multipart request',
      () async {
        http.Request? received;
        final client = MockClient((request) async {
          received = request;
          return http.Response(
            jsonEncode({
              'report': {
                'id': 'report-1',
                'referenceNo': 'RW-2026-000001',
                'title': 'Road repair',
                'description': 'A damaged road surface.',
                'category': 'POTHOLE',
                'priority': 'HIGH',
                'latitude': 14.6,
                'longitude': 121.0,
                'moderationStatus': 'APPROVED',
                'repairStatus': 'AWAITING_VERIFICATION',
                'completionNotes': 'Filled and levelled the pothole.',
                'photos': [
                  {
                    'id': 'photo-1',
                    'kind': 'AFTER',
                    'url': '/api/files/photo-1',
                    'mimeType': 'image/png',
                    'sizeBytes': 3,
                    'isPublic': false,
                  },
                ],
              },
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        });
        final api = RoadWatchApi(
          ApiClient(
            tokenStore: TokenStore(),
            httpClient: client,
            baseUrl: 'https://api.example.test',
          ),
        );

        final report = await api.submitRepairEvidence(
          'report-1',
          completionNotes: '  Filled and levelled the pothole.  ',
          photos: [
            const UploadFile(
              field: 'afterPhotos',
              bytes: [1, 2, 3],
              filename: 'after.png',
            ),
          ],
        );

        expect(received?.method, 'POST');
        expect(received?.url.path, '/api/reports/report-1/repair-evidence');
        expect(
          received?.headers['content-type'],
          startsWith('multipart/form-data;'),
        );
        expect(received?.body, contains('completionNotes'));
        expect(received?.body, contains('Filled and levelled the pothole.'));
        expect(received?.body, contains('name="afterPhotos"'));
        expect(received?.body, contains('after.png'));
        expect(report.repairStatus.api, 'AWAITING_VERIFICATION');
        expect(report.completionNotes, 'Filled and levelled the pothole.');
        expect(report.photos.single.kind.api, 'AFTER');
      },
    );

    test(
      'surfaces authorization and validation errors without reporting success',
      () async {
        for (final response in [
          (
            status: 403,
            code: 'FORBIDDEN',
            message: 'This report is not assigned to you.',
          ),
          (
            status: 422,
            code: 'VALIDATION_ERROR',
            message: 'At least one after-repair photo is required.',
          ),
        ]) {
          final api = RoadWatchApi(
            ApiClient(
              tokenStore: TokenStore(),
              httpClient: MockClient(
                (_) async => http.Response(
                  jsonEncode({
                    'error': {
                      'code': response.code,
                      'message': response.message,
                    },
                  }),
                  response.status,
                  headers: {'content-type': 'application/json'},
                ),
              ),
              baseUrl: 'https://api.example.test',
            ),
          );

          await expectLater(
            api.submitRepairEvidence(
              'report-1',
              completionNotes: 'Valid completion notes.',
              photos: [
                const UploadFile(
                  field: 'afterPhotos',
                  bytes: [1, 2, 3],
                  filename: 'after.png',
                ),
              ],
            ),
            throwsA(
              isA<ApiException>()
                  .having(
                    (error) => error.statusCode,
                    'status',
                    response.status,
                  )
                  .having(
                    (error) => error.message,
                    'message',
                    response.message,
                  ),
            ),
          );
        }
      },
    );
  });
}
