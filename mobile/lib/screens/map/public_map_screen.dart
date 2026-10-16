import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../core/format.dart';
import '../../models/models.dart';
import '../../services/roadwatch_api.dart';
import '../../services/recent_searches.dart';
import '../../state/map_provider.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_typography.dart';
import '../../theme/status_theme.dart';
import '../../widgets/category_badge.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/photo_thumbnail.dart';
import '../../widgets/roadwatch_map.dart';
import '../../widgets/status_chip.dart';

/// Public map of approved reports, drawn with Leaflet-style OpenStreetMap
/// tiles — no API key, no billing. A list view is available as a toggle.
class PublicMapScreen extends StatefulWidget {
  const PublicMapScreen({super.key});

  @override
  State<PublicMapScreen> createState() => _PublicMapScreenState();
}

class _PublicMapScreenState extends State<PublicMapScreen> {
  final MapController _controller = MapController();
  bool _centred = false;
  bool _mapReady = false;
  bool _showList = false;
  PlaceResult? _pendingFocus;
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = context.read<MapProvider>();
      if (provider.reports.isEmpty) provider.load();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _controller.dispose();
    super.dispose();
  }

  void _setShowList(bool value) {
    setState(() {
      _showList = value;
      if (!value) {
        // Re-entering the map: fit the viewport to the current reports again.
        _mapReady = false;
        _centred = false;
      }
    });
  }

  List<Marker> _markers(List<MapReport> reports, PlaceResult? origin) {
    return [
      for (final report in reports)
        Marker(
          point: LatLng(report.latitude, report.longitude),
          width: 26,
          height: 26,
          child: GestureDetector(
            onTap: () => _openSheet(report),
            child: MapStatusDot(color: repairColors(report.repairStatus).foreground),
          ),
        ),
      if (origin != null)
        Marker(
          point: LatLng(origin.latitude, origin.longitude),
          width: 28,
          height: 28,
          child: Tooltip(
            message: 'Searched location',
            child: const MapSearchPoint(),
          ),
        ),
    ];
  }

  void _fitToReports(List<MapReport> reports) {
    if (_centred || reports.isEmpty || !_mapReady) return;
    _centred = true;

    if (reports.length == 1) {
      _controller.move(LatLng(reports.first.latitude, reports.first.longitude), 15);
      return;
    }

    _controller.fitCamera(
      CameraFit.bounds(
        bounds: LatLngBounds.fromPoints([
          for (final report in reports) LatLng(report.latitude, report.longitude),
        ]),
        padding: const EdgeInsets.all(60),
        maxZoom: 15,
      ),
    );
  }

  /// Moves to the chosen search origin, switching out of list view if needed.
  void _focusOrigin(PlaceResult origin) {
    _pendingFocus = origin;
    if (_showList) {
      setState(() {
        _showList = false;
        _mapReady = false;
      });
    }
    _applyPendingFocus();
  }

  void _applyPendingFocus() {
    final origin = _pendingFocus;
    if (origin == null || !_mapReady) return;
    _pendingFocus = null;
    // Claim the viewport so the report auto-fit does not override the choice.
    _centred = true;
    _controller.move(LatLng(origin.latitude, origin.longitude), 15);
  }

  Future<void> _openSheet(MapReport report) async {
    final provider = context.read<MapProvider>();
    provider.selectReport(report.id);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ChangeNotifierProvider.value(value: provider, child: const _PublicReportSheet()),
    );
    provider.clearSelection();
  }

  Future<void> _runSearch() async {
    final provider = context.read<MapProvider>();
    FocusScope.of(context).unfocus();
    final query = _searchController.text.trim();
    if (query.length < 2) {
      _showSnack('Type at least 2 characters to search.');
      return;
    }

    await provider.searchPlace(query);
    if (!mounted) return;

    if (provider.placeResults.isNotEmpty) {
      await _promptPlaceChoice(provider.placeResults);
    } else if (provider.searchReason != null) {
      _showSnack(provider.searchReason!);
    }
  }

  Future<void> _promptPlaceChoice(List<PlaceResult> places) async {
    final provider = context.read<MapProvider>();
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => Container(
        decoration: const BoxDecoration(
          color: AppColors.sheetBackground,
          borderRadius: BorderRadius.only(topLeft: Radius.circular(28), topRight: Radius.circular(28)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 44,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.lightAzure,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text('Choose a location', style: AppTypography.headingStyle(size: 17)),
              const SizedBox(height: 10),
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: places.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (_, i) {
                    final place = places[i];
                    return InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () {
                        provider.selectPlace(place);
                        Navigator.of(sheetContext).pop();
                        _searchController.text = place.address;
                        _focusOrigin(place);
                      },
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.cardSurface,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: AppColors.lightAzure),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.place_rounded, size: 20, color: AppColors.darkBlue),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(place.address,
                                      style: AppTypography.bodyStyle(size: 13.5, weight: FontWeight.w600)),
                                  if (place.areaLabel != null && place.areaLabel!.isNotEmpty)
                                    Text(place.areaLabel!, style: AppTypography.caption(size: 11.5)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<MapProvider>();

    return Scaffold(
      backgroundColor: AppColors.sheetBackground,
      body: Column(
        children: [
          _Header(provider: provider, showList: _showList, onToggleView: _setShowList),
          _SearchPanel(controller: _searchController, provider: provider, onSubmit: _runSearch),
          Expanded(child: _buildBody(provider)),
        ],
      ),
    );
  }

  Widget _buildBody(MapProvider provider) {
    if (provider.isLoading && provider.reports.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: AppColors.darkBlue));
    }

    final reports = provider.visibleReports;

    if (_showList) {
      return _buildList(provider, reports);
    }

    // Re-fit once the reports arrive (the map may already be ready).
    WidgetsBinding.instance.addPostFrameCallback((_) => _fitToReports(reports));

    return Stack(
      children: [
        FlutterMap(
          mapController: _controller,
          options: MapOptions(
            initialCenter: const LatLng(14.7942, 120.8790),
            initialZoom: 12,
            minZoom: 3,
            maxZoom: 19,
            interactionOptions: const InteractionOptions(
              flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
            ),
            onMapReady: () {
              _mapReady = true;
              _applyPendingFocus();
              _fitToReports(reports);
            },
          ),
          children: [
            roadwatchTileLayer(),
            MarkerLayer(markers: _markers(reports, provider.origin)),
            roadwatchAttribution(),
          ],
        ),
        if (reports.isEmpty)
          const Positioned(
            left: 20,
            right: 20,
            top: 20,
            child: _InfoBanner(
              icon: Icons.info_outline_rounded,
              message: 'No approved reports to display yet.',
            ),
          ),
        Positioned(bottom: 16, left: 16, right: 16, child: _Legend()),
      ],
    );
  }

  Widget _buildList(MapProvider provider, List<MapReport> reports) {
    if (reports.isEmpty) {
      return EmptyState(
        icon: Icons.location_off_rounded,
        title: provider.origin != null
            ? 'No approved reports near this location'
            : (provider.textQuery.isNotEmpty ? 'No reports match your search' : 'No approved reports nearby'),
        message: provider.isShowingCache
            ? 'You are offline. Showing the last saved reports.'
            : 'Approved reports from your community will appear here.',
        action: OutlinedButton.icon(
          onPressed: () => provider.load(refresh: true),
          icon: const Icon(Icons.refresh_rounded, size: 18),
          label: const Text('Refresh'),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => provider.load(refresh: true),
      color: AppColors.darkBlue,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        itemCount: reports.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, i) => _MapReportTile(
          report: reports[i],
          distance: provider.distanceFor(reports[i]),
          onTap: () => _openSheet(reports[i]),
        ),
      ),
    );
  }
}

