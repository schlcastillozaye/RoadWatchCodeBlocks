import 'package:flutter/material.dart';

import 'roadwatch_palette.dart';

/// Brand colour facade.
///
/// Every colour in the app is read through this class, e.g. `AppColors.surface`.
/// The values come from the *active* [RoadWatchPalette], which is swapped when
/// the user (or the OS) changes the theme — see [ThemeProvider] and the
/// `MaterialApp.builder` in `app.dart`, which activates the palette that
/// matches the resolved brightness once per frame.
///
/// Because the active palette is decided at runtime, these are **getters, not
/// constants**. Two consequences:
///
///   * They cannot appear inside a `const` expression. Widgets that colour
///     themselves from the brand palette must be built without `const`, or they
///     would freeze the palette at whichever theme was active when the constant
///     was first evaluated.
///   * They must not be used as a default value for an optional parameter
///     (which must be a compile-time constant) — take a nullable `Color?` and
///     fall back to `AppColors.…` inside the body instead. See `AppTypography`.
///
/// Keep this file as the only place colours are named; the actual hex values
/// live in [RoadWatchPalette] so both platforms stay in sync.
class AppColors {
  AppColors._();

  static RoadWatchPalette _active = RoadWatchPalette.light;

  /// The palette currently in effect.
  static RoadWatchPalette get palette => _active;

  /// Activates [brightness]'s palette. Called by the app shell on each build.
  static void use(Brightness brightness) {
    _active = RoadWatchPalette.forBrightness(brightness);
  }

  /// Activates [palette] directly (used when the theme is built, before the
  /// first frame paints).
  static void usePalette(RoadWatchPalette palette) {
    _active = palette;
  }

  /// Activates the palette matching [context]'s brightness and returns it.
  ///
  /// **Every widget that colours itself from this class must call this at the
  /// top of its `build`.** Reading the palette through a global means Flutter
  /// has no idea the colours changed: `MaterialApp` rebuilding is not enough,
  /// because a `const` widget is skipped entirely when its parent rebuilds.
  /// Touching `Theme.of(context)` registers a dependency on the *real* theme,
  /// so the element is marked dirty when the user switches — and re-running the
  /// build then re-activates the right palette before any colour is read.
  static RoadWatchPalette syncTo(BuildContext context) {
    final palette = RoadWatchPalette.forBrightness(Theme.of(context).brightness);
    _active = palette;
    return palette;
  }

  static bool get isDark => _active.isDark;

  // --- Official brand palette ---------------------------------------------
  static Color get darkBlue => _active.navy;
  static Color get lightAzure => _active.azure;
  static Color get lightBlue => _active.sky;
  static Color get lightYellow => _active.cream;

  // --- Supporting tints ---------------------------------------------------
  static Color get cardSurface => _active.surface;
  static Color get sheetBackground => _active.sheet;
  static Color get textSecondary => _active.ink2;
  static Color get textMuted => _active.ink3;

  static const Color white = Color(0xFFFFFFFF);
  static const Color black = Color(0xFF000000);

  // --- Semantic aliases ---------------------------------------------------
  static Color get primary => _active.navy;
  static Color get onPrimary => _active.onNavy;
  static Color get accent => _active.sky;
  static Color get warm => _active.cream;
  static Color get surface => _active.surface;
  static Color get background => _active.sheet;
  static Color get border => _active.line;
  static Color get textPrimary => _active.ink;

  // --- Functional / status colours ----------------------------------------
  /// Fills and map markers: saturated, tuned to be *seen*, not read.
  static Color get statusAmber => _active.amber;
  static Color get statusGreen => _active.green;
  static Color get statusRed => _active.red;
  static Color get statusBlue => _active.blue;
  static Color get statusSlate => _active.slate;

  /// Usable as status *text*: same hue, enough contrast on the tint behind it.
  static Color get statusAmberInk => _active.amberInk;
  static Color get statusGreenInk => _active.greenInk;
  static Color get statusRedInk => _active.redInk;
  static Color get statusBlueInk => _active.blueInk;

  // Tints used behind status text.
  static Color get tintAmber => _active.amberTint;
  static Color get tintGreen => _active.greenTint;
  static Color get tintRed => _active.redTint;
  static Color get tintBlue => _active.blueTint;
  static Color get tintSlate => _active.slateTint;

  // --- Surfaces used by inputs, tables and feedback ------------------------
  static Color get inputSurface => _active.inputSurface;
  static Color get errorSurface => _active.errorSurface;
  static Color get interactiveHover => _active.interactiveHover;

  /// A brand accent drawn *on* a neutral surface — spinner, link, small icon.
  ///
  /// Navy in light mode, sky in dark mode: the light-mode navy all but
  /// disappears against the dark sheet, which is why the web platform swaps to
  /// `--sky` for these (`.admin-sidebar-nav a`, focus rings, controls).
  static Color get brandAccent => _active.isDark ? _active.sky : _active.navy;
}

/// Corner-radius scale (brand: rounded everywhere).
class AppRadii {
  AppRadii._();
  static const double sm = 14;
  static const double md = 20;
  static const double lg = 28;
  static const double xl = 40;
  static const double pill = 999;

  static const BorderRadius smAll = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius mdAll = BorderRadius.all(Radius.circular(md));
  static const BorderRadius lgAll = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius xlAll = BorderRadius.all(Radius.circular(xl));
  static const BorderRadius pillAll = BorderRadius.all(Radius.circular(pill));
}

/// Spacing scale.
class AppSpacing {
  AppSpacing._();
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 24;
  static const double xxxl = 32;
  static const double huge = 40;
  static const double giant = 56;
}
