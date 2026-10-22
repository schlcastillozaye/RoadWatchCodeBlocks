import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/reports_provider.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_typography.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/error_view.dart';
import '../../widgets/report_card.dart';
import 'report_detail_screen.dart';
import 'submit_report_screen.dart';

class MyReportsScreen extends StatefulWidget {
  const MyReportsScreen({super.key});

  @override
  State<MyReportsScreen> createState() => _MyReportsScreenState();
}

class _MyReportsScreenState extends State<MyReportsScreen> {
  final _search = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _searchDebounce;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(() {
      if (_scrollController.position.pixels >=
          _scrollController.position.maxScrollExtent - 300) {
        context.read<MyReportsProvider>().loadMore();
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = context.read<MyReportsProvider>();
      provider.load(refresh: true);
    });
  }

  @override
  void dispose() {
    _search.dispose();
    _scrollController.dispose();
    _searchDebounce?.cancel();
    super.dispose();
  }

  Future<void> _openSubmit() async {
    final created = await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute(builder: (_) => const SubmitReportScreen()));
    if (created == true && mounted) {
      context.read<MyReportsProvider>().load(refresh: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    final provider = context.watch<MyReportsProvider>();

    return Scaffold(
      backgroundColor: AppColors.sheetBackground,
      body: Column(
        children: [
          _Header(
            search: _search,
            isLoading: provider.isLoading,
            onSearchChanged: (value) {
              provider.cancelPendingSearch();
              _searchDebounce?.cancel();
              _searchDebounce = Timer(const Duration(milliseconds: 400), () {
                if (mounted) context.read<MyReportsProvider>().setSearch(value);
              });
            },
            onSearch: (value) {
              _searchDebounce?.cancel();
              provider.setSearch(value);
            },
            onClear: () {
              _searchDebounce?.cancel();
              _search.clear();
              provider.setSearch('');
            },
          ),
          _Filters(provider: provider),
          if (provider.isShowingCache)
            Container(
              width: double.infinity,
              color: AppColors.lightYellow,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Icon(
                    Icons.cloud_off_rounded,
                    size: 15,
                    color: AppColors.darkBlue,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Showing saved reports — you appear to be offline.',
                      // The banner is cream in both themes, so its text stays
                      // navy rather than following the (dark-mode) page ink.
                      style: AppTypography.caption(
                        size: 11.5,
                        color: AppColors.darkBlue,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          Expanded(child: _buildBody(provider)),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openSubmit,
        backgroundColor: AppColors.brandAccent,
        foregroundColor: AppColors.isDark
            ? AppColors.darkBlue
            : AppColors.onPrimary,
        icon: const Icon(Icons.add_rounded),
        label: const Text('New report'),
      ),
    );
  }

  Widget _buildBody(MyReportsProvider provider) {
    if (provider.isLoading && provider.reports.isEmpty) {
      return Center(
        child: CircularProgressIndicator(color: AppColors.brandAccent),
      );
    }
    if (provider.error != null && provider.reports.isEmpty) {
      return ErrorView(
        message: provider.error!,
        onRetry: () => provider.load(refresh: true),
      );
    }
    if (provider.reports.isEmpty) {
      return EmptyState(
        icon: Icons.article_outlined,
        title: 'No reports found',
        message: 'Reports you submit will appear here with their live status.',
        action: ElevatedButton.icon(
          onPressed: _openSubmit,
          icon: const Icon(Icons.camera_alt_rounded, size: 18),
          label: const Text('Report an issue'),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => provider.load(refresh: true),
      color: AppColors.brandAccent,
      child: ListView.separated(
        controller: _scrollController,
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 96),
        itemCount: provider.reports.length + (provider.hasMore ? 1 : 0),
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          if (index >= provider.reports.length) {
            return Padding(
              padding: EdgeInsets.symmetric(vertical: 18),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brandAccent),
              ),
            );
          }
          final report = provider.reports[index];
          return ReportCard(
            report: report,
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ReportDetailScreen(
                  reportId: report.id,
                  initialReport: report,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.search,
    required this.isLoading,
    required this.onSearchChanged,
    required this.onSearch,
    required this.onClear,
  });

  final TextEditingController search;
  final bool isLoading;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<String> onSearch;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    return Container(
      decoration: BoxDecoration(
        color: AppColors.darkBlue,
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(28),
          bottomRight: Radius.circular(28),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
      child: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 14, bottom: 14),
              child: Text(
                'My reports',
                style: AppTypography.display(
                  size: 24,
                  color: AppColors.onPrimary,
                ),
              ),
            ),
            TextField(
              key: const Key('my-reports-search-field'),
              controller: search,
              textInputAction: TextInputAction.search,
              onChanged: onSearchChanged,
              onSubmitted: onSearch,
              style: AppTypography.bodyStyle(size: 14),
              decoration: InputDecoration(
                hintText: 'Search by title or reference no.',
                prefixIcon: const Icon(Icons.search_rounded, size: 20),
                suffixIcon: isLoading
                    ? Padding(
                        padding: const EdgeInsets.all(14),
                        child: SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.brandAccent,
                          ),
                        ),
                      )
                    : search.text.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.close_rounded, size: 18),
                        onPressed: onClear,
                      ),
                isDense: true,
                fillColor: AppColors.cardSurface,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Filters extends StatelessWidget {
  const _Filters({required this.provider});

  final MyReportsProvider provider;

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    return SizedBox(
      height: 54,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        children: [
          _chip(
            'All',
            provider.filterModeration == null && provider.filterRepair == null,
            () {
              provider.setModerationFilter(null);
              provider.setRepairFilter(null);
            },
          ),
          for (final status in ModerationStatus.values) ...[
            const SizedBox(width: 8),
            _chip(
              status.label,
              provider.filterModeration == status,
              () => provider.setModerationFilter(status),
            ),
          ],
          for (final status in RepairStatus.values) ...[
            const SizedBox(width: 8),
            _chip(
              status.label,
              provider.filterRepair == status,
              () => provider.setRepairFilter(status),
            ),
          ],
        ],
      ),
    );
  }

  Widget _chip(String label, bool selected, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? AppColors.darkBlue : AppColors.cardSurface,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected ? AppColors.darkBlue : AppColors.border,
          ),
        ),
        child: Text(
          label,
          style: AppTypography.bodyStyle(
            size: 12.5,
            weight: FontWeight.w600,
            color: selected ? AppColors.onPrimary : AppColors.textSecondary,
            height: 1.1,
          ),
        ),
      ),
    );
  }
}
