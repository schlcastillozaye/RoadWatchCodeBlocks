import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:roadwatch/core/api_client.dart';
import 'package:roadwatch/core/token_store.dart';
import 'package:roadwatch/screens/home/home_screen.dart';
import 'package:roadwatch/services/roadwatch_api.dart';
import 'package:roadwatch/state/auth_provider.dart';
import 'package:roadwatch/state/reports_provider.dart';
import 'package:roadwatch/state/theme_provider.dart';
import 'package:roadwatch/theme/app_theme.dart';

class _TestTokenStore extends TokenStore {
  @override
  Future<String?> readAccessToken() async => null;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('citizen dashboard My reports action opens the reports tab', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    var selectedTab = -1;
    final api = RoadWatchApi(
      ApiClient(
        tokenStore: _TestTokenStore(),
        httpClient: MockClient((_) async {
          return http.Response(
            jsonEncode({
              'items': [],
              'total': 0,
              'page': 1,
              'pageSize': 20,
              'totalPages': 1,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
        baseUrl: 'http://example.test',
      ),
    );

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthProvider>(
            create: (_) => AuthProvider(api),
          ),
          ChangeNotifierProvider<MyReportsProvider>(
            create: (_) => MyReportsProvider(api),
          ),
          ChangeNotifierProvider<ThemeProvider>(create: (_) => ThemeProvider()),
          Provider<RoadWatchApi>.value(value: api),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: HomeScreen(onNavigate: (index) => selectedTab = index),
        ),
      ),
    );
    await tester.pump();

    final reportsAction = find.text('My reports').first;
    await tester.ensureVisible(reportsAction);
    await tester.tap(reportsAction);
    expect(selectedTab, 3);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
