import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:roadwatch/theme/roadwatch_palette.dart';

/// WCAG relative-luminance and contrast-ratio maths, so the tokens the app
/// paints icons and labels with can be asserted, not eyeballed.
double _luminance(Color color) {
  double channel(double v) =>
      v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
  return 0.2126 * channel(color.r) +
      0.7152 * channel(color.g) +
      0.0722 * channel(color.b);
}

double _contrast(Color a, Color b) {
  final la = _luminance(a);
  final lb = _luminance(b);
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

/// Guards the dark-mode pass: every foreground token drawn on a card or a brand
/// chip must keep AA contrast in *both* palettes. These are the regressions the
/// old `AppColors.darkBlue`-on-a-surface usages caused in dark mode.
void main() {
  for (final theme in [
    ('light', RoadWatchPalette.light),
    ('dark', RoadWatchPalette.dark),
  ]) {
    final name = theme.$1;
    final p = theme.$2;

    test('$name: the foreground token is legible on a card surface', () {
      // Icons and labels drawn directly on `surface`/`cardSurface` use this
      // token (`AppColors.brandAccent`): navy in light mode, sky in dark mode.
      final accent = p.isDark ? p.sky : p.navy;
      expect(
        _contrast(accent, p.surface),
        greaterThanOrEqualTo(4.5),
        reason: '$name brandAccent must clear AA on the card surface',
      );
    });

    test('$name: navy ink stays legible on the cream brand chips', () {
      // The demo hint, offline banner and reference-number chips keep the light
      // cream fill in both themes, so their text must stay navy (not the
      // theme-swapped `textSecondary`).
      expect(_contrast(p.navy, p.cream), greaterThanOrEqualTo(4.5));
    });

    test('$name: borders meet non-text contrast on cards and inputs', () {
      expect(p.line, isNot(p.surface));
      expect(p.line, isNot(p.navy));
      expect(_contrast(p.line, p.surface), greaterThanOrEqualTo(3));
      expect(_contrast(p.line, p.inputSurface), greaterThanOrEqualTo(3));
    });

    test('$name: text and muted labels meet AA on app surfaces', () {
      for (final background in [p.surface, p.sheet, p.inputSurface]) {
        expect(_contrast(p.ink, background), greaterThanOrEqualTo(4.5));
        expect(_contrast(p.ink2, background), greaterThanOrEqualTo(4.5));
        expect(_contrast(p.ink3, background), greaterThanOrEqualTo(4.5));
      }
    });

    test('$name: status text meets AA on its matching tint', () {
      expect(_contrast(p.amberInk, p.amberTint), greaterThanOrEqualTo(4.5));
      expect(_contrast(p.greenInk, p.greenTint), greaterThanOrEqualTo(4.5));
      expect(_contrast(p.redInk, p.redTint), greaterThanOrEqualTo(4.5));
      expect(_contrast(p.blueInk, p.blueTint), greaterThanOrEqualTo(4.5));
    });
  }

  test(
    'dark mode: the theme-swapped secondary ink is unusable on a cream chip',
    () {
      // Documents *why* the cream chips hard-code navy: in dark mode
      // `textSecondary` resolves to a near-white that would vanish on the chip.
      expect(
        _contrast(RoadWatchPalette.dark.ink2, RoadWatchPalette.dark.cream),
        lessThan(4.5),
      );
    },
  );

  test('dark mode: navy is invisible on the dark card surface', () {
    // Documents the original bug the accent token fixes: `darkBlue` (navy) on a
    // dark card is effectively invisible.
    expect(
      _contrast(RoadWatchPalette.dark.navy, RoadWatchPalette.dark.surface),
      lessThan(1.5),
    );
  });
}