class _SearchPanel extends StatefulWidget {
  const _SearchPanel({required this.controller, required this.provider, required this.onSubmit});

  final TextEditingController controller;
  final MapProvider provider;
  final Future<void> Function() onSubmit;

  @override
  State<_SearchPanel> createState() => _SearchPanelState();
}

class _SearchPanelState extends State<_SearchPanel> {
  final FocusNode _focusNode = FocusNode();
  late final TextEditingController _localController;
  Timer? _debounceTimer;
  List<String> _recentSearches = [];
  bool _showRecent = false;

  @override
  void initState() {
    super.initState();
    _localController = widget.controller;
    _focusNode.addListener(_onFocusChange);
    _loadRecentSearches();
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _focusNode.removeListener(_onFocusChange);
    _focusNode.dispose();
    super.dispose();
  }

  void _onFocusChange() {
    if (_focusNode.hasFocus) {
      setState(() => _showRecent = true);
    } else {
      Future.delayed(const Duration(milliseconds: 200), () {
        if (mounted) setState(() => _showRecent = false);
      });
    }
  }

  Future<void> _loadRecentSearches() async {
    final recent = await RecentSearchesService.load();
    if (mounted) setState(() => _recentSearches = recent);
  }

  void _onTextChanged(String value) {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 400), () {
      if (value.trim().length >= 2) {
        widget.onSubmit();
      }
    });
  }

  void _onSubmitted(String value) {
    _debounceTimer?.cancel();
    if (value.trim().length >= 2) {
      widget.onSubmit();
    }
  }

  void _selectRecentSearch(String query) {
    _localController.text = query;
    _onSubmitted(query);
    _focusNode.unfocus();
  }

  Future<void> _removeRecentSearch(String query) async {
    await RecentSearchesService.remove(query);
    _loadRecentSearches();
  }

  Future<void> _clearAllRecent() async {
    await RecentSearchesService.clear();
    _loadRecentSearches();
  }

  @override
  Widget build(BuildContext context) {
    final origin = widget.provider.origin;
    final hasInput = _localController.text.isNotEmpty;
    final showClear = hasInput || widget.provider.hasSearch;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ValueListenableBuilder<TextEditingValue>(
            valueListenable: _localController,
            builder: (context, value, _) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextField(
                    controller: _localController,
                    focusNode: _focusNode,
                    textInputAction: TextInputAction.search,
                    onSubmitted: _onSubmitted,
                    onChanged: _onTextChanged,
                    decoration: InputDecoration(
                      hintText: 'Search an address or landmark',
                      prefixIcon: const Icon(Icons.search_rounded, color: AppColors.textMuted),
                      suffixIcon: widget.provider.isSearching
                          ? const Padding(
                              padding: EdgeInsets.all(14),
                              child: SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.darkBlue),
                              ),
                            )
                          : (showClear
                              ? IconButton(
                                  icon: const Icon(Icons.close_rounded),
                                  color: AppColors.textMuted,
                                  tooltip: 'Clear search',
                                  onPressed: () {
                                    _localController.clear();
                                    widget.provider.clearSearch();
                                  },
                                )
                              : (_recentSearches.isNotEmpty && _showRecent && !hasInput
                                  ? IconButton(
                                      icon: const Icon(Icons.history_rounded),
                                      color: AppColors.textMuted,
                                      tooltip: 'Recent searches',
                                      onPressed: () => setState(() => _showRecent = true),
                                    )
                                  : null)),
                      filled: true,
                      fillColor: AppColors.cardSurface,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: const BorderSide(color: AppColors.lightAzure),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: const BorderSide(color: AppColors.lightAzure),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: const BorderSide(color: AppColors.darkBlue, width: 1.4),
                      ),
                    ),
                  ),
                  if (_showRecent && !hasInput && _recentSearches.isNotEmpty)
                    _RecentSearchesList(
                      searches: _recentSearches,
                      onSelect: _selectRecentSearch,
                      onRemove: _removeRecentSearch,
                      onClearAll: _clearAllRecent,
                    ),
                ],
              );
            },
          ),
          if (origin != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                children: [
                  const Icon(Icons.near_me_rounded, size: 14, color: AppColors.darkBlue),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Nearest to ${origin.address}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.caption(size: 11.5, color: AppColors.textSecondary),
                    ),
                  ),
                ],
              ),
            )
          else if (widget.provider.textQuery.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'Matching reports for "${widget.provider.textQuery}" (local fallback).',
                style: AppTypography.caption(size: 11.5, color: AppColors.textSecondary),
              ),
            ),
          if (widget.provider.searchReason != null && !widget.provider.isSearching)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: _InfoBanner(
                icon: Icons.info_outline_rounded,
                message: '${widget.provider.searchReason!} Showing matching reports instead.',
              ),
            ),
        ],
      ),
    );
  }
}

