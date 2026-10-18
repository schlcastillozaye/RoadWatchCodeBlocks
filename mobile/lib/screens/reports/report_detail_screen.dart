import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_exception.dart';
import '../../core/format.dart';
import '../../models/models.dart';
import '../../services/roadwatch_api.dart';
import '../../state/reports_provider.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_typography.dart';
import '../../widgets/app_button.dart';
import '../../widgets/category_badge.dart';
import '../../widgets/error_view.dart';
import '../../widgets/photo_thumbnail.dart';
import '../../widgets/roadwatch_map.dart';
import '../../widgets/section_card.dart';
import '../../widgets/status_chip.dart';

class ReportDetailScreen extends StatefulWidget {
  const ReportDetailScreen({super.key, required this.reportId, this.initialReport});

  final String reportId;
  final RoadReport? initialReport;

  @override
  State<ReportDetailScreen> createState() => _ReportDetailScreenState();
}

class _ReportDetailScreenState extends State<ReportDetailScreen> {
  RoadReport? _report;
  List<StatusHistoryEntry> _history = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _report = widget.initialReport;
    _loading = widget.initialReport == null;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _report == null;
      _error = null;
    });
    final api = context.read<RoadWatchApi>();
    try {
      final results = await Future.wait([
        api.getReport(widget.reportId),
        api.getHistory(widget.reportId),
      ]);
      if (!mounted) return;
      final report = results[0] as RoadReport;
      setState(() {
        _report = report;
        _history = results[1] as List<StatusHistoryEntry>;
      });
      if (!mounted) return;
      context.read<MyReportsProvider>().replaceReport(report);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = _report == null ? e.message : null);
    } catch (_) {
      if (mounted) setState(() => _error = _report == null ? 'Could not load this report.' : null);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openExternalMap() async {
    final report = _report;
    if (report == null) return;
    final uri = openStreetMapUri(report.latitude, report.longitude);
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) _snack('Could not open the maps application.');
    } catch (_) {
      if (mounted) _snack('Could not open the maps application.');
    }
  }

  Future<void> _confirmDelete() async {
    final report = _report;
    if (report == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Withdraw report?'),
        content: const Text('This permanently removes the report. This can only be done while it is pending review.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text('Withdraw', style: TextStyle(color: AppColors.statusRedInk)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    if (!mounted) return;
    final provider = context.read<MyReportsProvider>();

    try {
      await provider.delete(report.id);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) _snack(e.message);
    }
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    return Scaffold(
      backgroundColor: AppColors.sheetBackground,
      appBar: AppBar(
        title: Text(_report?.referenceNo ?? 'Report'),
        actions: [
          IconButton(
            onPressed: _load,
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return Center(child: CircularProgressIndicator(color: AppColors.brandAccent));
    }
    if (_error != null) {
      return ErrorView(message: _error!, onRetry: _load);
    }
    final report = _report!;

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.brandAccent,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          _Summary(report: report),
          if (report.isRejected && report.rejectionReason != null) ...[
            const SizedBox(height: 14),
            SectionCard(
              color: AppColors.tintRed,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.cancel_rounded, size: 18, color: AppColors.statusRedInk),
                      const SizedBox(width: 8),
                      Text('Rejected', style: AppTypography.headingStyle(size: 15, color: AppColors.statusRedInk)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    report.rejectionReason!,
                    style: AppTypography.bodyStyle(size: 13.5, color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 14),
          _PhotosSection(report: report),
          const SizedBox(height: 14),
          SectionCard(
            title: 'Details',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(report.description, style: AppTypography.bodyStyle(size: 14, color: AppColors.textSecondary)),
                const SizedBox(height: 14),
                const Divider(),
                const SizedBox(height: 12),
                _KeyValue(label: 'Category', value: report.categoryLabel, icon: report.category.icon),
                _KeyValue(label: 'Priority', value: report.priority.label, icon: Icons.flag_rounded),
                _KeyValue(label: 'Submitted', value: formatDateTime(report.createdAt), icon: Icons.schedule_rounded),
                if (report.officerName != null)
                  _KeyValue(label: 'Assigned to', value: report.officerName!, icon: Icons.engineering_rounded),
              ],
            ),
          ),
          const SizedBox(height: 14),
          _LocationSection(report: report, onOpenMaps: _openExternalMap),
          if (report.completionNotes != null && report.completionNotes!.isNotEmpty) ...[
            const SizedBox(height: 14),
            SectionCard(
              title: 'Completion notes',
              color: AppColors.tintGreen,
              child: Text(
                report.completionNotes!,
                style: AppTypography.bodyStyle(size: 13.5, color: AppColors.textSecondary),
              ),
            ),
          ],
          const SizedBox(height: 14),
          _Timeline(history: _history),
          if (report.moderationStatus == ModerationStatus.pendingReview) ...[
            const SizedBox(height: 20),
            AppButton(
              label: 'Withdraw report',
              variant: AppButtonVariant.secondary,
              icon: Icons.delete_outline_rounded,
              onPressed: _confirmDelete,
            ),
          ],
        ],
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.report});

  final RoadReport report;

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    return Container(
      decoration: BoxDecoration(
        color: AppColors.darkBlue,
        borderRadius: BorderRadius.circular(24),
      ),
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(color: AppColors.lightBlue, borderRadius: BorderRadius.circular(15)),
                child: Icon(report.category.icon, color: AppColors.darkBlue, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(report.title, style: AppTypography.display(size: 19, color: AppColors.onPrimary)),
                    const SizedBox(height: 3),
                    Text(
                      report.referenceNo,
                      style: AppTypography.caption(size: 12, color: AppColors.lightBlue),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              StatusChip(moderation: report.moderationStatus),
              StatusChip(repair: report.repairStatus),
              PriorityPill(priority: report.priority),
            ],
          ),
        ],
      ),
    );
  }
}

