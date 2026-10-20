import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:roadwatch/models/enums.dart';
import 'package:roadwatch/theme/app_theme.dart';
import 'package:roadwatch/widgets/brand_logo.dart';
import 'package:roadwatch/widgets/brand_mark.dart';
import 'package:roadwatch/widgets/status_chip.dart';

Widget _wrap(Widget child) => MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(body: Center(child: child)),
    );

void main() {
  testWidgets('brand mark renders the Code Blocks symbol', (tester) async {
    await tester.pumpWidget(_wrap(const CodeBlocksMark(size: 24)));
    expect(find.byType(CodeBlocksMark), findsOneWidget);
  });

  testWidgets('brand logo shows the RoadBlocks wordmark and brand line', (tester) async {
    await tester.pumpWidget(_wrap(const BrandLogo(onDark: true, size: LogoSize.medium, showTagline: true)));
    expect(find.text('RoadBlocks'), findsOneWidget);
    expect(find.text('by Code Blocks Inc.'), findsOneWidget);
  });

  testWidgets('status chip labels categories and repair states', (tester) async {
    await tester.pumpWidget(_wrap(const StatusChip(repair: RepairStatus.inProgress)));
    expect(find.text('In progress'), findsOneWidget);

    await tester.pumpWidget(_wrap(const StatusChip(moderation: ModerationStatus.pendingReview)));
    expect(find.text('Pending review'), findsOneWidget);
  });

  test('enum round-trips match the backend API values', () {
    for (final status in ModerationStatus.values) {
      expect(ModerationStatus.fromApi(status.api), status);
    }
    for (final status in RepairStatus.values) {
      expect(RepairStatus.fromApi(status.api), status);
    }
    for (final category in IssueCategory.values) {
      expect(IssueCategory.fromApi(category.api), category);
    }
    for (final priority in Priority.values) {
      expect(Priority.fromApi(priority.api), priority);
    }
  });
}
