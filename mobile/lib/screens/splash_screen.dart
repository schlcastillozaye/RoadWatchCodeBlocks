import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../widgets/brand_mark.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    return Scaffold(
      backgroundColor: AppColors.darkBlue,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CodeBlocksMark(size: 34, onDark: true),
            const SizedBox(height: 28),
            SizedBox(
              width: 26,
              height: 26,
              child: CircularProgressIndicator(strokeWidth: 2.4, color: AppColors.lightBlue),
            ),
            const SizedBox(height: 28),
            Text(
              'RoadBlocks',
              style: AppTypography.display(size: 34, color: AppColors.onPrimary),
            ),
            const SizedBox(height: 4),
            Text(
              'by Code Blocks Inc.',
              style: AppTypography.caption(size: 13, color: AppColors.lightBlue),
            ),
          ],
        ),
      ),
    );
  }
}
