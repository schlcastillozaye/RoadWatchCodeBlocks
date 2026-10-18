import 'package:flutter/material.dart';

import '../models/enums.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../theme/status_theme.dart';

class StatusChip extends StatelessWidget {
  const StatusChip({super.key, this.moderation, this.repair, this.compact = false});

  final ModerationStatus? moderation;
  final RepairStatus? repair;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    final (label, icon, colors) = moderation != null
        ? (moderation!.label, moderationIcon(moderation!), moderationColors(moderation!))
        : (repair!.label, repairIcon(repair!), repairColors(repair!));

    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 10 : 12, vertical: compact ? 4 : 6),
      decoration: BoxDecoration(color: colors.background, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: compact ? 13 : 15, color: colors.foreground),
          const SizedBox(width: 6),
          Text(
            label,
            style: AppTypography.bodyStyle(
              size: compact ? 11.5 : 12.5,
              weight: FontWeight.w600,
              color: colors.foreground,
              height: 1.0,
            ),
          ),
        ],
      ),
    );
  }
}
