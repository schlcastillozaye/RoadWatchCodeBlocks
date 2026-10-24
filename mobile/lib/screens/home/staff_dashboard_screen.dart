import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'dart:async';

import '../../core/api_exception.dart';
import '../../models/models.dart';
import '../../services/roadwatch_api.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_typography.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/error_view.dart';
import '../../widgets/dashboard_stat_grid.dart';
import '../../widgets/report_card.dart';
import '../../widgets/section_card.dart';
import '../reports/report_detail_screen.dart';

class StaffDashboardScreen extends StatefulWidget {
  const StaffDashboardScreen({
    super.key,
    required this.isAdmin,
    this.showAllReports = false,
    this.showHistory = false,
    this.showAssignmentsOnly = false,
  });

  final bool isAdmin;
  final bool showAllReports;
  final bool showHistory;
  final bool showAssignmentsOnly;

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
  Map<String, int> _adminSummary = const {};
  String? _adminSummaryError;
  int _reportPage = 1;
  int _reportTotal = 0;
  int _reportTotalPages = 1;
  bool _markingRead = false;
  String? _deletingReportId;
  Timer? _notificationExpiryTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _notificationExpiryTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted) return;
      final now = DateTime.now();
      final remaining = _notifications
          .where(
            (item) => item.expiresAt != null && item.expiresAt!.isAfter(now),
          )
          .toList();
      if (remaining.length != _notifications.length) {
        setState(() => _notifications = remaining);
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _notificationExpiryTimer?.cancel();
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
          moderationStatus: widget.showAllReports
              ? null
              : ModerationStatus.pendingReview,
        );
        if (mounted) {
          setState(() {
            _reports = page.items;
            _reportTotal = page.total;
            _reportTotalPages = page.totalPages;
          });
        }
        if (!widget.showAllReports) {
          try {
            final summary = await api.adminReportStatistics();
            if (mounted) {
              setState(() {
                _adminSummary = summary;
                _adminSummaryError = null;
              });
            }
          } on ApiException catch (error) {
            if (mounted) setState(() => _adminSummaryError = error.message);
          } catch (_) {
            if (mounted) {
              setState(
                () => _adminSummaryError = 'Could not load report statistics.',
              );
            }
          }
        }
      } else {
        final page = await api.maintenanceAssignments(
          page: _reportPage,
          pageSize: 100,
          repairStatus: widget.showHistory
              ? RepairStatus.verifiedCompleted
              : null,
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

  Future<void> _confirmAdminDelete(RoadReport report) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete report?'),
        content: Text(
          'Permanently delete ${report.referenceNo} — ${report.title}, including its photos, assignments, and history?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(
              'Delete report',
              style: TextStyle(color: AppColors.statusRedInk),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _deletingReportId = report.id);
    try {
      await context.read<RoadWatchApi>().deleteAdminReport(report.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${report.referenceNo} was deleted.')),
      );
      await _load();
      if (mounted && _reports.isEmpty && _reportPage > _reportTotalPages) {
        setState(() => _reportPage = _reportTotalPages.clamp(1, 1 << 31));
        await _load();
      }
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('The report could not be deleted.')),
        );
      }
    } finally {
      if (mounted) setState(() => _deletingReportId = null);
    }
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
                        expiresAt: item.expiresAt,
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

  Widget _notificationsSection(int unreadCount) => SectionCard(
    title: 'Workflow notifications',
    trailing: Text(
      '$unreadCount unread',
      style: AppTypography.caption(size: 12, color: AppColors.textMuted),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_notificationError != null)
          ErrorView(message: _notificationError!, onRetry: _load)
        else if (_notifications.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text(
              'No active notifications. Notifications expire after five minutes.',
            ),
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
  );

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    final activeReports = _reports
        .where((report) => !report.isCompleted)
        .toList();
    final completedReports = _reports
        .where((report) => report.isCompleted)
        .toList();
    final unreadCount = _notifications
        .where((notification) => !notification.isRead)
        .length;

    return Scaffold(
      backgroundColor: AppColors.sheetBackground,
      appBar: AppBar(
        title: Text(
          widget.isAdmin
              ? widget.showAllReports
                    ? 'Manage reports'
                    : 'Dashboard'
              : widget.showHistory
              ? 'Repair history'
              : widget.showAssignmentsOnly
              ? 'My assignments'
              : 'Dashboard',
        ),
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
                  else if (widget.isAdmin) ...[
                    if (!widget.showAllReports) ...[
                      if (_adminSummaryError == null)
                        _AdminSummary(summary: _adminSummary)
                      else
                        Text(
                          'Report statistics unavailable: $_adminSummaryError',
                          style: TextStyle(color: AppColors.statusRedInk),
                        ),
                      const SizedBox(height: 16),
                    ],
                    _notificationsSection(unreadCount),
                    const SizedBox(height: 16),
                    _ReviewQueue(
                      count: _reportTotal,
                      page: _reportPage,
                      totalPages: _reportTotalPages,
                      reports: _reports,
                      title: widget.showAllReports
                          ? 'All reports'
                          : 'Pending review',
                      onOpen: _openReport,
                      onDelete: widget.isAdmin ? _confirmAdminDelete : null,
                      deletingReportId: _deletingReportId,
                      onPage: _changeReportPage,
                    ),
                  ] else if (widget.showHistory) ...[
                    _ReportSection(
                      title: 'Verified repairs',
                      subtitle:
                          'Repairs approved as complete by an administrator',
                      reports: completedReports,
                      emptyMessage: 'No verified repairs yet.',
                      onOpen: _openReport,
                    ),
                    if (_reportTotalPages > 1)
                      _DashboardPagination(
                        page: _reportPage,
                        totalPages: _reportTotalPages,
                        total: _reportTotal,
                        onPage: _changeReportPage,
                      ),
                  ] else if (widget.showAssignmentsOnly) ...[
                    _ReportSection(
                      title: 'My assignments',
                      subtitle:
                          'Approved reports assigned to you for maintenance',
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
                  ] else ...[
                    _OfficerSummary(summary: _summary),
                    const SizedBox(height: 16),
                    _notificationsSection(unreadCount),
                    const SizedBox(height: 16),
                    SectionCard(
                      title: 'Assigned work',
                      subtitle:
                          '${_summary['assigned'] ?? 0} report${_summary['assigned'] == 1 ? '' : 's'} assigned to you',
                      child: SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: () {
                            Navigator.of(context).push<void>(
                              MaterialPageRoute(
                                builder: (_) => const StaffDashboardScreen(
                                  isAdmin: false,
                                  showAssignmentsOnly: true,
                                ),
                              ),
                            );
                          },
                          icon: const Icon(Icons.assignment_outlined),
                          label: const Text('View my assignments'),
                        ),
                      ),
                    ),
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
    required this.title,
    required this.onOpen,
    this.onDelete,
    this.deletingReportId,
    required this.onPage,
  });

  final int count;
  final int page;
  final int totalPages;
  final List<RoadReport> reports;
  final String title;
  final ValueChanged<RoadReport> onOpen;
  final ValueChanged<RoadReport>? onDelete;
  final String? deletingReportId;
  final ValueChanged<int> onPage;

  @override
  Widget build(BuildContext context) => SectionCard(
    title: title,
    trailing: Text(
      '$count',
      style: AppTypography.headingStyle(size: 18, color: AppColors.brandAccent),
    ),
    child: reports.isEmpty
        ? EmptyState(
            icon: Icons.fact_check_outlined,
            title: title == 'All reports'
                ? 'No reports found'
                : 'Queue is clear',
            message: title == 'All reports'
                ? 'New reports will appear here when submitted.'
                : 'New citizen reports will appear here for review.',
          )
        : Column(
            children: [
              for (final report in reports)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ReportCard(report: report, onTap: () => onOpen(report)),
                      if (onDelete != null) ...[
                        const SizedBox(height: 8),
                        LayoutBuilder(
                          builder: (context, constraints) {
                            final details = OutlinedButton.icon(
                              onPressed: () => onOpen(report),
                              icon: const Icon(Icons.open_in_new_rounded),
                              label: const Text('Details'),
                              style: OutlinedButton.styleFrom(
                                minimumSize: const Size(0, 44),
                              ),
                            );
                            final delete = OutlinedButton.icon(
                              onPressed: deletingReportId == report.id
                                  ? null
                                  : () => onDelete!(report),
                              icon: deletingReportId == report.id
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Icon(Icons.delete_outline_rounded),
                              label: Text(
                                deletingReportId == report.id
                                    ? 'Deleting…'
                                    : 'Delete',
                              ),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: AppColors.statusRedInk,
                                minimumSize: const Size(0, 44),
                              ),
                            );
                            if (constraints.maxWidth < 360) {
                              return Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  details,
                                  const SizedBox(height: 8),
                                  delete,
                                ],
                              );
                            }
                            return Row(
                              children: [
                                Expanded(child: details),
                                const SizedBox(width: 10),
                                Expanded(child: delete),
                              ],
                            );
                          },
                        ),
                      ],
                    ],
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

