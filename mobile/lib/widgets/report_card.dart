import 'package:flutter/material.dart';

import '../core/format.dart';
import '../models/models.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import 'category_badge.dart';
import 'photo_thumbnail.dart';
import 'status_chip.dart';

class ReportCard extends StatelessWidget {
  const ReportCard({super.key, required this.report, this.onTap});

  final RoadReport report;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final cover = report.coverPhoto;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          decoration: BoxDecoration(
            color: AppColors.cardSurface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.lightAzure),
          ),
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (cover != null)
                PhotoThumbnail(photo: cover, width: 76, height: 76, radius: 14)
              else
                CategoryBadge(category: report.category, size: 76),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            report.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.headingStyle(size: 15.5),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      report.referenceNo,
                      style: AppTypography.caption(size: 11.5, color: AppColors.textMuted),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        StatusChip(moderation: report.moderationStatus, compact: true),
                        StatusChip(repair: report.repairStatus, compact: true),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Icon(Icons.place_outlined, size: 13, color: AppColors.textMuted),
                        const SizedBox(width: 3),
                        Expanded(
                          child: Text(
                            report.locationLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.caption(size: 11.5, color: AppColors.textMuted),
                          ),
                        ),
                        Text(
                          relativeTime(report.createdAt),
                          style: AppTypography.caption(size: 11.5, color: AppColors.textMuted),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
