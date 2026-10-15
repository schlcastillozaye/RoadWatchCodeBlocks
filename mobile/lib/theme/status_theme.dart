import 'package:flutter/material.dart';

import '../models/enums.dart';
import 'app_colors.dart';

class StatusColors {
  final Color foreground;
  final Color background;

  const StatusColors(this.foreground, this.background);
}

/// Maps moderation status to brand-complementary functional colours.
StatusColors moderationColors(ModerationStatus status) => switch (status) {
      ModerationStatus.pendingReview => const StatusColors(AppColors.statusAmber, AppColors.tintAmber),
      ModerationStatus.approved => const StatusColors(AppColors.statusGreen, AppColors.tintGreen),
      ModerationStatus.rejected => const StatusColors(AppColors.statusRed, AppColors.tintRed),
    };

/// Maps repair status to brand-complementary functional colours.
StatusColors repairColors(RepairStatus status) => switch (status) {
      RepairStatus.notAssigned => const StatusColors(AppColors.statusSlate, AppColors.tintSlate),
      RepairStatus.awaitingMaintenance => const StatusColors(AppColors.statusBlue, AppColors.tintBlue),
      RepairStatus.inProgress => const StatusColors(AppColors.statusAmber, AppColors.tintAmber),
      RepairStatus.completed => const StatusColors(AppColors.statusGreen, AppColors.tintGreen),
    };

IconData moderationIcon(ModerationStatus status) => switch (status) {
      ModerationStatus.pendingReview => Icons.hourglass_top_rounded,
      ModerationStatus.approved => Icons.verified_rounded,
      ModerationStatus.rejected => Icons.cancel_rounded,
    };

IconData repairIcon(RepairStatus status) => switch (status) {
      RepairStatus.notAssigned => Icons.assignment_outlined,
      RepairStatus.awaitingMaintenance => Icons.schedule_rounded,
      RepairStatus.inProgress => Icons.construction_rounded,
      RepairStatus.completed => Icons.check_circle_rounded,
    };
