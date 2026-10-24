import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:roadwatch/core/api_client.dart';
import 'package:roadwatch/core/token_store.dart';
import 'package:roadwatch/screens/admin/admin_users_screen.dart';
import 'package:roadwatch/services/roadwatch_api.dart';
import 'package:roadwatch/theme/app_theme.dart';

class _TestTokenStore extends TokenStore {
  @override
  Future<String?> readAccessToken() async => null;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final user = {
    'id': 'user-1',
    'fullName':
        'An exceptionally long registered account name for narrow screens',
    'email':
        'very.long.registered.account.address.for.layout.testing@example.com',
    'phone': '+1 202 555 0123 456 789 101 112',
    'role': 'CITIZEN',
    'status': 'ACTIVE',
  };

  Widget screen(RoadWatchApi api, {required ThemeData theme}) => Provider.value(
    value: api,
    child: MaterialApp(theme: theme, home: const AdminUsersScreen()),
  );

  testWidgets('user management fits narrow widths in light and dark themes', (
    tester,
  ) async {
    final api = RoadWatchApi(
      ApiClient(
        tokenStore: _TestTokenStore(),
        httpClient: MockClient(
          (_) async => http.Response(
            jsonEncode({
              'items': [user],
              'total': 1,
              'page': 1,
              'pageSize': 20,
              'totalPages': 1,
            }),
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
        baseUrl: 'https://example.test',
      ),
    );
    addTearDown(api.client.close);

    for (final size in [
      const Size(320, 640),
      const Size(360, 800),
      const Size(375, 667),
      const Size(768, 1024),
    ]) {
      for (final theme in [AppTheme.light(), AppTheme.dark()]) {
        await tester.binding.setSurfaceSize(size);
        await tester.pumpWidget(screen(api, theme: theme));
        await tester.pumpAndSettle();

        expect(find.byTooltip('Search users'), findsOneWidget);
        expect(find.text('All roles'), findsOneWidget);
        expect(find.text('All status'), findsOneWidget);
        expect(find.textContaining('An exceptionally long'), findsOneWidget);
        expect(
          tester.takeException(),
          isNull,
          reason: '$size, ${theme.brightness}',
        );
      }
    }
    await tester.binding.setSurfaceSize(null);
  });

  testWidgets(
    'search, filters, edit, deactivate and pagination stay connected',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(360, 800));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final requests = <http.Request>[];
      final api = RoadWatchApi(
        ApiClient(
          tokenStore: _TestTokenStore(),
          httpClient: MockClient((request) async {
            requests.add(request);
            if (request.method == 'GET') {
              return http.Response(
                jsonEncode({
                  'items': [user],
                  'total': 21,
                  'page': int.tryParse(
                    request.url.queryParameters['page'] ?? '',
                  ),
                  'pageSize': 20,
                  'totalPages': 2,
                }),
                200,
                headers: {'content-type': 'application/json'},
              );
            }
            return http.Response(
              jsonEncode({'user': user}),
              200,
              headers: {'content-type': 'application/json'},
            );
          }),
          baseUrl: 'https://example.test',
        ),
      );
      addTearDown(api.client.close);

      await tester.pumpWidget(screen(api, theme: AppTheme.dark()));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'liz@example.test');
      await tester.tap(find.byTooltip('Search users'));
      await tester.pumpAndSettle();
      expect(requests.last.url.queryParameters['search'], 'liz@example.test');

      await tester.tap(find.text('All roles'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Administrator').last);
      await tester.pumpAndSettle();
      expect(requests.last.url.queryParameters['role'], 'ADMIN');

      await tester.tap(find.text('All status'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Suspended').first);
      await tester.pumpAndSettle();
      expect(requests.last.url.queryParameters['status'], 'SUSPENDED');

      await tester.ensureVisible(find.text('Edit details'));
      await tester.tap(find.text('Edit details'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();
      expect(
        requests.any(
          (request) =>
              request.method == 'PATCH' &&
              request.url.path == '/api/users/user-1',
        ),
        isTrue,
      );

      await tester.ensureVisible(find.text('Deactivate'));
      await tester.tap(find.text('Deactivate'));
      await tester.pumpAndSettle();
      expect(find.text('Deactivate account?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Deactivate'));
      await tester.pumpAndSettle();
      final statusUpdates = requests.where(
        (request) => request.method == 'PATCH',
      );
      expect(
        statusUpdates,
        hasLength(2),
        reason: requests
            .map((r) => '${r.method} ${r.url} ${r.body}')
            .join('\n'),
      );
      final statusUpdate = statusUpdates.last;
      expect(statusUpdate.method, 'PATCH');
      expect(statusUpdate.url.path, '/api/users/user-1');
      expect(
        jsonDecode(statusUpdate.body)['status'],
        'SUSPENDED',
        reason: statusUpdates.map((request) => request.body).join('\n'),
      );

      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Next page'));
      await tester.pumpAndSettle();
      expect(requests.last.url.queryParameters['page'], '2');
      expect(tester.takeException(), isNull);
    },
  );
}
