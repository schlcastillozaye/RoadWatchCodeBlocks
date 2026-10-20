import '../core/api_client.dart';
import '../core/json.dart';
import '../models/models.dart';

class AuthSession {
  const AuthSession({
    required this.user,
    required this.accessToken,
    required this.refreshToken,
  });

  final AppUser user;
  final String accessToken;
  final String refreshToken;

  factory AuthSession.fromJson(Map<String, dynamic> json) => AuthSession(
    user: AppUser.fromJson(asMap(json['user'])),
    accessToken: asString(json['accessToken']),
    refreshToken: asString(json['refreshToken']),
  );
}

class GeocodeResult {
  const GeocodeResult({
    required this.available,
    this.address,
    this.areaLabel,
    this.reason,
  });

  final bool available;
  final String? address;
  final String? areaLabel;
  final String? reason;

  factory GeocodeResult.fromJson(Map<String, dynamic> json) => GeocodeResult(
    available: asBool(json['available']),
    address: asStringOrNull(json['address']),
    areaLabel: asStringOrNull(json['areaLabel']),
    reason: asStringOrNull(json['reason']),
  );
}

/// One resolved place from forward geocoding (address / landmark search).
class PlaceResult {
  const PlaceResult({
    required this.address,
    required this.latitude,
    required this.longitude,
    this.areaLabel,
  });

  final String address;
  final double latitude;
  final double longitude;
  final String? areaLabel;

  String get label {
    final area = areaLabel;
    return area == null || area.isEmpty ? address : '$address · $area';
  }

  factory PlaceResult.fromJson(Map<String, dynamic> json) => PlaceResult(
    address: asString(json['address']),
    latitude: asDouble(json['lat']),
    longitude: asDouble(json['lng']),
    areaLabel: asStringOrNull(json['areaLabel']),
  );
}

/// Response from the optional forward-geocoding endpoint. When [available] is
/// false the caller degrades to filtering reports by text.
class PlaceSearchResult {
  const PlaceSearchResult({
    required this.available,
    required this.results,
    this.reason,
  });

  final bool available;
  final List<PlaceResult> results;
  final String? reason;

  factory PlaceSearchResult.fromJson(Map<String, dynamic> json) =>
      PlaceSearchResult(
        available: asBool(json['available']),
        results: asList(json['results'])
            .map((e) => PlaceResult.fromJson(asMap(e)))
            .toList(),
        reason: asStringOrNull(json['reason']),
      );
}

/// Single entry point to the RoadWatch backend, shared by all providers.
class RoadWatchApi {
  RoadWatchApi(this.client);

  final ApiClient client;

  // ------------------------------------------------------------------ auth

  Future<AuthSession> register({
    required String fullName,
    required String email,
    required String password,
    String? phone,
  }) async {
    final json = await client.postJson(
      '/api/auth/register',
      body: {
        'fullName': fullName,
        'email': email,
        'password': password,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
      },
      auth: false,
    );
    return AuthSession.fromJson(asMap(json));
  }

  Future<AuthSession> login({
    required String email,
    required String password,
  }) async {
    final json = await client.postJson(
      '/api/auth/login',
      body: {'email': email, 'password': password},
      auth: false,
    );
    return AuthSession.fromJson(asMap(json));
  }

  Future<AuthSession> refresh(String refreshToken) async {
    final json = await client.postJson(
      '/api/auth/refresh',
      body: {'refreshToken': refreshToken},
      auth: false,
    );
    return AuthSession.fromJson(asMap(json));
  }

  Future<void> logout(String refreshToken) async {
    await client.postJson(
      '/api/auth/logout',
      body: {'refreshToken': refreshToken},
      auth: false,
    );
  }

  Future<AppUser> me() async {
    final json = await client.getJson('/api/auth/me');
    return AppUser.fromJson(asMap(asMap(json)['user']));
  }

  // --------------------------------------------------------------- reports

  Future<RoadReport> createReport({
    required String title,
    required String description,
    required IssueCategory category,
    String? categoryOther,
    required double latitude,
    required double longitude,
    String? addressText,
    String? areaLabel,
    Priority? priority,
    required List<UploadFile> photos,
    ProgressCallback? onProgress,
  }) async {
    final json = await client.postMultipart(
      '/api/reports',
      fields: {
        'title': title,
        'description': description,
        'category': category.api,
        // Only "Other" carries a free-text description; the API rejects a stray
        // value for any other category, so the client never sends one.
        if (category == IssueCategory.other &&
            categoryOther != null &&
            categoryOther.isNotEmpty)
          'categoryOther': categoryOther,
        'latitude': latitude.toString(),
        'longitude': longitude.toString(),
        if (addressText != null && addressText.isNotEmpty)
          'addressText': addressText,
        if (areaLabel != null && areaLabel.isNotEmpty) 'areaLabel': areaLabel,
        if (priority != null) 'priority': priority.api,
      },
      files: photos,
      onProgress: onProgress,
    );
    return RoadReport.fromJson(asMap(asMap(json)['report']));
  }

