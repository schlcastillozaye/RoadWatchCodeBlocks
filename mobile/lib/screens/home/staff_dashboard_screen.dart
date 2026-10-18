import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../models/models.dart';
import '../../services/roadwatch_api.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_typography.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/error_view.dart';
import '../../widgets/report_card.dart';
import '../../widgets/section_card.dart';
import '../reports/report_detail_screen.dart';

class StaffDashboardScreen extends StatefulWidget {
  const StaffDashboardScreen({super.key, required this.isAdmin});

  final bool isAdmin;

  @override
  State<StaffDashboardScreen> createState() => _StaffDashboardScreenState();
}

class _StaffDashboardScreenState extends State<StaffDashboardScreen>
    with WidgetsBindingObserver {
  bool _loading = true;
  String? _error;
  String? _notificationError;
  List<RoadReport> _reports = [];
  List<MaintenanceNotification> _notifications = [];
  Map<String, int> _summary = const {};
  int _reportPage = 1;
  int _reportTotal = 0;
  int _reportTotalPages = 1;
  bool _markingRead = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
        _notificationError = null;
      });
    }
    final api = context.read<RoadWatchApi>();
    try {
      if (widget.isAdmin) {
        final page = await api.staffReports(
          page: _reportPage,
          pageSize: 100,
          moderationStatus: ModerationStatus.pendingReview,
        );
        if (mounted) {
          setState(() {
            _reports = page.items;
            _reportTotal = page.total;
            _reportTotalPages = page.totalPages;
          });
        }
      } else {
        final page = await api.maintenanceAssignments(
          page: _reportPage,
          pageSize: 100,
        );
        final summary = await api.maintenanceSummary();
        if (mounted) {
          setState(() {
            _reports = page.items;
            _summary = summary;
            _reportTotal = page.total;
            _reportTotalPages = page.totalPages;
          });
        }
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not load the staff dashboard.');
      }
    }

    if (!widget.isAdmin) {
      try {
        final notifications = await api.maintenanceNotifications();
        if (mounted) setState(() => _notifications = notifications);
      } on ApiException catch (error) {
        if (mounted) setState(() => _notificationError = error.message);
      } catch (_) {
        if (mounted) {
          setState(() => _notificationError = 'Could not load notifications.');
        }
      }
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _openReport(RoadReport report) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) =>
            ReportDetailScreen(reportId: report.id, initialReport: report),
      ),
    );
    if (mounted) await _load();
  }

  Future<void> _changeReportPage(int page) async {
    if (page < 1 || page > _reportTotalPages || page == _reportPage) return;
    setState(() => _reportPage = page);
    await _load();
  }

  Future<void> _openNotification(MaintenanceNotification notification) async {
    if (!notification.isRead) {
      setState(() => _markingRead = true);
      try {
        await context.read<RoadWatchApi>().markNotificationRead(
          notification.id,
        );
      } on ApiException catch (error) {
        if (mounted) {
          setState(() => _notificationError = error.message);
          setState(() => _markingRead = false);
        }
        return;
      } catch (_) {
        if (mounted) {
          setState(
            () => _notificationError =
                'Could not mark this notification as read.',
          );
          setState(() => _markingRead = false);
        }
        return;
      }
      if (mounted) {
        setState(() {
          _notifications = _notifications
              .map(
                (item) => item.id == notification.id
                    ? MaintenanceNotification(
                        id: item.id,
                        assignmentId: item.assignmentId,
                        reportId: item.reportId,
                        referenceNo: item.referenceNo,
                        title: item.title,
                        message: item.message,
                        category: item.category,
                        location: item.location,
                        repairStatus: item.repairStatus,
                        isRead: true,
                        createdAt: item.createdAt,
                        readAt: DateTime.now(),
                      )
                    : item,
              )
              .toList();
          _markingRead = false;
        });
      }
    }

    if (!mounted) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => ReportDetailScreen(reportId: notification.reportId),
      ),
    );
    if (mounted) await _load();
  }

  Future<void> _markAllRead() async {
    setState(() {
      _markingRead = true;
      _notificationError = null;
    });
    try {
      await context.read<RoadWatchApi>().markAllNotificationsRead();
      await _load();
    } on ApiException catch (error) {
      if (mounted) setState(() => _notificationError = error.message);
    } catch (_) {
      if (mounted) {
        setState(
          () => _notificationError = 'Could not mark notifications as read.',
        );
      }
    } finally {
      if (mounted) setState(() => _markingRead = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    final activeReports = _reports
        .where((report) => report.repairStatus != RepairStatus.completed)
        .toList();
    final completedReports = _reports
        .where((report) => report.repairStatus == RepairStatus.completed)
        .toList();
    final unreadCount = _notifications
        .where((notification) => !notification.isRead)
        .length;

    return Scaffold(
      backgroundColor: AppColors.sheetBackground,
      appBar: AppBar(
        title: Text(widget.isAdmin ? 'Review reports' : 'Maintenance work'),
        actions: [
          IconButton(
            onPressed: _load,
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _error != null && _reports.isEmpty
          ? ErrorView(message: _error!, onRetry: _load)
          : RefreshIndicator(
              onRefresh: _load,
              color: AppColors.brandAccent,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                children: [
                  if (_loading && _reports.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(28),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (widget.isAdmin)
                    _ReviewQueue(
                      count: _reportTotal,
                      page: _reportPage,
                      totalPages: _reportTotalPages,
                      reports: _reports,
                      onOpen: _openReport,
                      onPage: _changeReportPage,
                    )
                  else ...[
                    _OfficerSummary(summary: _summary),
                    const SizedBox(height: 16),
                    SectionCard(
                      title: 'Assignment notifications',
                      trailing: Text(
                        '$unreadCount unread',
                        style: AppTypography.caption(
                          size: 12,
                          color: AppColors.textMuted,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (_notificationError != null)
                            ErrorView(
                              message: _notificationError!,
                              onRetry: _load,
                            )
                          else if (_notifications.isEmpty)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 12),
                              child: Text('No assignment notifications yet.'),
                            )
                          else ...[
                            for (final notification in _notifications.take(5))
                              _NotificationRow(
                                notification: notification,
                                onTap: _markingRead
                                    ? null
                                    : () => _openNotification(notification),
                              ),
                            if (unreadCount > 0)
                              Align(
                                alignment: Alignment.centerRight,
                                child: TextButton(
                                  onPressed: _markingRead ? null : _markAllRead,
                                  child: const Text('Mark all read'),
                                ),
                              ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    _ReportSection(
                      title: 'Assigned work',
                      subtitle: 'Approved reports assigned to your account',
                      reports: activeReports,
                      emptyMessage: 'No active assignments.',
                      onOpen: _openReport,
                    ),
                    if (_reportTotalPages > 1)
                      _DashboardPagination(
                        page: _reportPage,
                        totalPages: _reportTotalPages,
                        total: _reportTotal,
                        onPage: _changeReportPage,
                      ),
                    if (completedReports.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      _ReportSection(
                        title: 'Completed repairs',
                        reports: completedReports,
                        emptyMessage: 'No completed repairs yet.',
                        onOpen: _openReport,
                      ),
                    ],
                  ],
                  if (_error != null && _reports.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(
                        _error!,
                        style: TextStyle(color: AppColors.statusRedInk),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}

class _ReviewQueue extends StatelessWidget {
  const _ReviewQueue({
    required this.count,
    required this.page,
    required this.totalPages,
    required this.reports,
    required this.onOpen,
    required this.onPage,
  });

  final int count;
  final int page;
  final int totalPages;
  final List<RoadReport> reports;
  final ValueChanged<RoadReport> onOpen;
  final ValueChanged<int> onPage;

  @override
  Widget build(BuildContext context) => SectionCard(
    title: 'Pending review',
    trailing: Text(
      '$count',
      style: AppTypography.headingStyle(size: 18, color: AppColors.brandAccent),
    ),
    child: reports.isEmpty
        ? const EmptyState(
            icon: Icons.fact_check_outlined,
            title: 'Queue is clear',
            message: 'New citizen reports will appear here for review.',
          )
        : Column(
            children: [
              for (final report in reports)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: ReportCard(
                    report: report,
                    onTap: () => onOpen(report),
                  ),
                ),
              if (totalPages > 1)
                _DashboardPagination(
                  page: page,
                  totalPages: totalPages,
                  total: count,
                  onPage: onPage,
                ),
            ],
          ),
  );
}

class _DashboardPagination extends StatelessWidget {
  const _DashboardPagination({
    required this.page,
    required this.totalPages,
    required this.total,
    required this.onPage,
  });

  final int page;
  final int totalPages;
  final int total;
  final ValueChanged<int> onPage;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 8),
    child: Row(
      children: [
        Expanded(
          child: Text(
            'Page $page of $totalPages · $total reports',
            style: AppTypography.caption(size: 12, color: AppColors.textMuted),
          ),
        ),
        IconButton(
          onPressed: page > 1 ? () => onPage(page - 1) : null,
          icon: const Icon(Icons.chevron_left_rounded),
          tooltip: 'Previous page',
        ),
        IconButton(
          onPressed: page < totalPages ? () => onPage(page + 1) : null,
          icon: const Icon(Icons.chevron_right_rounded),
          tooltip: 'Next page',
        ),
      ],
    ),
  );
}

class _OfficerSummary extends StatelessWidget {
  const _OfficerSummary({required this.summary});

  final Map<String, int> summary;

  @override
  Widget build(BuildContext context) {
    final items = [
      ('Assigned', summary['assigned'] ?? 0, AppColors.brandAccent),
      ('Awaiting', summary['awaiting'] ?? 0, AppColors.statusBlueInk),
      ('In progress', summary['inProgress'] ?? 0, AppColors.statusAmberInk),
      ('Completed', summary['completed'] ?? 0, AppColors.statusGreenInk),
    ];
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        for (final item in items)
          SizedBox(
            width: (MediaQuery.sizeOf(context).width - 42) / 2,
            child: SectionCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.$1,
                    style: AppTypography.caption(
                      size: 11,
                      color: AppColors.textMuted,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    '${item.$2}',
                    style: AppTypography.display(size: 24, color: item.$3),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _ReportSection extends StatelessWidget {
  const _ReportSection({
    required this.title,
    required this.reports,
    required this.emptyMessage,
    required this.onOpen,
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final List<RoadReport> reports;
  final String emptyMessage;
  final ValueChanged<RoadReport> onOpen;

  @override
  Widget build(BuildContext context) => SectionCard(
    title: title,
    subtitle: subtitle,
    child: reports.isEmpty
        ? Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(
              emptyMessage,
              style: AppTypography.bodyStyle(
                size: 13,
                color: AppColors.textMuted,
              ),
            ),
          )
        : Column(
            children: [
              for (final report in reports)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: ReportCard(
                    report: report,
                    onTap: () => onOpen(report),
                  ),
                ),
            ],
          ),
  );
}

class _NotificationRow extends StatelessWidget {
  const _NotificationRow({required this.notification, required this.onTap});

  final MaintenanceNotification notification;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: Icon(
      notification.isRead
          ? Icons.notifications_none_rounded
          : Icons.notifications_active_rounded,
      color: notification.isRead ? AppColors.textMuted : AppColors.brandAccent,
    ),
    title: Text(
      notification.title,
      style: AppTypography.headingStyle(size: 14),
    ),
    subtitle: Text('${notification.message}\n${notification.location}'),
    isThreeLine: true,
    trailing: const Icon(Icons.chevron_right_rounded),
    onTap: onTap,
  );
}
