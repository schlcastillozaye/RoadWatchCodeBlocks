import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:roadwatch/core/api_client.dart';
import 'package:roadwatch/core/token_store.dart';
import 'package:roadwatch/models/app_user.dart';
import 'package:roadwatch/models/enums.dart';
import 'package:roadwatch/screens/profile/profile_screen.dart';
import 'package:roadwatch/services/roadwatch_api.dart';
import 'package:roadwatch/state/auth_provider.dart';
import 'package:roadwatch/state/theme_provider.dart';
import 'package:roadwatch/theme/app_theme.dart';
import 'package:roadwatch/widgets/theme_toggle.dart';

class _TestTokenStore extends TokenStore {
  @override
  Future<String?> readAccessToken() async => null;
}

class _TestAuthProvider extends AuthProvider {
  _TestAuthProvider(this.api, this._user) : super(api);

  AppUser _user;

  @override
  AppUser? get user => _user;

  @override
  Future<void> updateProfile({required String fullName, String? phone}) async {
    _user = await api.updateOwnProfile(fullName: fullName, phone: phone);
    notifyListeners();
  }

  final RoadWatchApi api;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('theme selector fits a profile-card width', (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<ThemeProvider>(create: (_) => ThemeProvider()),
        ],
        child: MaterialApp(
          theme: AppTheme.dark(),
          home: Scaffold(
            body: Center(
              child: SizedBox(width: 296, child: ThemeModeSelector()),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('citizen can open and save profile without Flutter errors', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(360, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    http.Request? updateRequest;
    final api = RoadWatchApi(
      ApiClient(
        tokenStore: _TestTokenStore(),
        httpClient: MockClient((request) async {
          updateRequest = request;
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              'user': {
                'id': 'citizen-1',
                'fullName': body['fullName'],
                'email': 'citizen@example.test',
                'phone': body['phone'],
                'role': 'CITIZEN',
                'status': 'ACTIVE',
              },
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
        baseUrl: 'https://example.test',
      ),
    );
    addTearDown(api.client.close);

    final auth = _TestAuthProvider(
      api,
      const AppUser(
        id: 'citizen-1',
        fullName: 'RoadWatch Citizen',
        email: 'citizen@example.test',
        phone: '09171234567',
        role: UserRole.citizen,
      ),
    );
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthProvider>.value(value: auth),
          ChangeNotifierProvider<ThemeProvider>(create: (_) => ThemeProvider()),
        ],
        child: MaterialApp(theme: AppTheme.dark(), home: const ProfileScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    await tester.tap(find.widgetWithText(TextButton, 'Edit profile'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AlertDialog, 'Edit profile'), findsOneWidget);
    expect(find.byType(TextFormField), findsNWidgets(2));
    expect(tester.takeException(), isNull);

    await tester.enterText(find.byType(TextFormField).at(0), 'Updated Citizen');
    await tester.enterText(find.byType(TextFormField).at(1), '09170000000');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();

    expect(updateRequest?.method, 'PATCH');
    expect(updateRequest?.url.path, '/api/users/me');
    expect(jsonDecode(updateRequest!.body), {
      'fullName': 'Updated Citizen',
      'phone': '09170000000',
    });
    expect(find.text('Updated Citizen'), findsNWidgets(2));
    expect(find.text('Profile updated.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