  Future<Paginated<RoadReport>> myReports({
    int page = 1,
    int pageSize = 20,
    ModerationStatus? moderationStatus,
    RepairStatus? repairStatus,
    String? search,
  }) async {
    final json = await client.getJson(
      '/api/reports/mine',
      query: {
        'page': page,
        'pageSize': pageSize,
        if (moderationStatus != null) 'moderationStatus': moderationStatus.api,
        if (repairStatus != null) 'repairStatus': repairStatus.api,
        if (search != null && search.isNotEmpty) 'search': search,
      },
    );
    return Paginated<RoadReport>.fromJson(asMap(json), RoadReport.fromJson);
  }

  Future<Map<String, int>> myReportSummary() async {
    final results = await Future.wait([
      myReports(pageSize: 1),
      myReports(pageSize: 1, moderationStatus: ModerationStatus.pendingReview),
      myReports(pageSize: 1, repairStatus: RepairStatus.awaitingMaintenance),
      myReports(pageSize: 1, repairStatus: RepairStatus.inProgress),
      myReports(pageSize: 1, repairStatus: RepairStatus.awaitingVerification),
      myReports(pageSize: 1, repairStatus: RepairStatus.returnedForWork),
      myReports(pageSize: 1, repairStatus: RepairStatus.completed),
      myReports(pageSize: 1, repairStatus: RepairStatus.verifiedCompleted),
    ]);
    return {
      'total': results[0].total,
      'pending': results[1].total,
      'inRepair':
          results[2].total +
          results[3].total +
          results[4].total +
          results[5].total,
      'completed': results[6].total + results[7].total,
    };
  }

  Future<RoadReport> getReport(String id) async {
    final json = await client.getJson('/api/reports/$id');
    return RoadReport.fromJson(asMap(asMap(json)['report']));
  }

  Future<List<StatusHistoryEntry>> getHistory(String id) async {
    final json = await client.getJson('/api/reports/$id/history');
    return asList(asMap(json)['history'])
        .map((e) => StatusHistoryEntry.fromJson(asMap(e)))
        .toList();
  }

  Future<void> deleteReport(String id) => client.deleteJson('/api/reports/$id');

  // --------------------------------------------------------- staff workflows

  Future<Paginated<RoadReport>> staffReports({
    int page = 1,
    int pageSize = 20,
    ModerationStatus? moderationStatus,
    RepairStatus? repairStatus,
  }) async {
    final json = await client.getJson(
      '/api/reports',
      query: {
        'page': page,
        'pageSize': pageSize,
        if (moderationStatus != null) 'moderationStatus': moderationStatus.api,
        if (repairStatus != null) 'repairStatus': repairStatus.api,
      },
    );
    return Paginated<RoadReport>.fromJson(asMap(json), RoadReport.fromJson);
  }

  Future<Paginated<RoadReport>> maintenanceAssignments({
    int page = 1,
    int pageSize = 50,
  }) async {
    final json = await client.getJson(
      '/api/maintenance/assignments',
      query: {'page': page, 'pageSize': pageSize},
    );
    return Paginated<RoadReport>.fromJson(asMap(json), RoadReport.fromJson);
  }

  Future<Map<String, int>> maintenanceSummary() async {
    final json = asMap(await client.getJson('/api/maintenance/summary'));
    return {
      'assigned': asInt(json['assigned']),
      'awaiting': asInt(json['awaiting']),
      'inProgress': asInt(json['inProgress']),
      'completed': asInt(json['completed']),
    };
  }

  Future<List<MaintenanceNotification>> maintenanceNotifications({
    int limit = 50,
  }) async {
    final json = asMap(
      await client.getJson('/api/notifications', query: {'limit': limit}),
    );
    return asList(json['items'])
        .map((item) => MaintenanceNotification.fromJson(asMap(item)))
        .toList();
  }

