import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api_exception.dart';
import '../core/format.dart';
import '../models/models.dart';
import '../services/recent_searches.dart';
import '../services/roadwatch_api.dart';

/// Public map feed (approved reports only) with filters and offline caching.
class MapProvider extends ChangeNotifier {
  MapProvider(this._api);

  final RoadWatchApi _api;
  static const _cacheKey = 'rw_cache_map_reports';

  final List<MapReport> _reports = [];
  bool _loading = false;
  String? _error;
  bool _fromCache = false;

  IssueCategory? _category;
  RepairStatus? _repairStatus;

  List<MapReport> get reports => List.unmodifiable(_reports);
  bool get isLoading => _loading;
  String? get error => _error;
  bool get isShowingCache => _fromCache;
  IssueCategory? get categoryFilter => _category;
  RepairStatus? get repairFilter => _repairStatus;

  RoadReport? _selected;
  RoadReport? get selectedDetail => _selected;
  bool _loadingDetail = false;
  bool get isLoadingDetail => _loadingDetail;

  // ---- Place / address search ---------------------------------------------

  PlaceResult? _origin;
  List<PlaceResult> _placeResults = const [];
  bool _searching = false;
  String? _searchReason;
  String _textQuery = '';

  /// The chosen search origin (address the reports are sorted around).
  PlaceResult? get origin => _origin;

  /// Candidate places returned by the last search, awaiting a choice.
  List<PlaceResult> get placeResults => List.unmodifiable(_placeResults);

  bool get isSearching => _searching;

  /// Why address search could not resolve (shown to the user) — null when fine.
  String? get searchReason => _searchReason;

  /// Text used as a fallback filter when geocoding is unavailable.
  String get textQuery => _textQuery;

  bool get hasSearch =>
      _origin != null || _textQuery.isNotEmpty || _placeResults.isNotEmpty || _searchReason != null;

  /// Reports in display order: nearest-first when an address was chosen,
  /// otherwise the backend's default order.
  List<MapReport> get visibleReports {
    final origin = _origin;
    if (origin == null) return reports;
    final sorted = [..._reports];
    sorted.sort(
      (a, b) =>
          distanceKm(origin.latitude, origin.longitude, a.latitude, a.longitude)
              .compareTo(distanceKm(origin.latitude, origin.longitude, b.latitude, b.longitude)),
    );
    return sorted;
  }

  /// Distance from the chosen origin to a report, or null when no origin is set.
  double? distanceFor(MapReport report) {
    final origin = _origin;
    if (origin == null) return null;
    return distanceKm(origin.latitude, origin.longitude, report.latitude, report.longitude);
  }

  /// Looks up a place by address/landmark. Falls back to filtering reports by
  /// text when geocoding is unavailable, so the feature never dead-ends.
  Future<void> searchPlace(String query) async {
    final q = query.trim();
    if (q.length < 2) {
      _searchReason = 'Type at least 2 characters to search.';
      notifyListeners();
      return;
    }

    _searching = true;
    _searchReason = null;
    _placeResults = const [];
    notifyListeners();

    try {
      final result = await _api.searchPlace(q);
      if (result.available && result.results.isNotEmpty) {
        _placeResults = result.results;
        // Save successful search to recent searches
        await RecentSearchesService.add(q);
      } else {
        _searchReason = result.reason ?? 'No matching place was found.';
        _origin = null;
        _textQuery = q;
        await load(refresh: true);
      }
    } catch (_) {
      _searchReason = 'Address search is unavailable right now.';
      _origin = null;
      _textQuery = q;
      await load(refresh: true);
    } finally {
      _searching = false;
      notifyListeners();
    }
  }

  /// Chooses one of the [placeResults] as the origin to sort reports around.
  void selectPlace(PlaceResult place) {
    _origin = place;
    _placeResults = const [];
    _searchReason = null;
    _textQuery = '';
    notifyListeners();
  }

  void dismissPlaceResults() {
    _placeResults = const [];
    notifyListeners();
  }

  void clearSearch() {
    final hadTextQuery = _textQuery.isNotEmpty;
    _origin = null;
    _placeResults = const [];
    _searchReason = null;
    _textQuery = '';
    notifyListeners();
    if (hadTextQuery) load(refresh: true);
  }

  Future<void> load({bool refresh = false}) async {
    if (_loading) return;
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      final result = await _api.publicReports(
        pageSize: 100,
        category: _category,
        repairStatus: _repairStatus,
        search: _textQuery.isEmpty ? null : _textQuery,
      );
      _reports
        ..clear()
        ..addAll(result.items);
      _fromCache = false;
      if (_textQuery.isEmpty) await _writeCache();
    } on ApiException catch (e) {
      _error = e.message;
      if (_reports.isEmpty) await _readCache();
    } catch (_) {
      _error = 'Could not load the map. Pull to retry.';
      if (_reports.isEmpty) await _readCache();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  void setCategory(IssueCategory? category) {
    _category = category;
    load(refresh: true);
  }

  void setRepairStatus(RepairStatus? status) {
    _repairStatus = status;
    load(refresh: true);
  }

  Future<void> selectReport(String id) async {
    _loadingDetail = true;
    _selected = null;
    notifyListeners();
    try {
      _selected = await _api.publicReportDetail(id);
    } catch (_) {
      _selected = null;
    } finally {
      _loadingDetail = false;
      notifyListeners();
    }
  }

  void clearSelection() {
    _selected = null;
    notifyListeners();
  }

  Future<void> _writeCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final data = _reports
          .map((r) => {
                'id': r.id,
                'referenceNo': r.referenceNo,
                'title': r.title,
                'category': r.category.api,
                'priority': r.priority.api,
                'latitude': r.latitude,
                'longitude': r.longitude,
                'repairStatus': r.repairStatus.api,
                'addressText': r.addressText,
                'areaLabel': r.areaLabel,
                'thumbnailUrl': r.thumbnailUrl,
                'createdAt': r.createdAt?.toIso8601String(),
                'updatedAt': r.updatedAt?.toIso8601String(),
              })
          .toList();
      await prefs.setString(_cacheKey, jsonEncode(data));
    } catch (_) {}
  }

  Future<void> _readCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_cacheKey);
      if (raw == null) return;
      final decoded = jsonDecode(raw);
      if (decoded is! List) return;
      _reports
        ..clear()
        ..addAll(decoded.whereType<Map>().map((e) => MapReport.fromJson(e.cast<String, dynamic>())));
      _fromCache = _reports.isNotEmpty;
    } catch (_) {}
  }
}
