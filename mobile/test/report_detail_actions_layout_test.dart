import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:roadwatch/core/api_client.dart';
import 'package:roadwatch/core/token_store.dart';
import 'package:roadwatch/models/models.dart';
import 'package:roadwatch/screens/home/staff_dashboard_screen.dart';
import 'package:roadwatch/screens/reports/report_detail_screen.dart';
import 'package:roadwatch/services/roadwatch_api.dart';
import 'package:roadwatch/state/auth_provider.dart';
import 'package:roadwatch/state/reports_provider.dart';
import 'package:roadwatch/theme/app_colors.dart';
import 'package:roadwatch/theme/app_theme.dart';
import 'package:roadwatch/widgets/status_chip.dart';

class _FakeRoadWatchApi extends RoadWatchApi {
  _FakeRoadWatchApi(super.client, this.report, this.history);

  final RoadReport report;
  final List<StatusHistoryEntry> history;
  final deletedReports = <String>[];
  bool isDeleted = false;

  @override
  Future<RoadReport> getReport(String id) async => report;

  @override
  Future<List<StatusHistoryEntry>> getHistory(String id) async => history;

  @override
  Future<void> deleteAdminReport(String id) async {
    deletedReports.add(id);
    isDeleted = true;
  }

  @override
  Future<Paginated<RoadReport>> staffReports({
    int page = 1,
    int pageSize = 20,
    ModerationStatus? moderationStatus,
    RepairStatus? repairStatus,
  }) async => Paginated(
    items: isDeleted ? [] : [report],
    total: isDeleted ? 0 : 1,
    page: page,
    pageSize: pageSize,
    totalPages: isDeleted ? 0 : 1,
  );

  @override
  Future<Map<String, int>> adminReportStatistics() async => {
    'total': isDeleted ? 0 : 1,
    'pending': isDeleted ? 0 : 1,
    'approved': 0,
    'rejected': 0,
    'awaiting': 0,
    'inProgress': 0,
    'awaitingVerification': 0,
    'returnedForWork': 0,
    'completed': 0,
  };

  @override
  Future<List<MaintenanceNotification>> maintenanceNotifications({
    int limit = 50,
  }) async => [];
}

RoadReport _testReport() => RoadReport.fromJson({
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
});

