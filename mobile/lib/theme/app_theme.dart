import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_typography.dart';
import 'roadwatch_palette.dart';

/// Central Material theme built from the Code Blocks Inc. brand tokens.
///
/// Both brightnesses come from one builder so the light and dark themes can
/// never drift apart: [light] and [dark] only differ by the
/// [RoadWatchPalette] passed in.
class AppTheme {
  AppTheme._();

  static ThemeData light() => _build(RoadWatchPalette.light);

  static ThemeData dark() => _build(RoadWatchPalette.dark);

  static ThemeData _build(RoadWatchPalette p) {
    // Typography resolves its default colours through AppColors, so activate
    // the palette being built before any style is created. Without this the
    // dark theme could be assembled while the light palette is active and bake
    // the wrong text colours into `textTheme`.
    AppColors.usePalette(p);

    final scheme = ColorScheme(
      brightness: p.isDark ? Brightness.dark : Brightness.light,
      primary: p.navy,
      onPrimary: p.onNavy,
      secondary: p.sky,
      onSecondary: p.navy,
      tertiary: p.cream,
      onTertiary: p.navy,
      error: p.red,
      onError: p.navy,
      surface: p.surface,
      onSurface: p.ink,
      surfaceContainerHighest: p.sheet,
      outline: p.line,
      outlineVariant: p.line,
      shadow: p.navy,
      scrim: p.navy,
      inverseSurface: p.navy,
      onInverseSurface: p.onNavy,
    );

    final text = AppTypography.textTheme();

    // The web platform inverts the primary/danger buttons in dark mode
    // (`background: var(--sky); color: var(--navy)`) because a navy button on a
    // navy-ish sheet loses its edge. Mirror that here, plus the disabled pair.
    final primaryBg = p.isDark ? p.sky : p.navy;
    final primaryFg = p.isDark ? p.navy : p.onNavy;
    final disabledBg = p.isDark ? const Color(0xFF344960) : p.azure;

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: p.sheet,
      canvasColor: p.sheet,
      fontFamily: AppTypography.body,
      textTheme: text,
      splashFactory: InkSparkle.splashFactory,
      appBarTheme: AppBarTheme(
        backgroundColor: p.navy,
        foregroundColor: p.onNavy,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: AppTypography.headingStyle(size: 20, color: p.onNavy),
        toolbarHeight: 62,
      ),
      cardTheme: CardThemeData(
        color: p.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.lgAll,
          side: BorderSide(color: p.line),
        ),
      ),
      dividerTheme: DividerThemeData(color: p.line, thickness: 1, space: 1),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: p.inputSurface,
        isDense: false,
        contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.lg),
        hintStyle: AppTypography.bodyStyle(size: 15, color: p.ink3),
        labelStyle: AppTypography.bodyStyle(size: 15, color: p.ink2),
        floatingLabelStyle: AppTypography.bodyStyle(size: 14, weight: FontWeight.w600, color: p.isDark ? p.sky : p.navy),
        border: OutlineInputBorder(
          borderRadius: AppRadii.smAll,
          borderSide: BorderSide(color: p.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: AppRadii.smAll,
          borderSide: BorderSide(color: p.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: AppRadii.smAll,
          borderSide: BorderSide(color: p.isDark ? p.sky : p.navy, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: AppRadii.smAll,
          borderSide: BorderSide(color: p.red),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: AppRadii.smAll,
          borderSide: BorderSide(color: p.red, width: 1.6),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primaryBg,
          foregroundColor: primaryFg,
          disabledBackgroundColor: disabledBg,
          disabledForegroundColor: p.isDark ? p.ink : p.ink3,
          elevation: 0,
          minimumSize: const Size(0, 52),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xxl),
          shape: const RoundedRectangleBorder(borderRadius: AppRadii.smAll),
          textStyle: AppTypography.button(color: primaryFg),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: p.isDark ? p.ink : p.navy,
          backgroundColor: p.isDark ? p.surface : null,
          side: BorderSide(color: p.isDark ? p.azure : p.navy, width: 1.4),
          minimumSize: const Size(0, 52),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xxl),
          shape: const RoundedRectangleBorder(borderRadius: AppRadii.smAll),
          textStyle: AppTypography.button(color: p.isDark ? p.ink : p.navy),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: p.isDark ? p.sky : p.navy,
          textStyle: AppTypography.button(size: 14, color: p.isDark ? p.sky : p.navy),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: p.sky,
        selectedColor: p.navy,
        secondarySelectedColor: p.navy,
        labelStyle: AppTypography.bodyStyle(size: 13, weight: FontWeight.w600, color: p.navy),
        secondaryLabelStyle: AppTypography.bodyStyle(size: 13, weight: FontWeight.w600, color: p.onNavy),
        side: BorderSide.none,
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.pillAll),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: p.navy,
        indicatorColor: p.sky,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        height: 68,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected) ? p.navy : p.onNavy,
            size: 24,
          ),
        ),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => AppTypography.caption(
            size: 12,
            weight: FontWeight.w600,
            color: states.contains(WidgetState.selected) ? p.navy : p.onNavy,
          ),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: p.surface,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.lgAll),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: p.navy,
        contentTextStyle: AppTypography.bodyStyle(size: 14, color: p.onNavy),
        behavior: SnackBarBehavior.floating,
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.smAll),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: p.isDark ? p.sky : p.navy),
      listTileTheme: ListTileThemeData(
        iconColor: p.isDark ? p.sky : p.navy,
        textColor: p.ink,
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: p.isDark ? p.sky : p.surface,
        foregroundColor: p.navy,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: p.surface,
        surfaceTintColor: Colors.transparent,
      ),
    );
  }
}