class _PhotosSection extends StatelessWidget {
  const _PhotosSection({required this.report});

  final RoadReport report;

  @override
  Widget build(BuildContext context) {
    final before = report.photosOf(PhotoKind.before);
    final progress = report.photosOf(PhotoKind.progress);
    final after = report.photosOf(PhotoKind.after);

    if (report.photos.isEmpty) {
      return const SizedBox.shrink();
    }

    Widget gallery(String title, List<ReportPhoto> photos) {
      if (photos.isEmpty) return const SizedBox.shrink();
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text('$title (${photos.length})', style: AppTypography.headingStyle(size: 14.5)),
          ),
          SizedBox(
            height: 116,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: photos.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, i) => PhotoThumbnail(
                photo: photos[i],
                width: 116,
                height: 116,
                radius: 16,
                onTap: () => PhotoGalleryScreen.open(context, photos, initialIndex: i),
              ),
            ),
          ),
        ],
      );
    }

    return SectionCard(
      title: 'Photos',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          gallery('Before', before),
          if (progress.isNotEmpty) ...[const SizedBox(height: 14), gallery('Progress', progress)],
          if (after.isNotEmpty) ...[const SizedBox(height: 14), gallery('After', after)],
        ],
      ),
    );
  }
}

class _LocationSection extends StatelessWidget {
  const _LocationSection({required this.report, required this.onOpenMaps});

  final RoadReport report;
  final VoidCallback onOpenMaps;

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    final target = LatLng(report.latitude, report.longitude);

    return SectionCard(
      title: 'Location',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: SizedBox(
              height: 170,
              child: FlutterMap(
                options: MapOptions(
                  initialCenter: target,
                  initialZoom: 16,
                  minZoom: 3,
                  maxZoom: 19,
                  interactionOptions: const InteractionOptions(
                    flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                  ),
                ),
                children: [
                  roadwatchTileLayer(),
                  MarkerLayer(
                    markers: [
                      Marker(
                        point: target,
                        width: 26,
                        height: 26,
                        child: Tooltip(
                          message: '${report.title} · ${report.referenceNo}',
                          child: MapStatusDot(color: AppColors.darkBlue, strokeColor: AppColors.lightBlue),
                        ),
                      ),
                    ],
                  ),
                  roadwatchAttribution(),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(Icons.place_rounded, size: 17, color: AppColors.brandAccent),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  report.locationLabel,
                  style: AppTypography.bodyStyle(size: 13.5, color: AppColors.textSecondary),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          AppButton(
            label: 'Open in OpenStreetMap',
            variant: AppButtonVariant.secondary,
            icon: Icons.directions_rounded,
            onPressed: onOpenMaps,
          ),
        ],
      ),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.history});

  final List<StatusHistoryEntry> history;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      title: 'Progress timeline',
      child: history.isEmpty
          ? Text('No status updates yet.', style: AppTypography.caption(size: 13))
          : Column(
              children: [
                for (var i = 0; i < history.length; i++)
                  _TimelineRow(
                    entry: history[i],
                    isLast: i == history.length - 1,
                  ),
              ],
            ),
    );
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({required this.entry, required this.isLast});

  final StatusHistoryEntry entry;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    final color = switch (entry.type) {
      'MODERATION' => AppColors.statusGreen,
      'ASSIGNMENT' => AppColors.statusBlue,
      'REPAIR' => AppColors.statusAmber,
      _ => AppColors.darkBlue,
    };

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(7),
                ),
                alignment: Alignment.center,
                child: Container(width: 9, height: 9, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3))),
              ),
              if (!isLast)
                Expanded(
                  child: Container(width: 2, color: AppColors.lightAzure, margin: const EdgeInsets.symmetric(vertical: 2)),
                ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(entry.typeLabel, style: AppTypography.bodyStyle(size: 13.5, weight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(
                    entry.note?.isNotEmpty == true ? entry.note! : entry.toValue.replaceAll('_', ' ').toLowerCase(),
                    style: AppTypography.caption(size: 12),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    [
                      if (entry.actorName != null) entry.actorName!,
                      formatDateTime(entry.createdAt),
                    ].join(' · '),
                    style: AppTypography.caption(size: 11, color: AppColors.textMuted),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _KeyValue extends StatelessWidget {
  const _KeyValue({required this.label, required this.value, required this.icon});

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppColors.textMuted),
          const SizedBox(width: 10),
          SizedBox(width: 92, child: Text(label, style: AppTypography.caption(size: 12.5))),
          Expanded(
            child: Text(value, style: AppTypography.bodyStyle(size: 13.5, weight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}
