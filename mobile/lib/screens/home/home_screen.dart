import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'dart:async';

import '../../core/api_exception.dart';
import '../../core/app_config.dart';
import '../../models/models.dart';
import '../../services/roadwatch_api.dart';
import '../../state/auth_provider.dart';
import '../../state/reports_provider.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_typography.dart';
import '../../widgets/brand_logo.dart';
import '../../widgets/brand_surface.dart';
import '../../widgets/dashboard_stat_grid.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/report_card.dart';
import '../../widgets/section_card.dart';
import '../../widgets/theme_toggle.dart';
import '../reports/report_detail_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.onNavigate});

  final ValueChanged<int> onNavigate;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, int>? _summary;
  String? _summaryError;
  List<MaintenanceNotification> _notifications = [];
  String? _notificationError;
  Timer? _notificationExpiryTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = context.read<MyReportsProvider>();
      if (provider.reports.isEmpty) provider.load();
      _loadSummary();
      _loadNotifications();
    });
    _notificationExpiryTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted) return;
      final now = DateTime.now();
      final active = _notifications
          .where(
            (item) => item.expiresAt != null && item.expiresAt!.isAfter(now),
          )
          .toList();
      if (active.length != _notifications.length) {
        setState(() => _notifications = active);
      }
    });
  }

  @override
  void dispose() {
    _notificationExpiryTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadSummary() async {
    setState(() => _summaryError = null);
    try {
      final summary = await context.read<RoadWatchApi>().myReportSummary();
      if (mounted) setState(() => _summary = summary);
    } on ApiException catch (error) {
      if (mounted) setState(() => _summaryError = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => _summaryError = 'Could not load report statistics.');
      }
    }
  }

  Future<void> _refresh() async {
    await Future.wait([
      context.read<MyReportsProvider>().load(refresh: true),
      _loadSummary(),
      _loadNotifications(),
    ]);
  }

  Future<void> _loadNotifications() async {
    try {
      final items = await context
          .read<RoadWatchApi>()
          .maintenanceNotifications();
      if (mounted) {
        setState(() {
          _notifications = items;
          _notificationError = null;
        });
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _notificationError = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => _notificationError = 'Could not load notifications.');
      }
    }
  }

  Future<void> _openNotification(MaintenanceNotification notification) async {
    try {
      if (!notification.isRead) {
        await context.read<RoadWatchApi>().markNotificationRead(
          notification.id,
        );
      }
      if (!mounted) return;
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => ReportDetailScreen(reportId: notification.reportId),
        ),
      );
      if (mounted) await _loadNotifications();
    } on ApiException catch (error) {
      if (mounted) setState(() => _notificationError = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    final auth = context.watch<AuthProvider>();
    final reports = context.watch<MyReportsProvider>();
    final user = auth.user;
    final firstName = (user?.fullName ?? 'there').split(' ').first;

    return BrandSurface(
      child: RefreshIndicator(
        onRefresh: _refresh,
        color: AppColors.brandAccent,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: _Header(firstName: firstName, user: user),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: AppSpacing.xl),
                    DashboardStatGrid(
                      metrics: [
                        DashboardMetric(
                          label: 'Total reports',
                          value: '${_summary?['total'] ?? '—'}',
                          color: AppColors.textPrimary,
                        ),
                        DashboardMetric(
                          label: 'Awaiting review',
                          value: '${_summary?['pending'] ?? '—'}',
                          color: AppColors.statusAmberInk,
                        ),
                        DashboardMetric(
                          label: 'In repair',
                          value: '${_summary?['inRepair'] ?? '—'}',
                          color: AppColors.statusBlueInk,
                        ),
                        DashboardMetric(
                          label: 'Completed',
                          value: '${_summary?['completed'] ?? '—'}',
                          color: AppColors.statusGreenInk,
                        ),
                      ],
                    ),
                    if (_notificationError != null ||
                        _notifications.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.lg),
                      SectionCard(
                        title: 'Notifications',
                        subtitle: 'Active notices automatically expire after five minutes.',
                        child: _notificationError != null
                            ? Text(
                                _notificationError!,
                                style: AppTypography.caption(
                                  size: 12,
                                  color: AppColors.statusRedInk,
                                ),
                              )
                            : Column(
                                children: [
                                  for (final notification
                                      in _notifications.take(5))
                                    ListTile(
                                      contentPadding: EdgeInsets.zero,
                                      leading: Icon(
                                        notification.isRead
                                            ? Icons.notifications_none_rounded
                                            : Icons
                                                  .notifications_active_rounded,
                                        color: notification.isRead
                                            ? AppColors.textMuted
                                            : AppColors.brandAccent,
                                      ),
                                      title: Text(notification.title),
                                      subtitle: Text(notification.message),
                                      onTap: () =>
                                          _openNotification(notification),
                                    ),
                                ],
                              ),
                      ),
                    ],
                    if (_summaryError != null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        'Report statistics unavailable: $_summaryError',
                        style: AppTypography.caption(
                          size: 12,
                          color: AppColors.statusRedInk,
                        ),
                      ),
                    ],
                    const SizedBox(height: AppSpacing.xxl),
                    _QuickActions(
                      onMap: () => widget.onNavigate(1),
                      onReports: () => widget.onNavigate(3),
                    ),
                    const SizedBox(height: AppSpacing.xxl),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Recent activity',
                            style: AppTypography.headingStyle(size: 18),
                          ),
                        ),
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
              SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(
                    child: CircularProgressIndicator(
                      color: AppColors.brandAccent,
                    ),
                  ),
                ),
              )
            else if (reports.reports.isEmpty)
              SliverToBoxAdapter(
                child: EmptyState(
                  icon: Icons.add_road_rounded,
                  title: 'No reports yet',
                  message: 'Spotted a pothole, crack or flooding? Report it and help your community.',
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                sliver: SliverList.separated(
                  itemCount: reports.reports.take(4).length,
                  separatorBuilder: (_, _) =>
                      const SizedBox(height: AppSpacing.md),
                  itemBuilder: (context, i) {
                    final report = reports.reports[i];
                    return ReportCard(
                      report: report,
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) =>
                              ReportDetailScreen(reportId: report.id),
                        ),
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
    AppColors.syncTo(context);
    return Container(
      decoration: BoxDecoration(
        color: AppColors.darkBlue,
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(32),
          bottomRight: Radius.circular(32),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 26),
      child: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Row(
                children: const [
                  BrandLogo(onDark: true, size: LogoSize.small),
                  Spacer(),
                  ThemeToggleButton(onDark: true),
                ],
              ),
            ),
            const SizedBox(height: 22),
            Text(
              'Hello, $firstName 👋',
              style: AppTypography.display(
                size: 26,
                color: AppColors.onPrimary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              AppConfig.tagline,
              style: AppTypography.bodyStyle(
                size: 14,
                color: AppColors.lightBlue,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.onMap, required this.onReports});

  final VoidCallback onMap;
  final VoidCallback onReports;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _QuickAction(
          icon: Icons.map_rounded,
          label: 'Public map',
          onTap: onMap,
        ),
        const SizedBox(width: 12),
        _QuickAction(
          icon: Icons.article_rounded,
          label: 'My reports',
          onTap: onReports,
        ),
      ],
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Container(
            padding: const EdgeInsets.symmetric(
              vertical: 18,
              horizontal: AppSpacing.sm,
            ),
            decoration: BoxDecoration(
              color: AppColors.cardSurface,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
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
                const SizedBox(height: AppSpacing.sm),
                Text(
                  label,
                  maxLines: 1,
                  softWrap: false,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: AppTypography.caption(
                    size: 12,
                    weight: FontWeight.w600,
                    color: AppColors.textSecondary,
                  ),
                ),
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
    AppColors.syncTo(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      child: Column(
        children: [
          Container(
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.border,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            '${AppConfig.productName} · ${AppConfig.brandName}',
            style: AppTypography.caption(
              size: 11.5,
              color: AppColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }
}
