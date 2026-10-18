import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'package:roadwatch/core/app_config.dart';
import 'package:roadwatch/models/enums.dart';
import 'package:roadwatch/models/map_report.dart';
import 'package:roadwatch/models/report.dart';

/// Opt-in contract test: proves the **mobile models parse real API payloads**,
/// not just hand-written fixtures. It is read-only and skipped unless a live
/// API is supplied:
///
/// ```powershell
/// flutter test test/live_contract_test.dart --dart-define=RW_LIVE_API=http://127.0.0.1:4000 --dart-define=RW_LIVE_PASSWORD=<secure-test-password>
/// ```
///
/// Supply a non-production test password with `--dart-define=RW_LIVE_PASSWORD=...`;
/// never put account passwords in this source file or run this contract against
/// production accounts.
const _base = String.fromEnvironment('RW_LIVE_API');
const _citizenEmail = 'citizen@example.com';
const _citizenPassword = String.fromEnvironment('RW_LIVE_PASSWORD');

/// Every value the API documents. The apps offer a subset, but all of these must
/// round-trip through the model so older reports keep rendering.
const _apiCategories = {
  'POTHOLE',
  'ROAD_CRACK',
  'DAMAGED_PAVEMENT',
  'FLOODING',
  'ROAD_OBSTRUCTION',
  'DAMAGED_DRAINAGE',
  'OTHER',
};

Future<Map<String, dynamic>> _get(String path, {String? token}) async {
  final response = await http.get(
    Uri.parse('$_base$path'),
    headers: token == null ? null : {'Authorization': 'Bearer $token'},
  );
  if (response.statusCode != 200) {
    fail('GET $path expected 200, got ${response.statusCode}: ${response.body}');
  }
  return jsonDecode(response.body) as Map<String, dynamic>;
}

void main() {
  test(
    'live API payloads parse with the mobile models',
    () async {
      // 1. Public map feed (no auth) — approved reports only.
      final map = await _get('/api/map/reports?pageSize=50');
      final items = (map['items'] as List).cast<Map<String, dynamic>>();
      expect(items, isNotEmpty, reason: 'the public map should have approved reports');

      for (final item in items) {
        final report = MapReport.fromJson(item);
        final raw = item['category'] as String;
        expect(_apiCategories, contains(raw), reason: 'unknown category in payload: $raw');
        expect(report.category.api, raw, reason: 'MapReport lost the category $raw');
        expect(report.referenceNo, isNotEmpty);
        expect(report.title, isNotEmpty);
        expect(report.latitude, inInclusiveRange(-90, 90));
        expect(report.longitude, inInclusiveRange(-180, 180));
        // The field must exist in the response even when unused — a missing
        // field is the exact bug class this test guards against.
        expect(item.containsKey('categoryOther'), isTrue, reason: 'categoryOther missing from the map payload');
        final other = item['categoryOther'];
        expect(other == null || other is String, isTrue);
        if (report.category == IssueCategory.other && (other as String?)?.isNotEmpty == true) {
          expect(report.categoryLabel, contains(other!));
        }
        if (report.thumbnailUrl != null) {
          final absolute = AppConfig.absoluteUrl(report.thumbnailUrl!);
          expect(absolute, startsWith('http'), reason: 'photo URL must resolve to an absolute URL');
        }
      }

      // 2. Sign in as the demo citizen and read their own reports.
      final login = await http.post(
        Uri.parse('$_base/api/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': _citizenEmail, 'password': _citizenPassword}),
      );
      expect(login.statusCode, 200, reason: 'demo citizen login failed: ${login.body}');
      final token = (jsonDecode(login.body) as Map<String, dynamic>)['accessToken'] as String;

      final mine = await _get('/api/reports/mine?pageSize=50', token: token);
      final reports = (mine['items'] as List).cast<Map<String, dynamic>>();
      expect(reports, isNotEmpty, reason: 'the demo citizen should own reports');

      for (final item in reports) {
        final report = RoadReport.fromJson(item);
        final raw = item['category'] as String;
        expect(report.category.api, raw, reason: 'RoadReport lost the category $raw');
        expect(item.containsKey('categoryOther'), isTrue, reason: 'categoryOther missing from /api/reports/mine');
        expect(report.categoryOther, item['categoryOther'] as String?);
        if (raw == 'OTHER' && (report.categoryOther?.isNotEmpty ?? false)) {
          expect(report.categoryLabel, contains(report.categoryOther!));
        } else if (report.categoryOther == null) {
          expect(report.categoryLabel, report.category.label);
        }
        expect(report.moderationStatus.name, isNotEmpty);
        expect(report.repairStatus.name, isNotEmpty);
        expect(report.createdAt, isNotNull);
        for (final photo in report.photos) {
          expect(photo.url, isNotEmpty);
          expect(AppConfig.absoluteUrl(photo.url), startsWith('http'));
        }
      }

      // 3. A photo on one of those reports must actually load.
      final withPhoto = reports.firstWhere(
        (r) => ((r['photos'] as List?) ?? const []).isNotEmpty,
        orElse: () => throw StateError('no report with a photo'),
      );
      final photoUrl = AppConfig.absoluteUrl(((withPhoto['photos'] as List).first as Map)['url'] as String);
      final photo = await http.get(Uri.parse(photoUrl), headers: {'Authorization': 'Bearer $token'});
      expect(photo.statusCode, 200, reason: 'photo $photoUrl did not load: ${photo.statusCode}');
      expect(photo.headers['content-type'], startsWith('image/'));
      expect(photo.bodyBytes, isNotEmpty);
    },
    skip: _base.isEmpty || _citizenPassword.isEmpty
        ? 'set RW_LIVE_API and RW_LIVE_PASSWORD test defines to run this live test'
        : false,
    timeout: const Timeout(Duration(seconds: 90)),
  );
}
