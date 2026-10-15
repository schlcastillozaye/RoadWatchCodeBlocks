import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_config.dart';
import '../../models/models.dart';
import '../../state/auth_provider.dart';
import '../../state/reports_provider.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_typography.dart';
import '../../widgets/brand_logo.dart';
import '../../widgets/brand_surface.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/report_card.dart';
import '../reports/report_detail_screen.dart';
import '../reports/submit_report_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.onNavigate});

  final ValueChanged<int> onNavigate;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = context.read<MyReportsProvider>();
      if (provider.reports.isEmpty) provider.load();
    });
  }

  Future<void> _openSubmit() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const SubmitReportScreen()),
    );
    if (created == true && mounted) {
      context.read<MyReportsProvider>().load(refresh: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final reports = context.watch<MyReportsProvider>();
    final user = auth.user;
    final firstName = (user?.fullName ?? 'there').split(' ').first;

    final total = reports.total;
    final pending = reports.reports.where((r) => r.moderationStatus == ModerationStatus.pendingReview).length;
    final inProgress = reports.reports
        .where((r) => r.repairStatus == RepairStatus.inProgress || r.repairStatus == RepairStatus.awaitingMaintenance)
        .length;
    final completed = reports.reports.where((r) => r.repairStatus == RepairStatus.completed).length;

    return BrandSurface(
      child: RefreshIndicator(
        onRefresh: () => context.read<MyReportsProvider>().load(refresh: true),
        color: AppColors.darkBlue,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(child: _Header(firstName: firstName, user: user)),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 18),
                    _PrimaryCta(onTap: _openSubmit),
                    const SizedBox(height: 20),
                    _StatsRow(total: total, pending: pending, inProgress: inProgress, completed: completed),
                    const SizedBox(height: 22),
                    _QuickActions(
                      onReport: _openSubmit,
                      onMap: () => widget.onNavigate(1),
                      onReports: () => widget.onNavigate(2),
                    ),
                    const SizedBox(height: 24),
                    Row(
                      children: [
                        Expanded(child: Text('Recent activity', style: AppTypography.headingStyle(size: 18))),
                        if (reports.reports.isNotEmpty)
                          TextButton(
                            onPressed: () => widget.onNavigate(2),
                            child: const Text('View all'),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                  ],
                ),
              ),
            ),
            if (reports.isLoading && reports.reports.isEmpty)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(child: CircularProgressIndicator(color: AppColors.darkBlue)),
                ),
              )
            else if (reports.reports.isEmpty)
              SliverToBoxAdapter(
                child: EmptyState(
                  icon: Icons.add_road_rounded,
                  title: 'No reports yet',
                  message: 'Spotted a pothole, crack or flooding? Report it and help your community.',
                  action: ElevatedButton.icon(
                    onPressed: _openSubmit,
                    icon: const Icon(Icons.camera_alt_rounded, size: 18),
                    label: const Text('Report an issue'),
                  ),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                sliver: SliverList.separated(
                  itemCount: reports.reports.take(4).length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (context, i) {
                    final report = reports.reports[i];
                    return ReportCard(
                      report: report,
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => ReportDetailScreen(reportId: report.id)),
                      ),
                    );
                  },
                ),
              ),
            SliverToBoxAdapter(child: _Footer()),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.firstName, required this.user});

  final String firstName;
  final AppUser? user;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.darkBlue,
        borderRadius: BorderRadius.only(bottomLeft: Radius.circular(32), bottomRight: Radius.circular(32)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 26),
      child: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(padding: EdgeInsets.only(top: 12), child: BrandLogo(onDark: true, size: LogoSize.small)),
            const SizedBox(height: 22),
            Text('Hello, $firstName 👋', style: AppTypography.display(size: 26, color: AppColors.onPrimary)),
            const SizedBox(height: 4),
            Text(
              AppConfig.tagline,
              style: AppTypography.bodyStyle(size: 14, color: AppColors.lightBlue),
            ),
          ],
        ),
      ),
    );
  }
}

class _PrimaryCta extends StatelessWidget {
  const _PrimaryCta({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [AppColors.lightBlue, Color(0xFFE3F1FF)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: AppColors.lightAzure),
          ),
          child: Row(
            children: [
              Container(
                width: 54,
                height: 54,
                decoration: BoxDecoration(color: AppColors.darkBlue, borderRadius: BorderRadius.circular(18)),
                child: const Icon(Icons.add_a_photo_rounded, color: AppColors.lightBlue, size: 26),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Report a road issue', style: AppTypography.headingStyle(size: 17)),
                    const SizedBox(height: 3),
                    Text(
                      'Photo • description • GPS location',
                      style: AppTypography.caption(size: 12.5, color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.arrow_forward_rounded, color: AppColors.darkBlue),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.total, required this.pending, required this.inProgress, required this.completed});

  final int total;
  final int pending;
  final int inProgress;
  final int completed;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _StatTile(label: 'Total', value: total, color: AppColors.darkBlue),
        const SizedBox(width: 10),
        _StatTile(label: 'Pending', value: pending, color: AppColors.statusAmber),
        const SizedBox(width: 10),
        _StatTile(label: 'Repairing', value: inProgress, color: AppColors.statusBlue),
        const SizedBox(width: 10),
        _StatTile(label: 'Done', value: completed, color: AppColors.statusGreen),
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value, required this.color});

  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: AppColors.cardSurface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.lightAzure),
        ),
        child: Column(
          children: [
            Text('$value', style: AppTypography.display(size: 20, color: color)),
            const SizedBox(height: 2),
            Text(label, style: AppTypography.caption(size: 11, color: AppColors.textMuted)),
          ],
        ),
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.onReport, required this.onMap, required this.onReports});

  final VoidCallback onReport;
  final VoidCallback onMap;
  final VoidCallback onReports;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _QuickAction(icon: Icons.camera_alt_rounded, label: 'Report', onTap: onReport),
        const SizedBox(width: 12),
        _QuickAction(icon: Icons.map_rounded, label: 'Public map', onTap: onMap),
        const SizedBox(width: 12),
        _QuickAction(icon: Icons.article_rounded, label: 'My reports', onTap: onReports),
      ],
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
            decoration: BoxDecoration(
              color: AppColors.cardSurface,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.lightAzure),
            ),
            child: Column(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.lightYellow,
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Icon(icon, color: AppColors.darkBlue, size: 21),
                ),
                const SizedBox(height: 8),
                Text(label, style: AppTypography.caption(size: 12, weight: FontWeight.w600, color: AppColors.textSecondary)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      child: Column(
        children: [
          Container(
            height: 4,
            decoration: BoxDecoration(color: AppColors.lightAzure, borderRadius: BorderRadius.circular(4)),
          ),
          const SizedBox(height: 10),
          Text(
            '${AppConfig.productName} · ${AppConfig.brandName}',
            style: AppTypography.caption(size: 11.5, color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }
}
