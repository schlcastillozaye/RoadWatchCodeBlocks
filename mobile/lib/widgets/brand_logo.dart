import 'package:flutter/material.dart';

import '../core/app_config.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import 'brand_mark.dart';

enum LogoSize {
  small,
  medium,
  large,

  /// Sign-in lockup. Sized from the web platform's `.rw-auth-brand`, whose mark
  /// cells are 0.9rem (≈47px tall overall) beside a 1.45rem (23px) wordmark —
  /// deliberately smaller than [large], which is drawn for a full-screen splash.
  auth,
}

/// Brand lockup: Code Blocks symbol + "RoadBlocks" wordmark (+ optional
/// "by Code Blocks Inc." tagline).
class BrandLogo extends StatelessWidget {
  const BrandLogo({
    super.key,
    this.onDark = true,
    this.size = LogoSize.medium,
    this.showTagline = false,
  });

  final bool onDark;
  final LogoSize size;
  final bool showTagline;

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);

    final (markSize, titleSize, gap, taglineSize) = switch (size) {
      LogoSize.small => (18.0, 18.0, 10.0, 7.5),
      LogoSize.medium => (24.0, 26.0, 12.0, 11.0),
      LogoSize.large => (34.0, 40.0, 16.0, 16.8),
      // The web auth lockup scaled to a phone: a ~47px mark with a 23px wordmark
      // and an 11.5px "by Code Blocks Inc." line (`.rw-auth-brand`).
      LogoSize.auth => (14.0, 23.0, 11.0, 11.5),
    };

    // `textPrimary` is the navy ink in light mode and the near-white ink in
    // dark mode, so the wordmark stays legible in both.
    final titleColor = onDark ? AppColors.onPrimary : AppColors.textPrimary;
    final subtitleColor = onDark ? AppColors.lightBlue : AppColors.textSecondary;

    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        CodeBlocksMark(size: markSize, onDark: onDark),
        SizedBox(width: gap),
        Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              AppConfig.productName,
              style: AppTypography.display(size: titleSize, color: titleColor, height: 1.0, letterSpacing: -0.3),
            ),
            if (showTagline)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  'by ${AppConfig.brandName}',
                  style: AppTypography.caption(size: taglineSize, color: subtitleColor),
                ),
              ),
          ],
        ),
      ],
    );
  }
}
