import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:roadwatch/theme/app_theme.dart';
import 'package:roadwatch/theme/roadwatch_palette.dart';
import 'package:roadwatch/widgets/brand_logo.dart';
import 'package:roadwatch/widgets/section_card.dart';
import 'package:roadwatch/widgets/status_chip.dart';
import 'package:roadwatch/models/enums.dart';

/// Reads back the fill of the first [Container] inside the matched widget, which
/// is how these widgets paint their brand surface.
Color _fillOf(WidgetTester tester, Finder of) {
  final container = tester.widget<Container>(
    find.descendant(of: of, matching: find.byType(Container)).first,
  );
  return (container.decoration! as BoxDecoration).color!;
}

Widget _app(ThemeMode mode, Widget home) => MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: mode,
      home: home,
    );

void main() {
  // AppColors reads an active palette from a global, so Flutter cannot know the
  // colours changed on its own. These tests deliberately build the widgets as
  // `const`, which is exactly the case where a widget is skipped during a parent
  // rebuild: they fail if AppColors.syncTo(context) is dropped from a build
  // method, because the widget would keep painting the previous theme.
  testWidgets('a const widget re-themes when the theme changes', (tester) async {
    await tester.pumpWidget(_app(
      ThemeMode.light,
      const Scaffold(body: SectionCard(child: Text('hello'))),
    ));
    expect(_fillOf(tester, find.byType(SectionCard)), RoadWatchPalette.light.surface);

    await tester.pumpWidget(_app(
      ThemeMode.dark,
      const Scaffold(body: SectionCard(child: Text('hello'))),
    ));
    await tester.pumpAndSettle(); // let AnimatedTheme finish.
    expect(_fillOf(tester, find.byType(SectionCard)), RoadWatchPalette.dark.surface);
  });

  testWidgets('the status chip uses accessible ink text in both themes', (tester) async {
    await tester.pumpWidget(_app(
      ThemeMode.light,
      const Scaffold(body: StatusChip(moderation: ModerationStatus.approved)),
    ));
    expect(
      tester.widget<Text>(find.text('Approved')).style!.color,
      RoadWatchPalette.light.greenInk,
    );

    await tester.pumpWidget(_app(
      ThemeMode.dark,
      const Scaffold(body: StatusChip(moderation: ModerationStatus.approved)),
    ));
    await tester.pumpAndSettle();
    expect(
      tester.widget<Text>(find.text('Approved')).style!.color,
      RoadWatchPalette.dark.greenInk,
    );
  });

  testWidgets('the wordmark stays legible on a light page in dark mode', (tester) async {
    await tester.pumpWidget(_app(
      ThemeMode.dark,
      const Scaffold(body: BrandLogo(onDark: false)),
    ));
    await tester.pumpAndSettle();
    expect(
      tester.widget<Text>(find.text('RoadWatch')).style!.color,
      RoadWatchPalette.dark.ink,
    );
  });
}
