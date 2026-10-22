import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api_client.dart';
import '../core/api_exception.dart';
import '../models/models.dart';
import '../services/roadwatch_api.dart';

/// Citizen's own reports, with offline caching so submitted reports remain
/// viewable after closing and reopening the app.
class MyReportsProvider extends ChangeNotifier {
  MyReportsProvider(this._api);

  final RoadWatchApi _api;

  static const _cacheKey = 'rw_cache_my_reports';

  final List<RoadReport> _reports = [];
  bool _loading = false;
  bool _loadingMore = false;
  String? _error;
  int _page = 1;
  int _totalPages = 1;
  int _total = 0;
  bool _fromCache = false;
  int _loadGeneration = 0;

  ModerationStatus? _filterModeration;
  RepairStatus? _filterRepair;
  String _search = '';

  List<RoadReport> get reports => List.unmodifiable(_reports);
  bool get isLoading => _loading;
  bool get isLoadingMore => _loadingMore;
  String? get error => _error;
  int get total => _total;
  bool get hasMore => _page < _totalPages;
  bool get isShowingCache => _fromCache;
  ModerationStatus? get filterModeration => _filterModeration;
  RepairStatus? get filterRepair => _filterRepair;
  String get search => _search;

  Future<void> load({bool refresh = false}) async {
    final generation = ++_loadGeneration;
    _loading = true;
    _loadingMore = false;
    _error = null;
    if (refresh) {
      _page = 1;
      _reports.clear();
    }
    notifyListeners();

    try {
      final result = await _api.myReports(
        page: 1,
        pageSize: 20,
        moderationStatus: _filterModeration,
        repairStatus: _filterRepair,
        search: _search.isEmpty ? null : _search,
      );
      if (generation != _loadGeneration) return;
      _reports
        ..clear()
        ..addAll(result.items);
      _page = result.page;
      _totalPages = result.totalPages;
      _total = result.total;
      _fromCache = false;
      await _writeCache();
    } on ApiException catch (e) {
      if (generation != _loadGeneration) return;
      _error = e.message;
      if (_reports.isEmpty) await _readCache();
    } catch (_) {
      if (generation != _loadGeneration) return;
      _error = 'Something went wrong loading your reports.';
      if (_reports.isEmpty) await _readCache();
    } finally {
      if (generation == _loadGeneration) {
        _loading = false;
        notifyListeners();
      }
    }
  }

  Future<void> loadMore() async {
    if (_loading || _loadingMore || !hasMore || _fromCache) return;
    final generation = _loadGeneration;
    _loadingMore = true;
    notifyListeners();
    try {
      final result = await _api.myReports(
        page: _page + 1,
        pageSize: 20,
        moderationStatus: _filterModeration,
        repairStatus: _filterRepair,
        search: _search.isEmpty ? null : _search,
      );
      if (generation != _loadGeneration) return;
      _reports.addAll(result.items);
      _page = result.page;
      _totalPages = result.totalPages;
      _total = result.total;
    } catch (_) {
      // Silent: pull-to-refresh can retry.
    } finally {
      if (generation == _loadGeneration) {
        _loadingMore = false;
        notifyListeners();
      }
    }
  }

  void setModerationFilter(ModerationStatus? status) {
    _filterModeration = status;
    load(refresh: true);
  }

  void setRepairFilter(RepairStatus? status) {
    _filterRepair = status;
    load(refresh: true);
  }

  void setSearch(String value) {
    final query = value.trim();
    _search = query;
    load(refresh: true);
  }

  void cancelPendingSearch() {
    if (!_loading && !_loadingMore) return;
    _loadGeneration++;
    _loading = false;
    _loadingMore = false;
    notifyListeners();
  }

  Future<RoadReport> submit({
    required String title,
    required String description,
    required IssueCategory category,
    String? categoryOther,
    required double latitude,
    required double longitude,
    String? addressText,
    String? areaLabel,
    String? destination,
    String? damageCause,
    List<String> relatedCategories = const [],
    String? surfaceCondition,
    Priority? priority,
    required List<UploadFile> photos,
    void Function(int sent, int total)? onProgress,
  }) async {
    final report = await _api.createReport(
      title: title,
      description: description,
      category: category,
      categoryOther: categoryOther,
      latitude: latitude,
      longitude: longitude,
      addressText: addressText,
      areaLabel: areaLabel,
      destination: destination,
      damageCause: damageCause,
      relatedCategories: relatedCategories,
      surfaceCondition: surfaceCondition,
      priority: priority,
      photos: photos,
      onProgress: onProgress,
    );
    _reports.insert(0, report);
    _total += 1;
    await _writeCache();
    notifyListeners();
    return report;
  }

  Future<void> delete(String id) async {
    await _api.deleteReport(id);
    _reports.removeWhere((r) => r.id == id);
    _total = (_total - 1).clamp(0, 1 << 31);
    await _writeCache();
    notifyListeners();
  }

  void replaceReport(RoadReport report) {
    final index = _reports.indexWhere((r) => r.id == report.id);
    if (index >= 0) {
      _reports[index] = report;
      notifyListeners();
    }
  }

  Future<void> _writeCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _cacheKey,
        jsonEncode(_reports.map((r) => r.toJson()).toList()),
      );
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
        ..addAll(
          decoded.whereType<Map>().map(
            (e) => RoadReport.fromJson(e.cast<String, dynamic>()),
          ),
        );
      _fromCache = _reports.isNotEmpty;
    } catch (_) {}
  }
}