  Future<void> markNotificationRead(String id) async {
    await client.patchJson(
      '/api/notifications/${Uri.encodeComponent(id)}/read',
    );
  }

  Future<void> markAllNotificationsRead() async {
    await client.patchJson('/api/notifications/read-all');
  }

  Future<List<Map<String, dynamic>>> maintenanceOfficers() async {
    final json = asMap(await client.getJson('/api/users/officers'));
    return asList(json['officers']).map(asMap).toList();
  }

  Future<RoadReport> moderateReport(
    String id, {
    required String decision,
    String? reason,
  }) async {
    final json = await client.patchJson(
      '/api/reports/$id/moderation',
      body: {
        'decision': decision,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      },
    );
    return RoadReport.fromJson(asMap(asMap(json)['report']));
  }

  Future<RoadReport> assignReport(
    String id, {
    required String officerId,
    String? note,
  }) async {
    final json = await client.postJson(
      '/api/reports/$id/assign',
      body: {
        'officerId': officerId,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      },
    );
    return RoadReport.fromJson(asMap(asMap(json)['report']));
  }

  Future<RoadReport> updateRepair(
    String id, {
    required RepairStatus status,
    String? completionNotes,
  }) async {
    final json = await client.patchJson(
      '/api/reports/$id/repair',
      body: {'repairStatus': status.api, 'completionNotes': ?completionNotes},
    );
    return RoadReport.fromJson(asMap(asMap(json)['report']));
  }

  Future<RoadReport> verifyRepair(
    String id, {
    required String decision,
    String? reason,
  }) async {
    final json = await client.patchJson(
      '/api/reports/$id/verification',
      body: {
        'decision': decision,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      },
    );
    return RoadReport.fromJson(asMap(asMap(json)['report']));
  }

  Future<RoadReport> addReportPhotos(
    String id, {
    required PhotoKind kind,
    required List<UploadFile> photos,
  }) async {
    final json = await client.postMultipart(
      '/api/reports/$id/photos',
      fields: {'kind': kind.api},
      files: photos
          .map(
            (photo) => UploadFile(
              field: kind == PhotoKind.after ? 'afterPhotos' : 'progressPhotos',
              path: photo.path,
              bytes: photo.bytes,
              filename: photo.filename,
            ),
          )
          .toList(),
    );
    return RoadReport.fromJson(asMap(asMap(json)['report']));
  }

  // ------------------------------------------------------------------- map

  Future<Paginated<MapReport>> publicReports({
    int page = 1,
    int pageSize = 100,
    IssueCategory? category,
    RepairStatus? repairStatus,
    String? search,
    DateTime? from,
    DateTime? to,
    String? areaLabel,
    String sort = 'newest',
  }) async {
    final json = await client.getJson(
      '/api/map/reports',
      query: {
        'page': page,
        'pageSize': pageSize,
        'sort': sort,
        if (category != null) 'category': category.api,
        if (repairStatus != null) 'repairStatus': repairStatus.api,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
        if (areaLabel != null && areaLabel.isNotEmpty) 'areaLabel': areaLabel,
        if (from != null) 'from': from.toIso8601String(),
        if (to != null) 'to': to.toIso8601String(),
      },
    );
    return Paginated<MapReport>.fromJson(asMap(json), MapReport.fromJson);
  }

  Future<RoadReport> publicReportDetail(String id) async {
    final json = await client.getJson('/api/map/reports/$id');
    return RoadReport.fromJson(asMap(asMap(json)['report']));
  }

  Future<GeocodeResult> reverseGeocode({
    required double latitude,
    required double longitude,
  }) async {
    final json = await client.getJson(
      '/api/map/geocode/reverse',
      query: {'lat': latitude, 'lng': longitude},
      auth: false,
    );
    return GeocodeResult.fromJson(asMap(json));
  }

  /// Forward geocoding (place / address search). Optional: returns
  /// `available: false` with a reason when geocoding is not configured.
  Future<PlaceSearchResult> searchPlace(String query) async {
    final json = await client.getJson(
      '/api/map/geocode/search',
      query: {'q': query},
      auth: false,
    );
    return PlaceSearchResult.fromJson(asMap(json));
  }

  // --------------------------------------------------------------- helpers

  /// Headers for authenticated image loading (approved photos are public).
  Future<Map<String, String>> imageHeaders({required bool isPublic}) async {
    if (isPublic) return const {};
    final token = await client.tokens.readAccessToken();
    return token == null ? const {} : {'Authorization': 'Bearer $token'};
  }
}
