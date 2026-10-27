import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import 'package:roadwatch/core/api_client.dart';
import 'package:roadwatch/core/token_store.dart';
import 'package:roadwatch/screens/auth/login_screen.dart';
import 'package:roadwatch/screens/auth/register_screen.dart';
import 'package:roadwatch/services/roadwatch_api.dart';
import 'package:roadwatch/state/auth_provider.dart';
import 'package:roadwatch/state/theme_provider.dart';
import 'package:roadwatch/theme/app_theme.dart';
import 'package:roadwatch/widgets/brand_logo.dart';

const _successMessage =
    'Your account was created successfully! Please sign in to continue.';

class _MemoryTokenStore extends TokenStore {
  String? accessToken;
  String? refreshToken;
  Map<String, dynamic>? userJson;

  @override
  Future<String?> readAccessToken() async => accessToken;

  @override
  Future<String?> readRefreshToken() async => refreshToken;

  @override
  Future<void> saveUserJson(Map<String, dynamic> user) async {
    userJson = user;
  }

  @override
  Future<Map<String, dynamic>?> readUserJson() async => userJson;

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  @override
  Future<void> clear() async {
    accessToken = null;
    refreshToken = null;
    userJson = null;
  }
}

void main() {
  testWidgets(
    'registration returns to sign in, keeps confirmation visible, then accepts login',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final requests = <http.Request>[];
      final tokenStore = _MemoryTokenStore();
      final api = RoadWatchApi(
        ApiClient(
          tokenStore: tokenStore,
          httpClient: MockClient((request) async {
            requests.add(request);
            if (request.url.path == '/api/auth/register') {
              await Future<void>.delayed(const Duration(milliseconds: 100));
              return http.Response(
                jsonEncode({
                  'user': {
                    'id': 'new-citizen',
                    'fullName': 'Test Citizen',
                    'email': 'citizen@example.test',
                    'role': 'CITIZEN',
                    'status': 'ACTIVE',
                  },
                }),
                201,
                headers: {'content-type': 'application/json'},
              );
            }
            if (request.url.path == '/api/auth/login') {
              return http.Response(
                jsonEncode({
                  'user': {
                    'id': 'new-citizen',
                    'fullName': 'Test Citizen',
                    'email': 'citizen@example.test',
                    'role': 'CITIZEN',
                    'status': 'ACTIVE',
                  },
                  'accessToken': 'test-access-token',
                  'refreshToken': 'test-refresh-token',
                }),
                200,
                headers: {'content-type': 'application/json'},
              );
            }
            return http.Response('{}', 404);
          }),
          baseUrl: 'https://api.example.test',
        ),
      );
      final auth = AuthProvider(api);
      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<AuthProvider>.value(value: auth),
            ChangeNotifierProvider(create: (_) => ThemeProvider()),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            darkTheme: AppTheme.dark(),
            home: const LoginScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Create account'));
      await tester.pumpAndSettle();

      Future<void> enter(Key key, String value) async {
        await tester.ensureVisible(find.byKey(key));
        await tester.pumpAndSettle();
        await tester.enterText(find.byKey(key), value);
      }

      await enter(const Key('register-name-field'), 'Test Citizen');
      await enter(const Key('register-email-field'), 'citizen@example.test');
      await enter(const Key('register-password-field'), 'valid-pass-8');
      await enter(const Key('register-confirm-password-field'), 'valid-pass-8');
      await tester.ensureVisible(find.byKey(const Key('register-submit')));
      await tester.tap(find.byKey(const Key('register-submit')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('register-submit')));
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pumpAndSettle();

      expect(
        requests.where((request) => request.url.path == '/api/auth/register'),
        hasLength(1),
        reason: 'a pending account creation must not submit twice',
      );
      expect(find.byType(RegisterScreen), findsNothing);
      expect(find.byType(LoginScreen), findsOneWidget);
      expect(find.text(_successMessage), findsOneWidget);
      expect(auth.isAuthenticated, isFalse);
      expect(await tokenStore.readAccessToken(), isNull);

      final loginFields = find.byType(TextFormField);
      await tester.enterText(loginFields.at(0), 'citizen@example.test');
      await tester.enterText(loginFields.at(1), 'valid-pass-8');
      await tester.tap(find.text('Sign in'));
      await tester.pumpAndSettle();

      expect(
        requests.where((request) => request.url.path == '/api/auth/login'),
        hasLength(1),
      );
      expect(auth.isAuthenticated, isTrue);
      expect(await tokenStore.readAccessToken(), 'test-access-token');
    },
  );

  testWidgets('registration failure stays on form and allows a retry', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final api = RoadWatchApi(
      ApiClient(
        tokenStore: TokenStore(),
        httpClient: MockClient((_) async {
          return http.Response(
            jsonEncode({
              'error': {
                'code': 'CONFLICT',
                'message': 'An account with this email already exists.',
              },
            }),
            409,
            headers: {'content-type': 'application/json'},
          );
        }),
        baseUrl: 'https://api.example.test',
      ),
    );
    final auth = AuthProvider(api);
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthProvider>.value(value: auth),
          ChangeNotifierProvider(create: (_) => ThemeProvider()),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const RegisterScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('register-name-field')),
      'Test Citizen',
    );
    await tester.enterText(
      find.byKey(const Key('register-email-field')),
      'citizen@example.test',
    );
    await tester.enterText(
      find.byKey(const Key('register-password-field')),
      'valid-pass-8',
    );
    await tester.enterText(
      find.byKey(const Key('register-confirm-password-field')),
      'valid-pass-8',
    );
    await tester.ensureVisible(find.byKey(const Key('register-submit')));
    await tester.tap(find.byKey(const Key('register-submit')));
    await tester.pumpAndSettle();

    expect(find.byType(RegisterScreen), findsOneWidget);
    expect(find.text(_successMessage), findsNothing);
    expect(
      find.text('An account with this email already exists.'),
      findsOneWidget,
    );
    expect(
      tester
          .widget<ElevatedButton>(
            find.descendant(
              of: find.byKey(const Key('register-submit')),
              matching: find.byType(ElevatedButton),
            ),
          )
          .onPressed,
      isNotNull,
    );
    expect(auth.isAuthenticated, isFalse);
  });

  testWidgets(
    'network failure shows an error without navigating or authenticating',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final api = RoadWatchApi(
        ApiClient(
          tokenStore: TokenStore(),
          httpClient: MockClient(
            (_) async => throw const SocketException('offline'),
          ),
          baseUrl: 'https://api.example.test',
        ),
      );
      final auth = AuthProvider(api);
      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<AuthProvider>.value(value: auth),
            ChangeNotifierProvider(create: (_) => ThemeProvider()),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const RegisterScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('register-name-field')),
        'Test Citizen',
      );
      await tester.enterText(
        find.byKey(const Key('register-email-field')),
        'citizen@example.test',
      );
      await tester.enterText(
        find.byKey(const Key('register-password-field')),
        'valid-pass-8',
      );
      await tester.enterText(
        find.byKey(const Key('register-confirm-password-field')),
        'valid-pass-8',
      );
      await tester.ensureVisible(find.byKey(const Key('register-submit')));
      await tester.tap(find.byKey(const Key('register-submit')));
      await tester.pumpAndSettle();

      expect(find.byType(RegisterScreen), findsOneWidget);
      expect(find.text(_successMessage), findsNothing);
      expect(
        find.text(
          'Cannot reach the server. Check your connection and try again.',
        ),
        findsOneWidget,
      );
      expect(auth.isAuthenticated, isFalse);
      expect(
        tester
            .widget<ElevatedButton>(
              find.descendant(
                of: find.byKey(const Key('register-submit')),
                matching: find.byType(ElevatedButton),
              ),
            )
            .onPressed,
        isNotNull,
      );
    },
  );

  for (final mode in [ThemeMode.light, ThemeMode.dark]) {
    testWidgets(
      '${mode.name} registration layout fits mobile, tablet, and desktop widths',
      (tester) async {
        await tester.binding.setSurfaceSize(const Size(375, 667));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        final api = RoadWatchApi(
          ApiClient(
            tokenStore: TokenStore(),
            httpClient: MockClient((_) async => http.Response('{}', 500)),
            baseUrl: 'https://api.example.test',
          ),
        );
        await tester.pumpWidget(
          MultiProvider(
            providers: [
              ChangeNotifierProvider(create: (_) => AuthProvider(api)),
              ChangeNotifierProvider(create: (_) => ThemeProvider()),
            ],
            child: MaterialApp(
              theme: AppTheme.light(),
              darkTheme: AppTheme.dark(),
              themeMode: mode,
              home: const RegisterScreen(),
            ),
          ),
        );

        for (final width in [375.0, 390.0, 768.0, 1024.0, 1440.0]) {
          await tester.binding.setSurfaceSize(Size(width, 844));
          await tester.pumpAndSettle();
          expect(
            tester.takeException(),
            isNull,
            reason: '${mode.name} at $width px',
          );
          expect(find.byType(BrandLogo), findsOneWidget);
          final card = tester.getRect(find.byKey(const Key('register-card')));
          expect(
            card.left,
            greaterThanOrEqualTo(0),
            reason: '${mode.name} at $width px',
          );
          expect(
            card.right,
            lessThanOrEqualTo(width),
            reason: '${mode.name} at $width px',
          );
          expect(
            card.width,
            lessThanOrEqualTo(520),
            reason: '${mode.name} at $width px',
          );
          expect(
            card.width,
            greaterThan(0),
            reason: '${mode.name} at $width px',
          );
          expect(find.text('Join RoadBlocks'), findsOneWidget);
        }
      },
    );
  }
}
