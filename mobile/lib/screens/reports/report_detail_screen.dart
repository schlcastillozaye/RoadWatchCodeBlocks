import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_client.dart';
import '../../core/api_exception.dart';
import '../../core/format.dart';
import '../../core/json.dart';
import '../../models/models.dart';
import '../../services/roadwatch_api.dart';
import '../../state/auth_provider.dart';
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
  const ReportDetailScreen({
    super.key,
    required this.reportId,
    this.initialReport,
  });

  final String reportId;
  final RoadReport? initialReport;

  @override
  State<ReportDetailScreen> createState() => _ReportDetailScreenState();
}

class _ReportDetailScreenState extends State<ReportDetailScreen> {
  RoadReport? _report;
  List<StatusHistoryEntry> _history = [];
  bool _loading = true;
  bool _actionBusy = false;
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
      if (mounted) {
        setState(
          () => _error = _report == null ? 'Could not load this report.' : null,
        );
      }
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
        content: const Text(
          'This permanently removes the report. This can only be done while it is pending review.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(
              'Withdraw',
              style: TextStyle(color: AppColors.statusRedInk),
            ),
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

  Future<void> _moderate(String decision) async {
    final controller = TextEditingController();
    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          decision == 'APPROVE' ? 'Approve report?' : 'Reject report?',
        ),
        content: decision == 'REJECT'
            ? TextField(
                controller: controller,
                autofocus: true,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Reason (at least 5 characters)',
                ),
              )
            : const Text(
                'This report will become eligible for the public map and admin assignment.',
              ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(decision == 'APPROVE' ? 'Approve' : 'Reject'),
          ),
        ],
      ),
    );
    final reason = controller.text.trim();
    controller.dispose();
    if (accepted != true) return;
    if (!mounted) return;
    if (decision == 'REJECT' && reason.length < 5) {
      _snack('Enter a rejection reason of at least 5 characters.');
      return;
    }

    setState(() => _actionBusy = true);
    try {
      final updated = await context.read<RoadWatchApi>().moderateReport(
        widget.reportId,
        decision: decision,
        reason: reason,
      );
      if (!mounted) return;
      setState(() => _report = updated);
      await _load();
      if (mounted) {
        _snack(
          decision == 'APPROVE'
              ? 'Report approved. Assign it to an officer to create an assignment notification.'
              : 'Report rejected.',
        );
      }
    } on ApiException catch (error) {
      if (mounted) _snack(error.message);
    } catch (_) {
      if (mounted) _snack('The moderation decision could not be saved.');
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  Future<void> _assignOfficer() async {
    setState(() => _actionBusy = true);
    try {
      final officers = await context.read<RoadWatchApi>().maintenanceOfficers();
      if (!mounted) return;
      if (officers.isEmpty) {
        _snack('No active maintenance officers are available for assignment.');
        return;
      }
      var selectedId = '';
      final officerId = await showDialog<String>(
        context: context,
        builder: (dialogContext) => StatefulBuilder(
          builder: (context, setDialogState) => AlertDialog(
            title: const Text('Assign maintenance officer'),
            content: DropdownButtonFormField<String>(
              initialValue: selectedId.isEmpty ? null : selectedId,
              items: officers
                  .map(
                    (officer) => DropdownMenuItem<String>(
                      value: asString(officer['id']),
                      child: Text(asString(officer['fullName'])),
                    ),
                  )
                  .toList(),
              onChanged: (value) =>
                  setDialogState(() => selectedId = value ?? ''),
              decoration: const InputDecoration(labelText: 'Officer'),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: selectedId.isEmpty
                    ? null
                    : () => Navigator.pop(dialogContext, selectedId),
                child: const Text('Assign'),
              ),
            ],
          ),
        ),
      );
      if (officerId == null) return;
      if (!mounted) return;
      final updated = await context.read<RoadWatchApi>().assignReport(
        widget.reportId,
        officerId: officerId,
      );
      if (!mounted) return;
      setState(() => _report = updated);
      await _load();
      if (mounted) _snack('Officer assigned and notified.');
    } on ApiException catch (error) {
      if (mounted) _snack(error.message);
    } catch (_) {
      if (mounted) _snack('The officer assignment could not be saved.');
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  Future<void> _startRepair() async {
    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Start this repair?'),
        content: const Text('The report status will change to In progress.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Start work'),
          ),
        ],
      ),
    );
    if (accepted != true) return;
    if (!mounted) return;
    setState(() => _actionBusy = true);
    try {
      final updated = await context.read<RoadWatchApi>().updateRepair(
        widget.reportId,
        status: RepairStatus.inProgress,
      );
      if (!mounted) return;
      setState(() => _report = updated);
      await _load();
      if (mounted) _snack('Repair marked in progress.');
    } on ApiException catch (error) {
      if (mounted) _snack(error.message);
    } catch (_) {
      if (mounted) _snack('Repair status could not be updated.');
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  Future<void> _completeRepair() async {
    final notesController = TextEditingController();
    final notes = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Complete repair'),
        content: TextField(
          controller: notesController,
          autofocus: true,
          minLines: 2,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'Completion notes (at least 5 characters)',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.pop(dialogContext, notesController.text.trim()),
            child: const Text('Continue'),
          ),
        ],
      ),
    );
    notesController.dispose();
    if (notes == null) return;
    if (!mounted) return;
    if (notes.length < 5) {
      _snack('Completion notes must be at least 5 characters.');
      return;
    }

    final image = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    if (image == null) {
      _snack('Choose an after-repair photo before completing this report.');
      return;
    }
    if (!mounted) return;
    setState(() => _actionBusy = true);
    try {
      final api = context.read<RoadWatchApi>();
      await api.addReportPhotos(
        widget.reportId,
        kind: PhotoKind.after,
        photos: [
          UploadFile(
            field: 'afterPhotos',
            path: image.path,
            filename: image.name,
          ),
        ],
      );
      final updated = await api.updateRepair(
        widget.reportId,
        status: RepairStatus.completed,
        completionNotes: notes,
      );
      if (!mounted) return;
      setState(() => _report = updated);
      await _load();
      if (mounted) _snack('Repair completed.');
    } on ApiException catch (error) {
      if (mounted) _snack(error.message);
    } catch (_) {
      if (mounted) _snack('The repair could not be completed.');
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
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
      return Center(
        child: CircularProgressIndicator(color: AppColors.brandAccent),
      );
    }
    if (_error != null) {
      return ErrorView(message: _error!, onRetry: _load);
    }
    final report = _report!;
    final user = context.watch<AuthProvider>().user;
    final canModerate =
        user?.isAdmin == true &&
        report.moderationStatus == ModerationStatus.pendingReview;
    final canAssign =
        user?.isAdmin == true &&
        report.moderationStatus == ModerationStatus.approved &&
        report.repairStatus != RepairStatus.completed;
    final canMaintain =
        report.moderationStatus == ModerationStatus.approved &&
        report.repairStatus != RepairStatus.notAssigned &&
        report.repairStatus != RepairStatus.completed &&
        (user?.isAdmin == true || user?.isOfficer == true);

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.brandAccent,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          _Summary(report: report),
          if (canModerate || canAssign || canMaintain) ...[
            const SizedBox(height: 14),
            SectionCard(
              title: 'Staff actions',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (canModerate) ...[
                    AppButton(
                      label: 'Approve report',
                      icon: Icons.check_circle_outline_rounded,
                      onPressed: _actionBusy
                          ? null
                          : () => _moderate('APPROVE'),
                    ),
                    const SizedBox(height: 8),
                    AppButton(
                      label: 'Reject report',
                      variant: AppButtonVariant.secondary,
                      icon: Icons.cancel_outlined,
                      onPressed: _actionBusy ? null : () => _moderate('REJECT'),
                    ),
                  ],
                  if (canAssign) ...[
                    AppButton(
                      label: report.officerName == null
                          ? 'Assign to officer'
                          : 'Reassign officer',
                      icon: Icons.person_add_alt_1_rounded,
                      onPressed: _actionBusy ? null : _assignOfficer,
                    ),
                  ],
                  if (canMaintain &&
                      report.repairStatus == RepairStatus.awaitingMaintenance)
                    AppButton(
                      label: 'Start work',
                      icon: Icons.play_arrow_rounded,
                      onPressed: _actionBusy ? null : _startRepair,
                    ),
                  if (canMaintain &&
                      report.repairStatus == RepairStatus.inProgress)
                    AppButton(
                      label: 'Add after photo and complete',
                      icon: Icons.task_alt_rounded,
                      onPressed: _actionBusy ? null : _completeRepair,
                    ),
                  if (_actionBusy)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Center(
                        child: CircularProgressIndicator(
                          color: AppColors.brandAccent,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
          if (report.isRejected && report.rejectionReason != null) ...[
            const SizedBox(height: 14),
            SectionCard(
              color: AppColors.tintRed,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.cancel_rounded,
                        size: 18,
                        color: AppColors.statusRedInk,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Rejected',
                        style: AppTypography.headingStyle(
                          size: 15,
                          color: AppColors.statusRedInk,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    report.rejectionReason!,
                    style: AppTypography.bodyStyle(
                      size: 13.5,
                      color: AppColors.textSecondary,
                    ),
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
                Text(
                  report.description,
                  style: AppTypography.bodyStyle(
                    size: 14,
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 14),
                const Divider(),
                const SizedBox(height: 12),
                _KeyValue(
                  label: 'Category',
                  value: report.categoryLabel,
                  icon: report.category.icon,
                ),
                _KeyValue(
                  label: 'Priority',
                  value: report.priority.label,
                  icon: Icons.flag_rounded,
                ),
                _KeyValue(
                  label: 'Submitted',
                  value: formatDateTime(report.createdAt),
                  icon: Icons.schedule_rounded,
                ),
                if (report.officerName != null)
                  _KeyValue(
                    label: 'Assigned to',
                    value: report.officerName!,
                    icon: Icons.engineering_rounded,
                  ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          _LocationSection(report: report, onOpenMaps: _openExternalMap),
          if (report.completionNotes != null &&
              report.completionNotes!.isNotEmpty) ...[
            const SizedBox(height: 14),
            SectionCard(
              title: 'Completion notes',
              color: AppColors.tintGreen,
              child: Text(
                report.completionNotes!,
                style: AppTypography.bodyStyle(
                  size: 13.5,
                  color: AppColors.textSecondary,
                ),
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
                decoration: BoxDecoration(
                  color: AppColors.lightBlue,
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Icon(
                  report.category.icon,
                  color: AppColors.darkBlue,
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      report.title,
                      style: AppTypography.display(
                        size: 19,
                        color: AppColors.onPrimary,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      report.referenceNo,
                      style: AppTypography.caption(
                        size: 12,
                        color: AppColors.lightBlue,
                      ),
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
            child: Text(
              '$title (${photos.length})',
              style: AppTypography.headingStyle(size: 14.5),
            ),
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
                onTap: () =>
                    PhotoGalleryScreen.open(context, photos, initialIndex: i),
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
          if (progress.isNotEmpty) ...[
            const SizedBox(height: 14),
            gallery('Progress', progress),
          ],
          if (after.isNotEmpty) ...[
            const SizedBox(height: 14),
            gallery('After', after),
          ],
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
                          child: MapStatusDot(
                            color: AppColors.darkBlue,
                            strokeColor: AppColors.lightBlue,
                          ),
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
                  style: AppTypography.bodyStyle(
                    size: 13.5,
                    color: AppColors.textSecondary,
                  ),
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
          ? Text(
              'No status updates yet.',
              style: AppTypography.caption(size: 13),
            )
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
      // Anything unrecognised still draws a dot that is visible on the card in
      // both themes (navy in light mode, sky in dark mode).
      _ => AppColors.brandAccent,
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
                child: Container(
                  width: 9,
                  height: 9,
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 2,
                    color: AppColors.border,
                    margin: const EdgeInsets.symmetric(vertical: 2),
                  ),
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
                  Text(
                    entry.typeLabel,
                    style: AppTypography.bodyStyle(
                      size: 13.5,
                      weight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    entry.note?.isNotEmpty == true
                        ? entry.note!
                        : entry.toValue.replaceAll('_', ' ').toLowerCase(),
                    style: AppTypography.caption(size: 12),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    [
                      if (entry.actorName != null) entry.actorName!,
                      formatDateTime(entry.createdAt),
                    ].join(' · '),
                    style: AppTypography.caption(
                      size: 11,
                      color: AppColors.textMuted,
                    ),
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
  const _KeyValue({
    required this.label,
    required this.value,
    required this.icon,
  });

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
          SizedBox(
            width: 92,
            child: Text(label, style: AppTypography.caption(size: 12.5)),
          ),
          Expanded(
            child: Text(
              value,
              style: AppTypography.bodyStyle(
                size: 13.5,
                weight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
