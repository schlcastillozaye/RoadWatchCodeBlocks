import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:roadwatch/core/api_client.dart';
import 'package:roadwatch/core/api_exception.dart';
import 'package:roadwatch/core/app_config.dart';
import 'package:roadwatch/core/token_store.dart';

/// Unit coverage for the mobile API layer: URL resolution, bearer auth,
/// error-envelope parsing and the single refresh-and-retry on 401.
/// These run fully offline (no backend required).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('AppConfig.absoluteUrl', () {
    tearDown(() => debugDefaultTargetPlatformOverride = null);

    test('leaves absolute URLs untouched', () {
      expect(AppConfig.absoluteUrl('https://api.example.com/x'), 'https://api.example.com/x');
      expect(AppConfig.absoluteUrl('http://api.example.com/x'), 'http://api.example.com/x');
    });

    test('prefixes relative URLs with the API base (Android maps localhost)', () {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      expect(
        AppConfig.absoluteUrl('/api/files/by-key/a.png'),
        'http://10.0.2.2:4000/api/files/by-key/a.png',
      );
    });

    test('maps localhost to 10.0.2.2 only on Android', () {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      expect(AppConfig.apiBaseUrl, 'http://10.0.2.2:4000');

      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      expect(AppConfig.apiBaseUrl, 'http://localhost:4000');
    });
  });

  group('AppConfig.resolveApiBaseUrl (release guard)', () {
    test('rejects a release build left on the localhost default', () {
      expect(
        () => AppConfig.resolveApiBaseUrl('http://localhost:4000', release: true, android: false),
        throwsA(isA<FlutterError>()),
      );
      expect(
        () => AppConfig.resolveApiBaseUrl('http://127.0.0.1:4000', release: true, android: false),
        throwsA(isA<FlutterError>()),
      );
    });

    test('accepts a public HTTPS origin in a release build', () {
      expect(
        AppConfig.resolveApiBaseUrl('https://api.example.com', release: true, android: false),
        'https://api.example.com',
      );
    });

    test('rewrites localhost to 10.0.2.2 only for Android debug runs', () {
      expect(
        AppConfig.resolveApiBaseUrl('http://localhost:4000', release: false, android: true),
        'http://10.0.2.2:4000',
      );
      expect(
        AppConfig.resolveApiBaseUrl('http://localhost:4000', release: false, android: false),
        'http://localhost:4000',
      );
    });
  });

  group('ApiClient', () {
    test('sends a bearer token when one is stored', () async {
      String? seenAuth;
      final mock = MockClient((req) async {
        seenAuth = req.headers['Authorization'];
        return http.Response(
          jsonEncode({'user': {'id': 'u1'}}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final tokens = TokenStore();
      await tokens.saveTokens(accessToken: 'TESTTOKEN', refreshToken: 'REFRESH');

      final api = ApiClient(tokenStore: tokens, httpClient: mock, baseUrl: 'http://example.test');
      await api.getJson('/api/auth/me');

      expect(seenAuth, 'Bearer TESTTOKEN');
    });

    test('parses the error envelope into an ApiException', () async {
      final mock = MockClient((req) async => http.Response(
            jsonEncode({'error': {'code': 'NOT_FOUND', 'message': 'Report not found.'}}),
            404,
            headers: {'content-type': 'application/json'},
          ));

      final api = ApiClient(tokenStore: TokenStore(), httpClient: mock, baseUrl: 'http://example.test');

      await expectLater(
        api.getJson('/api/reports/x'),
        throwsA(
          isA<ApiException>()
              .having((e) => e.code, 'code', 'NOT_FOUND')
              .having((e) => e.statusCode, 'statusCode', 404)
              .having((e) => e.message, 'message', 'Report not found.'),
        ),
      );
    });

    test('refreshes once on 401 and retries the request', () async {
      var calls = 0;
      var refreshCalls = 0;

      final mock = MockClient((req) async {
        calls++;
        if (calls == 1) {
          return http.Response(
            jsonEncode({'error': {'code': 'UNAUTHORIZED', 'message': 'expired'}}),
            401,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          jsonEncode({'ok': true}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final api = ApiClient(tokenStore: TokenStore(), httpClient: mock, baseUrl: 'http://example.test');
      api.onUnauthorized = () async {
        refreshCalls++;
        return true;
      };

      final res = await api.getJson('/api/auth/me');

      expect(refreshCalls, 1, reason: 'refresh attempted exactly once');
      expect(calls, 2, reason: 'original call + one retry');
      expect((res as Map)['ok'], true);
    });

    test('does not retry when refresh fails', () async {
      var calls = 0;
      final mock = MockClient((req) async {
        calls++;
        return http.Response(
          jsonEncode({'error': {'code': 'UNAUTHORIZED', 'message': 'expired'}}),
          401,
          headers: {'content-type': 'application/json'},
        );
      });

      final api = ApiClient(tokenStore: TokenStore(), httpClient: mock, baseUrl: 'http://example.test');
      api.onUnauthorized = () async => false;

      await expectLater(api.getJson('/api/auth/me'), throwsA(isA<ApiException>()));
      expect(calls, 1, reason: 'no retry after a failed refresh');
    });

    test('surfaces transport failures as a network error', () async {
      final mock = MockClient((req) async => throw Exception('connection refused'));
      final api = ApiClient(tokenStore: TokenStore(), httpClient: mock, baseUrl: 'http://example.test');

      await expectLater(
        api.getJson('/health'),
        throwsA(isA<ApiException>().having((e) => e.isNetworkError, 'isNetworkError', true)),
      );
    });
  });
}
