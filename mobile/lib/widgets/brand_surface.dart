import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Standard light page background used by every screen.
class BrandSurface extends StatelessWidget {
  const BrandSurface({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => ColoredBox(color: AppColors.sheetBackground, child: child);
}
