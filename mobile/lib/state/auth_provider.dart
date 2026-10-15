import 'package:flutter/foundation.dart';

import '../core/api_exception.dart';
import '../models/models.dart';
import '../services/roadwatch_api.dart';

/// Owns the authentication session: bootstrap, login, register, logout,
/// token persistence and silent refresh.
class AuthProvider extends ChangeNotifier {
  AuthProvider(this._api) {
    _api.client.onUnauthorized = _tryRefresh;
  }

  final RoadWatchApi _api;

  AppUser? _user;
  bool _initializing = true;
  bool _busy = false;

  AppUser? get user => _user;
  bool get isAuthenticated => _user != null;
  bool get isInitializing => _initializing;
  bool get isBusy => _busy;

  Future<void> bootstrap() async {
    _initializing = true;
    notifyListeners();

    final access = await _api.client.tokens.readAccessToken();
    if (access == null) {
      _user = null;
      _initializing = false;
      notifyListeners();
      return;
    }

    try {
      _user = await _api.me();
    } catch (error) {
      final refreshed = await _tryRefresh();
      if (refreshed) {
        try {
          _user = await _api.me();
        } catch (inner) {
          _user = await _recoverOrClear(inner);
        }
      } else {
        _user = await _recoverOrClear(error);
      }
    }

    _initializing = false;
    notifyListeners();
  }

  /// Keeps the signed-in user available offline: when the server cannot be
  /// reached we restore the cached profile so a cold start without connectivity
  /// still shows their reports. A definitive auth failure clears the session.
  Future<AppUser?> _recoverOrClear(Object error) async {
    final offline = error is ApiException && (error.isNetworkError || error.code == 'TIMEOUT');
    if (offline) {
      final cached = await _api.client.tokens.readUserJson();
      if (cached != null) return AppUser.fromJson(cached);
    }
    await _clearSession();
    return null;
  }

  Future<void> login({required String email, required String password}) async {
    _setBusy(true);
    try {
      final session = await _api.login(email: email, password: password);
      await _persist(session);
    } finally {
      _setBusy(false);
    }
  }

  Future<void> register({
    required String fullName,
    required String email,
    required String password,
    String? phone,
  }) async {
    _setBusy(true);
    try {
      final session = await _api.register(
        fullName: fullName,
        email: email,
        password: password,
        phone: phone,
      );
      await _persist(session);
    } finally {
      _setBusy(false);
    }
  }

  Future<void> logout() async {
    final refreshToken = await _api.client.tokens.readRefreshToken();
    if (refreshToken != null) {
      try {
        await _api.logout(refreshToken);
      } on ApiException {
        // Best-effort: still clear locally even if the server is unreachable.
      }
    }
    await _clearSession();
    notifyListeners();
  }

  Future<bool> _tryRefresh() async {
    final refreshToken = await _api.client.tokens.readRefreshToken();
    if (refreshToken == null) return false;
    try {
      final session = await _api.refresh(refreshToken);
      await _persist(session);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _persist(AuthSession session) async {
    await _api.client.tokens.saveTokens(
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    );
    await _api.client.tokens.saveUserJson(session.user.toJson());
    _user = session.user;
    notifyListeners();
  }

  Future<void> _clearSession() async {
    await _api.client.tokens.clear();
    _user = null;
  }

  void _setBusy(bool value) {
    _busy = value;
    notifyListeners();
  }
}
