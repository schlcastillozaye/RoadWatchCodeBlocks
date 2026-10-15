import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_typography.dart';

/// Central Material theme built from the Code Blocks Inc. brand tokens.
class AppTheme {
  AppTheme._();

  static ThemeData light() {
    final scheme = ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.darkBlue,
      onPrimary: AppColors.onPrimary,
      secondary: AppColors.lightBlue,
      onSecondary: AppColors.darkBlue,
      tertiary: AppColors.lightYellow,
      onTertiary: AppColors.darkBlue,
      error: AppColors.statusRed,
      onError: AppColors.white,
      surface: AppColors.cardSurface,
      onSurface: AppColors.textPrimary,
      surfaceContainerHighest: AppColors.sheetBackground,
      outline: AppColors.lightAzure,
      outlineVariant: AppColors.lightAzure,
      shadow: AppColors.darkBlue,
      scrim: AppColors.darkBlue,
      inverseSurface: AppColors.darkBlue,
      onInverseSurface: AppColors.onPrimary,
    );

    final text = AppTypography.textTheme();

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.sheetBackground,
      canvasColor: AppColors.sheetBackground,
      fontFamily: AppTypography.body,
      textTheme: text,
      splashFactory: InkSparkle.splashFactory,
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.darkBlue,
        foregroundColor: AppColors.onPrimary,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: AppTypography.headingStyle(size: 20, color: AppColors.onPrimary),
        toolbarHeight: 62,
      ),
      cardTheme: const CardThemeData(
        color: AppColors.cardSurface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.lgAll,
          side: BorderSide(color: AppColors.lightAzure),
        ),
      ),
      dividerTheme: const DividerThemeData(color: AppColors.lightAzure, thickness: 1, space: 1),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.white,
        isDense: false,
        contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.lg),
        hintStyle: AppTypography.bodyStyle(size: 15, color: AppColors.textMuted),
        labelStyle: AppTypography.bodyStyle(size: 15, color: AppColors.textSecondary),
        floatingLabelStyle: AppTypography.bodyStyle(size: 14, weight: FontWeight.w600, color: AppColors.darkBlue),
        border: const OutlineInputBorder(
          borderRadius: AppRadii.smAll,
          borderSide: BorderSide(color: AppColors.lightAzure),
        ),
        enabledBorder: const OutlineInputBorder(
          borderRadius: AppRadii.smAll,
          borderSide: BorderSide(color: AppColors.lightAzure),
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: AppRadii.smAll,
          borderSide: BorderSide(color: AppColors.darkBlue, width: 1.6),
        ),
        errorBorder: const OutlineInputBorder(
          borderRadius: AppRadii.smAll,
          borderSide: BorderSide(color: AppColors.statusRed),
        ),
        focusedErrorBorder: const OutlineInputBorder(
          borderRadius: AppRadii.smAll,
          borderSide: BorderSide(color: AppColors.statusRed, width: 1.6),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.darkBlue,
          foregroundColor: AppColors.onPrimary,
          disabledBackgroundColor: AppColors.lightAzure,
          disabledForegroundColor: AppColors.textMuted,
          elevation: 0,
          minimumSize: const Size(0, 52),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xxl),
          shape: const RoundedRectangleBorder(borderRadius: AppRadii.smAll),
          textStyle: AppTypography.button(),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.darkBlue,
          side: const BorderSide(color: AppColors.darkBlue, width: 1.4),
          minimumSize: const Size(0, 52),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xxl),
          shape: const RoundedRectangleBorder(borderRadius: AppRadii.smAll),
          textStyle: AppTypography.button(color: AppColors.darkBlue),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.darkBlue,
          textStyle: AppTypography.button(size: 14, color: AppColors.darkBlue),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.lightBlue,
        selectedColor: AppColors.darkBlue,
        secondarySelectedColor: AppColors.darkBlue,
        labelStyle: AppTypography.bodyStyle(size: 13, weight: FontWeight.w600, color: AppColors.darkBlue),
        secondaryLabelStyle: AppTypography.bodyStyle(size: 13, weight: FontWeight.w600, color: AppColors.onPrimary),
        side: BorderSide.none,
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.pillAll),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppColors.darkBlue,
        indicatorColor: AppColors.lightBlue,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        height: 68,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected) ? AppColors.darkBlue : AppColors.onPrimary,
            size: 24,
          ),
        ),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => AppTypography.caption(
            size: 12,
            weight: FontWeight.w600,
            color: states.contains(WidgetState.selected) ? AppColors.darkBlue : AppColors.onPrimary,
          ),
        ),
      ),
      dialogTheme: const DialogThemeData(
        backgroundColor: AppColors.cardSurface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: AppRadii.lgAll),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.darkBlue,
        contentTextStyle: AppTypography.bodyStyle(size: 14, color: AppColors.onPrimary),
        behavior: SnackBarBehavior.floating,
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.smAll),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.darkBlue),
      listTileTheme: const ListTileThemeData(iconColor: AppColors.darkBlue, textColor: AppColors.textPrimary),
    );
  }
}
