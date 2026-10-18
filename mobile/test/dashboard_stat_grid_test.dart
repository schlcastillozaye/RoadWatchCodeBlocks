import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:roadwatch/theme/app_theme.dart';
import 'package:roadwatch/widgets/dashboard_stat_grid.dart';

void main() {
  Widget dashboard() => MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: DashboardStatGrid(
              metrics: const [
                DashboardMetric(label: 'Total reports', value: '12', color: Colors.blue),
                DashboardMetric(label: 'Awaiting review', value: '4', color: Colors.orange),
                DashboardMetric(label: 'In repair', value: '3', color: Colors.indigo),
                DashboardMetric(label: 'Completed', value: '5', color: Colors.green),
              ],
            ),
          ),
        ),
      );

  testWidgets('dashboard metrics use a readable two-column grid on phones', (tester) async {
    await tester.binding.setSurfaceSize(const Size(375, 667));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(dashboard());

    expect(tester.takeException(), isNull);
    final first = tester.getTopLeft(find.byKey(const ValueKey('dashboard-stat-Total reports')));
    final second = tester.getTopLeft(find.byKey(const ValueKey('dashboard-stat-Awaiting review')));
    final third = tester.getTopLeft(find.byKey(const ValueKey('dashboard-stat-In repair')));
    expect(second.dy, first.dy);
    expect(third.dy, greaterThan(first.dy));
  });

  testWidgets('dashboard metrics use four columns when tablet width permits', (tester) async {
    await tester.binding.setSurfaceSize(const Size(768, 1024));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(dashboard());

    expect(tester.takeException(), isNull);
    final positions = [
      'Total reports',
      'Awaiting review',
      'In repair',
      'Completed',
    ].map((label) => tester.getTopLeft(find.byKey(ValueKey('dashboard-stat-$label'))).dy);
    expect(positions.toSet(), hasLength(1));
  });
}