class _RecentSearchesList extends StatelessWidget {
  const _RecentSearchesList({
    required this.searches,
    required this.onSelect,
    required this.onRemove,
    required this.onClearAll,
  });

  final List<String> searches;
  final void Function(String) onSelect;
  final void Function(String) onRemove;
  final VoidCallback onClearAll;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.lightAzure),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Row(
              children: [
                const Icon(Icons.history_rounded, size: 16, color: AppColors.textMuted),
                const SizedBox(width: 8),
                Text('Recent searches', style: AppTypography.caption(size: 12, color: AppColors.textSecondary)),
                const Spacer(),
                TextButton(
                  onPressed: onClearAll,
                  style: TextButton.styleFrom(
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(0, 0),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: Text('Clear all', style: AppTypography.caption(size: 12, color: AppColors.darkBlue)),
                ),
              ],
            ),
          ),
          ...searches.asMap().entries.map((entry) {
            final index = entry.key;
            final search = entry.value;
            return InkWell(
              onTap: () => onSelect(search),
              borderRadius: BorderRadius.only(
                topLeft: index == 0 ? const Radius.circular(16) : Radius.zero,
                topRight: index == 0 ? const Radius.circular(16) : Radius.zero,
                bottomLeft: index == searches.length - 1 ? const Radius.circular(16) : Radius.zero,
                bottomRight: index == searches.length - 1 ? const Radius.circular(16) : Radius.zero,
              ),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  border: Border(
                    top: index == 0 ? BorderSide.none : BorderSide(color: AppColors.lightAzure.withValues(alpha: 0.3)),
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.access_time_rounded, size: 18, color: AppColors.textMuted),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        search,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyStyle(size: 13.5, color: AppColors.textPrimary),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded, size: 18, color: AppColors.textMuted),
                      onPressed: () => onRemove(search),
                      tooltip: 'Remove from recent',
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.provider, required this.showList, required this.onToggleView});

  final MapProvider provider;
  final bool showList;
  final ValueChanged<bool> onToggleView;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.darkBlue,
        borderRadius: BorderRadius.only(bottomLeft: Radius.circular(28), bottomRight: Radius.circular(28)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 14, bottom: 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text('Public map', style: AppTypography.display(size: 24, color: AppColors.onPrimary)),
                  ),
                  _ViewToggle(showList: showList, onChanged: onToggleView),
                ],
              ),
            ),
            Text(
              '${provider.reports.length} approved · only approved reports are published here.',
              style: AppTypography.caption(size: 12, color: AppColors.lightBlue),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 34,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  _FilterChip(
                    label: 'All categories',
                    selected: provider.categoryFilter == null,
                    onTap: () => provider.setCategory(null),
                  ),
                  for (final category in IssueCategory.values) ...[
                    const SizedBox(width: 8),
                    _FilterChip(
                      label: category.label,
                      selected: provider.categoryFilter == category,
                      onTap: () => provider.setCategory(category),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Small Map / List switch shown in the header.
class _ViewToggle extends StatelessWidget {
  const _ViewToggle({required this.showList, required this.onChanged});

  final bool showList;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.lightBlue.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _segment(
            icon: Icons.map_rounded,
            label: 'Map',
            selected: !showList,
            onTap: () => onChanged(false),
          ),
          _segment(
            icon: Icons.list_rounded,
            label: 'List',
            selected: showList,
            onTap: () => onChanged(true),
          ),
        ],
      ),
    );
  }

  Widget _segment({
    required IconData icon,
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    final color = selected ? AppColors.darkBlue : AppColors.lightBlue;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: selected ? AppColors.lightBlue : Colors.transparent,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 4),
            Text(
              label,
              style: AppTypography.bodyStyle(
                size: 11.5,
                weight: FontWeight.w600,
                color: color,
                height: 1.1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? AppColors.lightBlue : AppColors.darkBlue,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: AppColors.lightBlue.withValues(alpha: selected ? 1 : 0.4)),
        ),
        child: Text(
          label,
          style: AppTypography.bodyStyle(
            size: 12,
            weight: FontWeight.w600,
            color: selected ? AppColors.darkBlue : AppColors.lightBlue,
            height: 1.1,
          ),
        ),
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  Widget dot(Color color, String label) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 5),
          Text(label, style: AppTypography.caption(size: 10.5, color: AppColors.textSecondary)),
        ],
      );

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.cardSurface.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.lightAzure),
      ),
      child: Wrap(
        spacing: 12,
        runSpacing: 6,
        children: [
          dot(AppColors.statusSlate, 'Not assigned'),
          dot(AppColors.statusBlue, 'Awaiting maintenance'),
          dot(AppColors.statusAmber, 'In progress'),
          dot(AppColors.statusGreen, 'Completed'),
        ],
      ),
    );
  }
}