Future<_FakeRoadWatchApi> _pumpAdminDashboard(
  WidgetTester tester,
  Size size,
) async {
  final report = _testReport();
  final api = _FakeRoadWatchApi(
    ApiClient(tokenStore: TokenStore(), baseUrl: 'https://example.test'),
    report,
    const [],
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
  await tester.binding.setSurfaceSize(size);
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        Provider<RoadWatchApi>.value(value: api),
        ChangeNotifierProvider<MyReportsProvider>(
          create: (_) => MyReportsProvider(api),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.light(),
        home: const StaffDashboardScreen(isAdmin: true, showAllReports: true),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return api;
}

class _TestAuthProvider extends AuthProvider {
  _TestAuthProvider(super.api, this._user);

  final AppUser _user;

  @override
  AppUser? get user => _user;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(
        const MethodChannel('plugins.flutter.io/path_provider'),
        (call) async => Directory.systemTemp.path,
      );

  Future<_FakeRoadWatchApi> pumpAt(
    WidgetTester tester,
    Size size, {
    ThemeData? theme,
    List<StatusHistoryEntry> initialHistory = const [],
  }) async {
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
      ApiClient(tokenStore: TokenStore(), baseUrl: 'https://example.test'),
      report,
      initialHistory,
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
          theme: theme ?? AppTheme.light(),
          home: Scaffold(
            body: ReportDetailScreen(
              reportId: 'report-1',
              initialReport: report,
              initialHistory: initialHistory,
            ),
          ),
        ),
      ),
    );
    for (var frame = 0; frame < 5; frame++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    return api;
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

  testWidgets('compact long status chips wrap without clipping or overflow', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(375, 667));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: const Scaffold(
          body: Center(
            child: SizedBox(
              width: 175,
              child: StatusChip(
                repair: RepairStatus.awaitingVerification,
                compact: true,
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Awaiting admin verification'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('administrator guidance stays readable in dark mode', (
    tester,
  ) async {
    const note = 'Please inspect and document the damaged road edge.';
    const returnReason =
        'The repair edge is still uneven; please finish leveling it.';
    final history = [
      const StatusHistoryEntry(
        id: 'history-1',
        type: 'ASSIGNMENT',
        toValue: 'AWAITING_MAINTENANCE',
        note: 'Assigned to Test Officer: $note',
        actorRole: UserRole.admin,
      ),
      const StatusHistoryEntry(
        id: 'history-2',
        type: 'REPAIR',
        toValue: 'RETURNED_FOR_WORK',
        note: 'Returned for further work: $returnReason',
        actorRole: UserRole.admin,
      ),
    ];
    await pumpAt(
      tester,
      const Size(375, 667),
      theme: AppTheme.dark(),
      initialHistory: history,
    );

    await tester.scrollUntilVisible(
      find.text('Administrator guidance'),
      300,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.textContaining(note), findsOneWidget);
    expect(find.text('Administrator guidance'), findsOneWidget);
    expect(find.text('Assignment instructions'), findsOneWidget);
    expect(find.text('Returned for further work'), findsOneWidget);
    expect(find.text(note), findsOneWidget);
    expect(find.text(returnReason), findsOneWidget);
    await tester.ensureVisible(find.text(note));
    await tester.pump();

    final textStyle = tester.widget<Text>(find.text(note)).style!;
    final foreground = textStyle.color!;
    final background = AppColors.tintBlue;
    double luminance(Color color) {
      final channels = [color.r, color.g, color.b].map((channel) {
        final value = channel * 255;
        return value <= 10.314
            ? value / 3294.6
            : math.pow((value / 255 + 0.055) / 1.055, 2.4).toDouble();
      }).toList();
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    }

    final foregroundLuminance = luminance(foreground);
    final backgroundLuminance = luminance(background);
    final contrast =
        (foregroundLuminance > backgroundLuminance
            ? foregroundLuminance
            : backgroundLuminance) +
        0.05;
    final ratio =
        contrast /
        ((foregroundLuminance < backgroundLuminance
                ? foregroundLuminance
                : backgroundLuminance) +
            0.05);
    expect(ratio, greaterThanOrEqualTo(4.5));
    expect(tester.takeException(), isNull);
  });

  testWidgets('admin confirms deletion for the report opened in details', (
    tester,
  ) async {
    final api = await pumpAt(tester, const Size(375, 667));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('Delete report'),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Delete report').first);
    await tester.pumpAndSettle();

    expect(find.text('Delete report?'), findsOneWidget);
    expect(find.textContaining('RW-2026-000001'), findsNWidgets(2));
    await tester.tap(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.text('Delete report'),
      ),
    );
    await tester.pumpAndSettle();

    expect(api.deletedReports, ['report-1']);
    final layoutError = tester.takeException();
    if (layoutError != null) debugDumpRenderTree();
    expect(layoutError, isNull);
  });

  testWidgets(
    'admin list details and delete refresh the report list on phone',
    (tester) async {
      final api = await _pumpAdminDashboard(tester, const Size(375, 667));

      expect(tester.takeException(), isNull);
      await tester.scrollUntilVisible(
        find.text('Details'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Details').first);
      await tester.pumpAndSettle();
      expect(find.text('A damaged road needs attention.'), findsOneWidget);
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(
        find.text('Delete'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Delete').first);
      await tester.pumpAndSettle();
      expect(find.text('Delete report?'), findsOneWidget);
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Delete report'),
        ),
      );
      await tester.pumpAndSettle();

      expect(api.deletedReports, ['report-1']);
      expect(find.text('No reports found'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
