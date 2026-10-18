import 'package:flutter/material.dart';

import '../models/enums.dart';
import 'app_colors.dart';

class StatusColors {
  final Color foreground;
  final Color background;

  const StatusColors(this.foreground, this.background);
}

/// Maps moderation status to brand-complementary functional colours.
///
/// The foreground is the *ink* variant of each status hue, not the fill hue:
/// the fill colours are tuned for markers and fills, and as text on the tint
/// behind them they fall below WCAG AA. The web platform made the same split
/// (`--amber` vs `--amber-ink`); see `web/css/styles.css`.
StatusColors moderationColors(ModerationStatus status) => switch (status) {
      ModerationStatus.pendingReview => StatusColors(AppColors.statusAmberInk, AppColors.tintAmber),
      ModerationStatus.approved => StatusColors(AppColors.statusGreenInk, AppColors.tintGreen),
      ModerationStatus.rejected => StatusColors(AppColors.statusRedInk, AppColors.tintRed),
    };

/// Maps repair status to brand-complementary functional colours.
StatusColors repairColors(RepairStatus status) => switch (status) {
      RepairStatus.notAssigned => StatusColors(AppColors.statusSlate, AppColors.tintSlate),
      RepairStatus.awaitingMaintenance => StatusColors(AppColors.statusBlueInk, AppColors.tintBlue),
      RepairStatus.inProgress => StatusColors(AppColors.statusAmberInk, AppColors.tintAmber),
      RepairStatus.completed => StatusColors(AppColors.statusGreenInk, AppColors.tintGreen),
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