class _InfoBanner extends StatelessWidget {
  const _InfoBanner({required this.icon, required this.message});

  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.lightYellow,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.lightAzure),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.darkBlue),
          const SizedBox(width: 10),
          Expanded(child: Text(message, style: AppTypography.caption(size: 12, color: AppColors.textSecondary))),
        ],
      ),
    );
  }
}

class _MapReportTile extends StatelessWidget {
  const _MapReportTile({required this.report, required this.onTap, this.distance});

  final MapReport report;
  final VoidCallback onTap;

  /// Distance from the chosen search origin, when one is set.
  final double? distance;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.cardSurface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.lightAzure),
          ),
          child: Row(
            children: [
              if (report.thumbnailUrl != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.network(report.thumbnailUrl!, width: 58, height: 58, fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => CategoryBadge(category: report.category, size: 58)),
                )
              else
                CategoryBadge(category: report.category, size: 58),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(report.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppTypography.headingStyle(size: 14.5)),
                    const SizedBox(height: 3),
                    Text(report.locationLabel, maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: AppTypography.caption(size: 11.5)),
                    if (distance != null) ...[
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          const Icon(Icons.near_me_rounded, size: 12, color: AppColors.textMuted),
                          const SizedBox(width: 4),
                          Text(formatDistance(distance!), style: AppTypography.caption(size: 11)),
                        ],
                      ),
                    ],
                    const SizedBox(height: 7),
                    Wrap(spacing: 6, children: [
                      StatusChip(repair: report.repairStatus, compact: true),
                      PriorityPill(priority: report.priority),
                    ]),
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