class _AdminSummary extends StatelessWidget {
  const _AdminSummary({required this.summary});

  final Map<String, int> summary;

  @override
  Widget build(BuildContext context) => DashboardStatGrid(
    metrics: [
      DashboardMetric(
        label: 'Total reports',
        value: '${summary['total'] ?? 0}',
        color: AppColors.textPrimary,
      ),
      DashboardMetric(
        label: 'Pending review',
        value: '${summary['pending'] ?? 0}',
        color: AppColors.statusAmberInk,
      ),
      DashboardMetric(
        label: 'Approved',
        value: '${summary['approved'] ?? 0}',
        color: AppColors.statusGreenInk,
      ),
      DashboardMetric(
        label: 'Rejected',
        value: '${summary['rejected'] ?? 0}',
        color: AppColors.statusRedInk,
      ),
      DashboardMetric(
        label: 'Under repair',
        value:
            '${(summary['awaiting'] ?? 0) + (summary['inProgress'] ?? 0) + (summary['awaitingVerification'] ?? 0) + (summary['returnedForWork'] ?? 0)}',
        color: AppColors.statusBlueInk,
      ),
    ],
  );
}

class _OfficerSummary extends StatelessWidget {
  const _OfficerSummary({required this.summary});

  final Map<String, int> summary;

  @override
  Widget build(BuildContext context) {
    return DashboardStatGrid(
      metrics: [
        DashboardMetric(
          label: 'Assigned',
          value: '${summary['assigned'] ?? 0}',
          color: AppColors.brandAccent,
        ),
        DashboardMetric(
          label: 'Awaiting',
          value: '${summary['awaiting'] ?? 0}',
          color: AppColors.statusBlueInk,
        ),
        DashboardMetric(
          label: 'In progress',
          value: '${summary['inProgress'] ?? 0}',
          color: AppColors.statusAmberInk,
        ),
        DashboardMetric(
          label: 'Completed',
          value: '${summary['completed'] ?? 0}',
          color: AppColors.statusGreenInk,
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
