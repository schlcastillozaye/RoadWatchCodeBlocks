import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:roadwatch/core/api_client.dart';
import 'package:roadwatch/core/token_store.dart';
import 'package:roadwatch/models/app_user.dart';
import 'package:roadwatch/models/enums.dart';
import 'package:roadwatch/screens/home/home_shell.dart';
import 'package:roadwatch/services/roadwatch_api.dart';
import 'package:roadwatch/state/auth_provider.dart';
import 'package:roadwatch/state/map_provider.dart';
import 'package:roadwatch/state/theme_provider.dart';
import 'package:roadwatch/theme/app_theme.dart';

class _TestTokenStore extends TokenStore {
  @override
  Future<String?> readAccessToken() async => null;
}

class _TestAuthProvider extends AuthProvider {
  _TestAuthProvider(super.api, this._user);

  final AppUser _user;

  @override
  AppUser? get user => _user;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('officer bottom navigation fits narrow phone widths', (
    tester,
  ) async {
    addTearDown(() => tester.binding.setSurfaceSize(null));
    SharedPreferences.setMockInitialValues({});
    final api = RoadWatchApi(
      ApiClient(
        tokenStore: _TestTokenStore(),
        httpClient: MockClient((request) async {
          if (request.url.path == '/api/maintenance/assignments') {
            return http.Response(
              jsonEncode({
                'items': [],
                'total': 0,
                'page': 1,
                'pageSize': 100,
                'totalPages': 0,
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.url.path == '/api/maintenance/summary') {
            return http.Response(
              jsonEncode({
                'assigned': 0,
                'awaiting': 0,
                'inProgress': 0,
                'completed': 0,
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.url.path == '/api/notifications') {
            return http.Response(
              jsonEncode({'items': []}),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.url.path == '/api/map/reports') {
            return http.Response(
              jsonEncode({
                'items': [],
                'total': 0,
                'page': 1,
                'pageSize': 50,
                'totalPages': 0,
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          fail('Unexpected API request: ${request.method} ${request.url}');
        }),
        baseUrl: 'https://example.test',
      ),
    );
    addTearDown(api.client.close);
    final auth = _TestAuthProvider(
      api,
      const AppUser(
        id: 'officer-1',
        fullName: 'Test Officer',
        email: 'officer@example.test',
        role: UserRole.maintenanceOfficer,
      ),
    );
    final mapProvider = MapProvider(api);
    addTearDown(mapProvider.dispose);

    for (final width in [320.0, 360.0, 375.0]) {
      await tester.binding.setSurfaceSize(Size(width, 800));
      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<AuthProvider>.value(value: auth),
            Provider<RoadWatchApi>.value(value: api),
            ChangeNotifierProvider<ThemeProvider>(
              create: (_) => ThemeProvider(),
            ),
            ChangeNotifierProvider<MapProvider>.value(value: mapProvider),
          ],
          child: MaterialApp(theme: AppTheme.dark(), home: const HomeShell()),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      final navigation = find.byType(NavigationBar, skipOffstage: false);
      expect(navigation, findsOneWidget);
      expect(
        tester
            .widget<NavigationBar>(navigation)
            .destinations
            .cast<NavigationDestination>()
            .map((destination) => destination.label),
        ['Dashboard', 'Map', 'Repair history', 'My profile'],
      );
      expect(tester.takeException(), isNull);
    }
  });
}
