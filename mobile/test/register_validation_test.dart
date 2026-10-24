import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import 'package:roadwatch/core/api_client.dart';
import 'package:roadwatch/core/token_store.dart';
import 'package:roadwatch/screens/auth/register_screen.dart';
import 'package:roadwatch/services/roadwatch_api.dart';
import 'package:roadwatch/state/auth_provider.dart';
import 'package:roadwatch/state/theme_provider.dart';
import 'package:roadwatch/theme/app_theme.dart';

void main() {
  testWidgets('blocks short passwords and displays server validation details', (
    tester,
  ) async {
    http.Request? received;
    final api = RoadWatchApi(
      ApiClient(
        tokenStore: TokenStore(),
        httpClient: MockClient((request) async {
          received = request;
          return http.Response(
            jsonEncode({
              'error': {
                'code': 'VALIDATION_ERROR',
                'message': 'Validation failed',
                'details': [
                  {
                    'path': 'email',
                    'message': 'A valid email is required',
                  },
                ],
              },
            }),
            422,
            headers: {'content-type': 'application/json'},
          );
        }),
        baseUrl: 'https://api.example.test',
      ),
    );

    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => AuthProvider(api)),
          ChangeNotifierProvider(create: (_) => ThemeProvider()),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const RegisterScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    Future<void> enter(Key key, String value) async {
      await tester.ensureVisible(find.byKey(key));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(key), value);
    }

    await enter(const Key('register-name-field'), 'Test Citizen');
    await enter(const Key('register-email-field'), 'citizen@example.test');
    await enter(const Key('register-password-field'), '12345');
    await enter(const Key('register-confirm-password-field'), '12345');
    await tester.ensureVisible(find.text('Create my account'));
    await tester.tap(find.text('Create my account'));
    await tester.pumpAndSettle();

    expect(find.text('Use at least 8 characters'), findsOneWidget);
    expect(received, isNull, reason: 'invalid passwords must not reach the API');

    await enter(const Key('register-password-field'), 'valid-pass-8');
    await enter(const Key('register-confirm-password-field'), 'valid-pass-8');
    await tester.ensureVisible(find.text('Create my account'));
    await tester.tap(find.text('Create my account'));
    await tester.pumpAndSettle();

    expect(received?.url.path, '/api/auth/register');
    final body = jsonDecode(received!.body) as Map<String, dynamic>;
    expect(body['fullName'], 'Test Citizen');
    expect(body['email'], 'citizen@example.test');
    expect(body['password'], 'valid-pass-8');
    expect(find.text('email: A valid email is required'), findsOneWidget);
  });
}
