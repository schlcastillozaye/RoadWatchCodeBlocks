import 'package:flutter/material.dart';

import '../models/enums.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// Category icon inside a soft brand tile.
class CategoryBadge extends StatelessWidget {
  const CategoryBadge({super.key, required this.category, this.size = 44});

  final IssueCategory category;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppColors.lightBlue.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(size * 0.32),
      ),
      child: Icon(category.icon, size: size * 0.5, color: AppColors.darkBlue),
    );
  }
}

class PriorityPill extends StatelessWidget {
  const PriorityPill({super.key, required this.priority});

  final Priority priority;

  @override
  Widget build(BuildContext context) {
    final color = switch (priority) {
      Priority.urgent => AppColors.statusRed,
      Priority.high => AppColors.statusAmber,
      Priority.medium => AppColors.statusBlue,
      Priority.low => AppColors.statusSlate,
    };
    final bg = switch (priority) {
      Priority.urgent => AppColors.tintRed,
      Priority.high => AppColors.tintAmber,
      Priority.medium => AppColors.tintBlue,
      Priority.low => AppColors.tintSlate,
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.flag_rounded, size: 12, color: color),
          const SizedBox(width: 4),
          Text(priority.label, style: AppTypography.bodyStyle(size: 11.5, weight: FontWeight.w600, color: color, height: 1.0)),
        ],
      ),
    );
  }
}
