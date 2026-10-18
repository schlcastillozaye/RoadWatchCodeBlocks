import 'package:flutter/material.dart';

/// An immutable brand palette: one instance per [Brightness].
///
/// The values are the same design tokens the web platform uses, so a colour
/// changed here must be changed in `web/css/styles.css` too (`:root` for
/// [light], `:root[data-theme='dark']` for [dark]). Sourced from
/// `FINAL Brandsheet.png` + `docs/DESIGN_SYSTEM.md`.
///
/// The follow-up commits to the web app (`f17e217`, `bcdfe60`, `0aa169b`) added
/// a dark theme and accessible status *text* colours. Both are mirrored here:
///
///   * dark mode surfaces/ink are the web's `--sheet`/`--surface`/`--ink` set;
///   * the `*Ink` colours are the web's `--amber-ink`/`--green-ink`/`--red-ink`/
///     `--blue-ink`, i.e. the hue used for status *text* so it clears AA
///     contrast instead of using the (fill-tuned) status colour as text.
@immutable
class RoadWatchPalette {
  const RoadWatchPalette({
    required this.isDark,
    required this.navy,
    required this.azure,
    required this.sky,
    required this.cream,
    required this.surface,
    required this.sheet,
    required this.ink,
    required this.ink2,
    required this.ink3,
    required this.onNavy,
    required this.amber,
    required this.amberTint,
    required this.green,
    required this.greenTint,
    required this.red,
    required this.redTint,
    required this.blue,
    required this.blueTint,
    required this.slate,
    required this.slateTint,
    required this.amberInk,
    required this.greenInk,
    required this.redInk,
    required this.blueInk,
    required this.line,
    required this.inputSurface,
    required this.errorSurface,
    required this.interactiveHover,
  });

  final bool isDark;

  /// Deep brand blue: app bars, headers, primary buttons.
  final Color navy;

  /// Hairline borders on light surfaces.
  final Color azure;

  /// Light brand blue accent.
  final Color sky;

  /// Warm cream accent.
  final Color cream;

  /// Card / panel surface.
  final Color surface;

  /// Page background.
  final Color sheet;

  /// Primary text.
  final Color ink;

  /// Secondary text.
  final Color ink2;

  /// Muted text, captions, hints.
  final Color ink3;

  /// Text/icons drawn on top of [navy].
  final Color onNavy;

  final Color amber;
  final Color amberTint;
  final Color green;
  final Color greenTint;
  final Color red;
  final Color redTint;
  final Color blue;
  final Color blueTint;
  final Color slate;
  final Color slateTint;

  /// Status *text* colours — same hue as the status fill, enough contrast to
  /// be readable on the surface/tint behind it.
  final Color amberInk;
  final Color greenInk;
  final Color redInk;
  final Color blueInk;

  /// Input / table borders.
  final Color line;

  /// Text field and table fill.
  final Color inputSurface;

  /// Background behind error states.
  final Color errorSurface;

  /// Hover wash on translucent interactive surfaces.
  final Color interactiveHover;

  static const RoadWatchPalette light = RoadWatchPalette(
    isDark: false,
    navy: Color(0xFF071633),
    azure: Color(0xFFC5D5E0),
    sky: Color(0xFFC3E6FF),
    cream: Color(0xFFF3EFE3),
    surface: Color(0xFFF7FBFF),
    sheet: Color(0xFFEAF0FA),
    ink: Color(0xFF071633),
    ink2: Color(0xFF3D4B63),
    ink3: Color(0xFF5B6A82),
    onNavy: Color(0xFFF7FBFF),
    amber: Color(0xFFC9821F),
    amberTint: Color(0xFFFBEFDC),
    green: Color(0xFF1F8A5B),
    greenTint: Color(0xFFE1F2E9),
    red: Color(0xFFC23B3B),
    redTint: Color(0xFFF9E3E3),
    blue: Color(0xFF2F6FD0),
    blueTint: Color(0xFFE3EDFB),
    slate: Color(0xFF5B6A82),
    slateTint: Color(0xFFEDF0F5),
    amberInk: Color(0xFF8A560B),
    greenInk: Color(0xFF14663D),
    redInk: Color(0xFF992F2F),
    blueInk: Color(0xFF1F4F9E),
    line: Color(0xFFC5D5E0),
    inputSurface: Color(0xFFFFFFFF),
    errorSurface: Color(0xFFF9E3E3),
    interactiveHover: Color(0x14071633),
  );

  /// Mirrors `:root[data-theme='dark']` in the web stylesheet.
  static const RoadWatchPalette dark = RoadWatchPalette(
    isDark: true,
    navy: Color(0xFF061126),
    azure: Color(0xFFA9BFD1),
    sky: Color(0xFFC3E6FF),
    cream: Color(0xFFF3EFE3),
    surface: Color(0xFF14243B),
    sheet: Color(0xFF0B1729),
    ink: Color(0xFFF1F5FA),
    ink2: Color(0xFFD1DBE7),
    ink3: Color(0xFFADBBCC),
    onNavy: Color(0xFFF1F5FA),
    amber: Color(0xFFE3A43B),
    amberTint: Color(0xFF3B2E1A),
    green: Color(0xFF45B47E),
    greenTint: Color(0xFF18382B),
    red: Color(0xFFE16C6C),
    redTint: Color(0xFF402326),
    blue: Color(0xFF78AAF4),
    blueTint: Color(0xFF1D3150),
    slate: Color(0xFFADBBCC),
    slateTint: Color(0xFF1B2B41),
    amberInk: Color(0xFFFFD58B),
    greenInk: Color(0xFF8CE0B1),
    redInk: Color(0xFFFFAAAA),
    blueInk: Color(0xFFA9CAFF),
    line: Color(0xFF344960),
    inputSurface: Color(0xFF0D1C31),
    errorSurface: Color(0xFF321E27),
    interactiveHover: Color(0x1AC3E6FF),
  );

  static RoadWatchPalette forBrightness(Brightness brightness) =>
      brightness == Brightness.dark ? dark : light;
}
