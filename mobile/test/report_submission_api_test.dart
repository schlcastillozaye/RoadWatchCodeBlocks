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
    'report observations are sent as multipart fields and parsed back',
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
                  'title': 'Flooded road',
                  'description': 'Water covers the road.',
                  'category': 'FLOODING',
                  'priority': 'MEDIUM',
                  'latitude': 14.6,
                  'longitude': 121.0,
                  'moderationStatus': 'PENDING_REVIEW',
                  'repairStatus': 'NOT_ASSIGNED',
                  'destination': 'Road to San Isidro market',
                  'damageCause': 'Possible poor drainage',
                  'relatedCategories': ['POTHOLE'],
                  'surfaceCondition': 'UNKNOWN',
                },
              }),
              201,
              headers: {'content-type': 'application/json'},
            );
          }),
          baseUrl: 'https://api.example.test',
        ),
      );

      final report = await api.createReport(
        title: 'Flooded road',
        description: 'Water covers the road surface.',
        category: IssueCategory.flooding,
        latitude: 14.6,
        longitude: 121,
        destination: 'Road to San Isidro market',
        damageCause: 'Possible poor drainage',
        relatedCategories: ['POTHOLE'],
        surfaceCondition: 'UNKNOWN',
        photos: [
          const UploadFile(
            field: 'photos',
            bytes: [1, 2, 3],
            filename: 'flood.png',
          ),
        ],
      );

      expect(received?.method, 'POST');
      expect(received?.url.path, '/api/reports');
      expect(received?.body, contains('name="destination"'));
      expect(received?.body, contains('Road to San Isidro market'));
      expect(received?.body, contains('name="damageCause"'));
      expect(received?.body, contains('Possible poor drainage'));
      expect(received?.body, contains('"POTHOLE"'));
      expect(received?.body, contains('name="surfaceCondition"'));
      expect(report.destination, 'Road to San Isidro market');
      expect(report.damageCause, 'Possible poor drainage');
      expect(report.relatedCategories, ['POTHOLE']);
      expect(report.surfaceCondition, 'UNKNOWN');
    },
  );
}
