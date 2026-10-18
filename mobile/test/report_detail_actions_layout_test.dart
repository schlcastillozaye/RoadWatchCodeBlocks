import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:roadwatch/core/api_client.dart';
import 'package:roadwatch/core/token_store.dart';
import 'package:roadwatch/models/models.dart';
import 'package:roadwatch/screens/reports/report_detail_screen.dart';
import 'package:roadwatch/services/roadwatch_api.dart';
import 'package:roadwatch/state/auth_provider.dart';
import 'package:roadwatch/state/reports_provider.dart';
import 'package:roadwatch/theme/app_theme.dart';

class _FakeRoadWatchApi extends RoadWatchApi {
  _FakeRoadWatchApi(super.client, this.report);

  final RoadReport report;

  @override
  Future<RoadReport> getReport(String id) async => report;

  @override
  Future<List<StatusHistoryEntry>> getHistory(String id) async => [];
}

class _TestAuthProvider extends AuthProvider {
  _TestAuthProvider(super.api, this._user);

  final AppUser _user;

  @override
  AppUser? get user => _user;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<void> pumpAt(WidgetTester tester, Size size) async {
    final reportJson = {
      'id': 'report-1',
      'referenceNo': 'RW-2026-000001',
      'title': 'Road damage',
      'description': 'A damaged road needs attention.',
      'category': 'POTHOLE',
      'priority': 'MEDIUM',
      'latitude': 14.8,
      'longitude': 120.9,
      'moderationStatus': 'PENDING_REVIEW',
      'repairStatus': 'NOT_ASSIGNED',
      'photos': [],
    };
    final report = RoadReport.fromJson(reportJson);
    final api = _FakeRoadWatchApi(
      ApiClient(
        tokenStore: TokenStore(),
        baseUrl: 'https://example.test',
      ),
      report,
    );
    final auth = _TestAuthProvider(
      api,
      const AppUser(
        id: 'admin-1',
        fullName: 'Test Administrator',
        email: 'admin@example.test',
        role: UserRole.admin,
      ),
    );
    final reports = MyReportsProvider(api);

    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthProvider>.value(value: auth),
          Provider<RoadWatchApi>.value(value: api),
          ChangeNotifierProvider<MyReportsProvider>.value(value: reports),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: ReportDetailScreen(
              reportId: 'report-1',
              initialReport: report,
            ),
          ),
        ),
      ),
    );
    for (var frame = 0; frame < 5; frame++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  testWidgets('review actions stack on phones and align on wider screens', (
    tester,
  ) async {
    for (final size in [
      const Size(375, 667),
      const Size(768, 1024),
      const Size(1440, 900),
    ]) {
      await pumpAt(tester, size);

      final approve = tester.getRect(find.text('Approve report'));
      final reject = tester.getRect(find.text('Reject report'));
      expect(approve.overlaps(reject), isFalse);
      if (size.width == 375) {
        expect(approve.bottom, lessThanOrEqualTo(reject.top));
      } else {
        expect(approve.top, closeTo(reject.top, 1));
        expect(approve.right, lessThanOrEqualTo(reject.left));
      }
      expect(tester.takeException(), isNull);
    }
  });
}