class _PublicReportSheet extends StatelessWidget {
  const _PublicReportSheet();

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<MapProvider>();
    final detail = provider.selectedDetail;

    return DraggableScrollableSheet(
      initialChildSize: 0.62,
      minChildSize: 0.35,
      maxChildSize: 0.92,
      expand: false,
      builder: (context, scrollController) => Container(
        decoration: const BoxDecoration(
          color: AppColors.sheetBackground,
          borderRadius: BorderRadius.only(topLeft: Radius.circular(28), topRight: Radius.circular(28)),
        ),
        child: provider.isLoadingDetail || detail == null
            ? const Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: CircularProgressIndicator(color: AppColors.darkBlue)),
              )
            : ListView(
                controller: scrollController,
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
                children: [
                  Center(
                    child: Container(
                      width: 44,
                      height: 4,
                      decoration: BoxDecoration(color: AppColors.lightAzure, borderRadius: BorderRadius.circular(4)),
                    ),
                  ),
                  const SizedBox(height: 18),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      CategoryBadge(category: detail.category, size: 48),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(detail.title, style: AppTypography.display(size: 20)),
                            const SizedBox(height: 3),
                            Text(detail.referenceNo, style: AppTypography.caption(size: 12)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    StatusChip(moderation: detail.moderationStatus),
                    StatusChip(repair: detail.repairStatus),
                    PriorityPill(priority: detail.priority),
                  ]),
                  const SizedBox(height: 16),
                  if (detail.photos.isNotEmpty)
                    SizedBox(
                      height: 108,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: detail.photos.length,
                        separatorBuilder: (_, _) => const SizedBox(width: 8),
                        itemBuilder: (context, i) => PhotoThumbnail(
                          photo: detail.photos[i],
                          width: 108,
                          height: 108,
                          radius: 14,
                          showKindBadge: true,
                          onTap: () => PhotoGalleryScreen.open(context, detail.photos, initialIndex: i),
                        ),
                      ),
                    ),
                  const SizedBox(height: 16),
                  Text('Description', style: AppTypography.headingStyle(size: 15)),
                  const SizedBox(height: 6),
                  Text(detail.description, style: AppTypography.bodyStyle(size: 13.5, color: AppColors.textSecondary)),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      const Icon(Icons.place_rounded, size: 17, color: AppColors.darkBlue),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(detail.locationLabel,
                            style: AppTypography.bodyStyle(size: 13, color: AppColors.textSecondary)),
                      ),
                    ],
                  ),
                  if (detail.completedAt != null) ...[
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        const Icon(Icons.check_circle_rounded, size: 17, color: AppColors.statusGreen),
                        const SizedBox(width: 8),
                        Text('Completed ${formatDate(detail.completedAt)}',
                            style: AppTypography.bodyStyle(size: 13, color: AppColors.textSecondary)),
                      ],
                    ),
                  ],
                  if (detail.completionNotes != null && detail.completionNotes!.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(color: AppColors.tintGreen, borderRadius: BorderRadius.circular(16)),
                      child: Text(detail.completionNotes!,
                          style: AppTypography.bodyStyle(size: 13, color: AppColors.textSecondary)),
                    ),
                  ],
                  const SizedBox(height: 20),
                  Text('Reported ${relativeTime(detail.createdAt)}', style: AppTypography.caption(size: 11.5)),
                ],
              ),
      ),
    );
  }
}
