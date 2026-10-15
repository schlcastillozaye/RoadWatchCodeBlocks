import 'package:flutter/material.dart';

/// Code Blocks Inc. brand colours — extracted from `FINAL Brandsheet.png`.
/// Do not introduce colours outside this file; keep both platforms in sync.
class AppColors {
  AppColors._();

  // --- Official brand palette ---------------------------------------------
  static const Color darkBlue = Color(0xFF071633);
  static const Color lightAzure = Color(0xFFC5D5E0);
  static const Color lightBlue = Color(0xFFC3E6FF);
  static const Color lightYellow = Color(0xFFF3EFE3);

  // --- Supporting tints (from the brandsheet mockups) ---------------------
  static const Color cardSurface = Color(0xFFF7FBFF);
  static const Color sheetBackground = Color(0xFFEAF0FA);
  static const Color textSecondary = Color(0xFF3D4B63);
  static const Color textMuted = Color(0xFF5B6A82);

  static const Color white = Color(0xFFFFFFFF);
  static const Color black = Color(0xFF000000);

  // --- Semantic aliases ----------------------------------------------------
  static const Color primary = darkBlue;
  static const Color onPrimary = cardSurface;
  static const Color accent = lightBlue;
  static const Color warm = lightYellow;
  static const Color surface = cardSurface;
  static const Color background = sheetBackground;
  static const Color border = lightAzure;
  static const Color textPrimary = darkBlue;

  // --- Functional / status colours ----------------------------------------
  static const Color statusAmber = Color(0xFFC9821F);
  static const Color statusGreen = Color(0xFF1F8A5B);
  static const Color statusRed = Color(0xFFC23B3B);
  static const Color statusBlue = Color(0xFF2F6FD0);
  static const Color statusSlate = Color(0xFF5B6A82);

  // Light tints used behind status text.
  static const Color tintAmber = Color(0xFFFBEFDC);
  static const Color tintGreen = Color(0xFFE1F2E9);
  static const Color tintRed = Color(0xFFF9E3E3);
  static const Color tintBlue = Color(0xFFE3EDFB);
  static const Color tintSlate = Color(0xFFEDF0F5);
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
