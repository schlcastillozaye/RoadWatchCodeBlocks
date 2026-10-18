import 'package:flutter/material.dart';

import '../core/app_config.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import 'brand_mark.dart';

enum LogoSize { small, medium, large }

/// Brand lockup: Code Blocks symbol + "RoadWatch" wordmark (+ optional
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

    final (markSize, titleSize, gap) = switch (size) {
      LogoSize.small => (18.0, 18.0, 10.0),
      LogoSize.medium => (24.0, 26.0, 12.0),
      LogoSize.large => (34.0, 40.0, 16.0),
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
                  style: AppTypography.caption(size: titleSize * 0.42, color: subtitleColor),
                ),
              ),
          ],
        ),
      ],
    );
  }
}
