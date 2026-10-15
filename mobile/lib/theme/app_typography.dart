import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Brand typography.
///   League Spartan (bold) — headings, buttons, wordmark
///   Poppins (400-700)     — body and interface
class AppTypography {
  AppTypography._();

  static const String heading = 'LeagueSpartan';
  static const String body = 'Poppins';

  /// League Spartan is a variable font; weight is applied via [FontVariation].
  static TextStyle display({
    double size = 40,
    double weight = 700,
    Color color = AppColors.textPrimary,
    double height = 1.1,
    double letterSpacing = -0.5,
  }) {
    return TextStyle(
      fontFamily: heading,
      fontSize: size,
      color: color,
      height: height,
      letterSpacing: letterSpacing,
      fontWeight: FontWeight.w700,
      fontVariations: [FontVariation('wght', weight)],
    );
  }

  static TextStyle headingStyle({
    double size = 20,
    double weight = 700,
    Color color = AppColors.textPrimary,
    double height = 1.2,
  }) => display(size: size, weight: weight, color: color, height: height, letterSpacing: -0.2);

  static TextStyle button({double size = 15, Color color = AppColors.onPrimary}) => display(
        size: size,
        weight: 700,
        color: color,
        height: 1.0,
        letterSpacing: 0.2,
      );

  static TextStyle bodyStyle({
    double size = 16,
    FontWeight weight = FontWeight.w400,
    Color color = AppColors.textPrimary,
    double height = 1.45,
  }) =>
      TextStyle(
        fontFamily: body,
        fontSize: size,
        fontWeight: weight,
        color: color,
        height: height,
      );

  static TextStyle caption({Color color = AppColors.textMuted, double size = 13, FontWeight weight = FontWeight.w500}) =>
      TextStyle(fontFamily: body, fontSize: size, fontWeight: weight, color: color, height: 1.35);

  /// Builds the Material [TextTheme] from the brand styles.
  static TextTheme textTheme() {
    return TextTheme(
      displayLarge: display(size: 44),
      displayMedium: display(size: 36),
      displaySmall: display(size: 30),
      headlineLarge: display(size: 28),
      headlineMedium: display(size: 24),
      headlineSmall: display(size: 21),
      titleLarge: headingStyle(size: 19),
      titleMedium: headingStyle(size: 17, weight: 600),
      titleSmall: headingStyle(size: 15, weight: 600),
      bodyLarge: bodyStyle(size: 16),
      bodyMedium: bodyStyle(size: 14),
      bodySmall: bodyStyle(size: 13, color: AppColors.textMuted),
      labelLarge: display(size: 15, weight: 600, color: AppColors.textPrimary),
      labelMedium: bodyStyle(size: 13, weight: FontWeight.w600, color: AppColors.textSecondary),
      labelSmall: caption(size: 12),
    );
  }
}
