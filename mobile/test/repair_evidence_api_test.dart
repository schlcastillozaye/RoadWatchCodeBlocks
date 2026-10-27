import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:roadwatch/core/api_client.dart';
import 'package:roadwatch/core/api_exception.dart';
import 'package:roadwatch/core/token_store.dart';
import 'package:roadwatch/models/enums.dart';
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

  group('RoadWatchApi.addReportPhotos', () {
    test(
      'appends multiple after photos without changing repair status',
      () async {
        http.Request? received;
        final api = RoadWatchApi(
          ApiClient(
            tokenStore: TokenStore(),
            httpClient: MockClient((request) async {
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
                    'completionNotes': 'Repair sent for approval.',
                    'photos': [
                      {
                        'id': 'original-after',
                        'kind': 'AFTER',
                        'url': '/api/files/original',
                        'mimeType': 'image/png',
                        'sizeBytes': 3,
                        'isPublic': true,
                      },
                      {
                        'id': 'additional-after',
                        'kind': 'AFTER',
                        'url': '/api/files/additional',
                        'mimeType': 'image/png',
                        'sizeBytes': 3,
                        'caption': 'Additional repair evidence',
                        'createdAt': '2026-10-27T04:00:00.000Z',
                        'uploadedBy': {
                          'id': 'officer-1',
                          'fullName': 'Assigned Officer',
                          'role': 'MAINTENANCE_OFFICER',
                        },
                        'isPublic': true,
                      },
                    ],
                  },
                }),
                201,
                headers: {'content-type': 'application/json'},
              );
            }),
            baseUrl: 'https://api.example.test',
          ),
        );
        var progress = 0;

        final report = await api.addReportPhotos(
          'report-1',
          kind: PhotoKind.after,
          photos: const [
            UploadFile(
              field: 'afterPhotos',
              bytes: [1, 2, 3],
              filename: 'after-1.png',
            ),
            UploadFile(
              field: 'afterPhotos',
              bytes: [4, 5, 6],
              filename: 'after-2.png',
            ),
          ],
          onProgress: (sent, total) => progress = total == 0 ? 0 : sent,
        );

        expect(received?.method, 'POST');
        expect(received?.url.path, '/api/reports/report-1/photos');
        expect(received?.body, contains('name="kind"'));
        expect(received?.body, contains('AFTER'));
        expect(received?.body, contains('after-1.png'));
        expect(received?.body, contains('after-2.png'));
        expect(report.repairStatus.api, 'AWAITING_VERIFICATION');
        expect(
          report.photos.where((photo) => photo.kind == PhotoKind.after),
          hasLength(2),
        );
        final additional = report.photos.last;
        expect(additional.caption, 'Additional repair evidence');
        expect(additional.uploadedByName, 'Assigned Officer');
        expect(additional.uploadedByRole, 'MAINTENANCE_OFFICER');
        expect(additional.createdAt, isNotNull);
        expect(progress, greaterThan(0));
      },
    );
  });
}
