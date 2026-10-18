import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import 'package:roadwatch/core/api_client.dart';
import 'package:roadwatch/core/token_store.dart';
import 'package:roadwatch/models/enums.dart';
import 'package:roadwatch/models/report.dart';
import 'package:roadwatch/screens/reports/submit_report_screen.dart';
import 'package:roadwatch/services/roadwatch_api.dart';
import 'package:roadwatch/state/reports_provider.dart';
import 'package:roadwatch/theme/app_theme.dart';

/// Issue-category behaviour shared with the web platform and the API:
/// the required picker, the "Other" free-text rule and category display.
/// These run fully offline (no backend required).

const _otherField = Key('category-other-field');
const _otherError = 'Please describe the issue (at least 5 characters).';

RoadReport _report(IssueCategory category, {String? categoryOther}) => RoadReport(
      id: 'r1',
      referenceNo: 'RW-2026-000001',
      title: 'Test report',
      description: 'A description that is long enough for validation.',
      category: category,
      categoryOther: categoryOther,
      priority: Priority.medium,
      latitude: 14.6,
      longitude: 121.0,
      moderationStatus: ModerationStatus.pendingReview,
      repairStatus: RepairStatus.notAssigned,
    );

Future<void> _pumpSubmitScreen(WidgetTester tester) async {
  // The form is a ListView, so give the test a tall viewport: every child is
  // then laid out and no scrolling is needed to reach or assert on a field.
  tester.view.physicalSize = const Size(1200, 4000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  // No request is issued by this screen unless a report is actually submitted,
  // so the mock transport never has to answer.
  final api = RoadWatchApi(ApiClient(
    tokenStore: TokenStore(),
    httpClient: MockClient((req) async => http.Response('{}', 200)),
    baseUrl: 'http://example.test',
  ));
  await tester.pumpWidget(
    ChangeNotifierProvider<MyReportsProvider>(
      create: (_) => MyReportsProvider(api),
      child: MaterialApp(theme: AppTheme.light(), home: const SubmitReportScreen()),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _tapCategory(WidgetTester tester, String label) async {
  await tester.tap(find.widgetWithText(ChoiceChip, label));
  await tester.pumpAndSettle();
}

void main() {
  group('IssueCategory', () {
    test('offers the requested categories in the requested order', () {
      expect(
        IssueCategory.selectable.map((c) => c.api).toList(),
        ['POTHOLE', 'ROAD_CRACK', 'DAMAGED_PAVEMENT', 'FLOODING', 'ROAD_OBSTRUCTION', 'DAMAGED_DRAINAGE', 'OTHER'],
      );
      // Everything offered must be a real enum value, and nothing may repeat.
      for (final category in IssueCategory.selectable) {
        expect(IssueCategory.values, contains(category));
      }
      expect(IssueCategory.selectable.toSet().length, IssueCategory.selectable.length);
    });

    test('uses the wording from the specification', () {
      expect(IssueCategory.pothole.label, 'Pothole');
      expect(IssueCategory.roadCrack.label, 'Road cracks');
      expect(IssueCategory.damagedPavement.label, 'Damaged pavement');
      expect(IssueCategory.flooding.label, 'Flooding or water accumulation');
      expect(IssueCategory.roadObstruction.label, 'Road obstruction');
      expect(IssueCategory.other.label, 'Other');
    });

    test('maps the new road-obstruction value and still renders legacy values', () {
      expect(IssueCategory.fromApi('ROAD_OBSTRUCTION'), IssueCategory.roadObstruction);
      // A category missing from an older record must not crash the UI.
      expect(IssueCategory.fromApi(null), IssueCategory.other);
      expect(IssueCategory.fromApi('SOMETHING_RETIRED'), IssueCategory.other);
      // A value the pickers no longer offer still round-trips for old reports.
      expect(IssueCategory.damagedDrainage.api, 'DAMAGED_DRAINAGE');
    });
  });

  group('RoadReport.categoryLabel', () {
    test('shows the reporter\'s own words for "Other"', () {
      expect(
        _report(IssueCategory.other, categoryOther: 'Overgrown hedge blocking the sidewalk').categoryLabel,
        'Other — Overgrown hedge blocking the sidewalk',
      );
    });

    test('falls back to the plain label without a description', () {
      expect(_report(IssueCategory.other).categoryLabel, 'Other');
      expect(_report(IssueCategory.other, categoryOther: '   ').categoryLabel, 'Other');
    });

    test('ignores a stray description on another category', () {
      expect(_report(IssueCategory.pothole, categoryOther: 'stray').categoryLabel, 'Pothole');
    });

    test('reads the description from the API payload', () {
      final report = RoadReport.fromJson({
        'id': 'r9',
        'referenceNo': 'RW-2026-000009',
        'title': 'Blocked lane',
        'description': 'A description that is long enough.',
        'category': 'OTHER',
        'categoryOther': 'Fallen tree across the road',
        'priority': 'HIGH',
        'latitude': 14.6,
        'longitude': 121.0,
        'moderationStatus': 'APPROVED',
        'repairStatus': 'NOT_ASSIGNED',
      });
      expect(report.categoryOther, 'Fallen tree across the road');
      expect(report.categoryLabel, 'Other — Fallen tree across the road');
      // The value survives the offline cache round-trip too.
      expect(report.toJson()['categoryOther'], 'Fallen tree across the road');
    });

    test('handles a payload with no categoryOther (older records)', () {
      final report = RoadReport.fromJson({
        'id': 'r10',
        'referenceNo': 'RW-2026-000010',
        'title': 'Old record',
        'description': 'A description that is long enough.',
        'category': 'POTHOLE',
        'priority': 'MEDIUM',
        'latitude': 14.6,
        'longitude': 121.0,
        'moderationStatus': 'APPROVED',
        'repairStatus': 'NOT_ASSIGNED',
      });
      expect(report.categoryOther, isNull);
      expect(report.categoryLabel, 'Pothole');
    });
  });

  group('Submit report form', () {
    testWidgets('reveals the description field only for "Other", and requires it', (tester) async {
      await _pumpSubmitScreen(tester);
      expect(find.byKey(_otherField), findsNothing, reason: 'hidden for the default category');

      await _tapCategory(tester, 'Road obstruction');
      expect(find.byKey(_otherField), findsNothing, reason: 'still hidden for a normal category');

      await _tapCategory(tester, 'Other');
      expect(find.byKey(_otherField), findsOneWidget, reason: 'revealed for Other');

      // Submitting without a description is rejected before any request.
      final submit = find.widgetWithText(ElevatedButton, 'Submit report');
      await tester.tap(submit);
      await tester.pumpAndSettle();
      expect(find.text(_otherError), findsOneWidget);

      // Supplying one clears that error.
      await tester.enterText(find.byKey(_otherField), 'Fallen tree blocking the whole lane');
      await tester.tap(submit);
      await tester.pumpAndSettle();
      expect(find.text(_otherError), findsNothing);

      // Choosing an ordinary category hides (and stops requiring) the field.
      await _tapCategory(tester, 'Pothole');
      expect(find.byKey(_otherField), findsNothing);
    });
  });
}
