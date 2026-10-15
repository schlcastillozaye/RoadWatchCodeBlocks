import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'session_tokens.dart';

/// Persists auth tokens in the platform secure storage (Keychain / Keystore).
/// Falls back to an in-memory map when secure storage is unavailable
/// (e.g. some desktop/web environments) so the app keeps working.
class TokenStore {
  TokenStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _accessKey = 'rw_access_token';
  static const _refreshKey = 'rw_refresh_token';
  static const _userKey = 'rw_cached_user';

  String? _memoryAccess;
  String? _memoryRefresh;

  Future<void> saveTokens({required String accessToken, required String refreshToken}) async {
    _memoryAccess = accessToken;
    _memoryRefresh = refreshToken;
    SessionTokens.accessToken = accessToken;
    try {
      await _storage.write(key: _accessKey, value: accessToken);
      await _storage.write(key: _refreshKey, value: refreshToken);
    } catch (_) {
      // Secure storage unavailable — memory fallback keeps the session alive.
    }
  }

  Future<String?> readAccessToken() async {
    if (_memoryAccess != null) return _memoryAccess;
    try {
      _memoryAccess = await _storage.read(key: _accessKey);
      SessionTokens.accessToken = _memoryAccess;
    } catch (_) {}
    return _memoryAccess;
  }

  Future<String?> readRefreshToken() async {
    if (_memoryRefresh != null) return _memoryRefresh;
    try {
      _memoryRefresh = await _storage.read(key: _refreshKey);
    } catch (_) {}
    return _memoryRefresh;
  }

  Future<void> saveUserJson(Map<String, dynamic> user) async {
    try {
      await _storage.write(key: _userKey, value: jsonEncode(user));
    } catch (_) {}
  }

  Future<Map<String, dynamic>?> readUserJson() async {
    try {
      final raw = await _storage.read(key: _userKey);
      if (raw == null) return null;
      final decoded = jsonDecode(raw);
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (_) {
      return null;
    }
  }

  Future<void> clear() async {
    _memoryAccess = null;
    _memoryRefresh = null;
    SessionTokens.accessToken = null;
    try {
      await _storage.delete(key: _accessKey);
      await _storage.delete(key: _refreshKey);
      await _storage.delete(key: _userKey);
    } catch (_) {}
  }
}
