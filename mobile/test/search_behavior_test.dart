import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:roadwatch/core/api_client.dart';
import 'package:roadwatch/models/models.dart';
import 'package:roadwatch/screens/reports/my_reports_screen.dart';
import 'package:roadwatch/services/roadwatch_api.dart';
import 'package:roadwatch/state/map_provider.dart';
import 'package:roadwatch/state/reports_provider.dart';
import 'package:roadwatch/theme/app_theme.dart';

class _FakeReportApi extends RoadWatchApi {
  _FakeReportApi() : super(ApiClient());

  final List<String?> searches = [];

  @override
  Future<Paginated<RoadReport>> myReports({
    int page = 1,
    int pageSize = 20,
    ModerationStatus? moderationStatus,
    RepairStatus? repairStatus,
    String? search,
  }) async {
    searches.add(search);
    return Paginated<RoadReport>(
      items: const [],
      total: 0,
      page: page,
      pageSize: pageSize,
      totalPages: 1,
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('my-report search waits for the debounce before requesting', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final api = _FakeReportApi();
    final provider = MyReportsProvider(api);
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: provider,
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const MyReportsScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final baselineRequests = api.searches.length;

    await tester.enterText(
      find.byKey(const Key('my-reports-search-field')),
      'Main Street',
    );
    await tester.pump(const Duration(milliseconds: 399));
    expect(api.searches.length, baselineRequests);
    await tester.pump(const Duration(milliseconds: 2));
    await tester.pumpAndSettle();
    expect(api.searches.length, baselineRequests + 1);
    expect(api.searches.last, 'Main Street');
  });

  test('an older place-search response cannot replace a newer query', () async {
    SharedPreferences.setMockInitialValues({});
    final oldResponse = Completer<http.Response>();
    final api = RoadWatchApi(
      ApiClient(
        httpClient: MockClient((request) async {
          final query = request.url.queryParameters['q'];
          if (query == 'Old Road') return oldResponse.future;
          return http.Response(
            jsonEncode({
              'available': true,
              'results': [
                {'address': 'New Road', 'lat': 14.6, 'lng': 121.0},
              ],
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
        baseUrl: 'https://api.example.test',
      ),
    );
    final provider = MapProvider(api);
    final oldSearch = provider.searchPlace('Old Road');
    await Future<void>.delayed(Duration.zero);
    provider.invalidatePlaceSearch();
    await provider.searchPlace('New Road');
    oldResponse.complete(
      http.Response(
        jsonEncode({
          'available': true,
          'results': [
            {'address': 'Old Road', 'lat': 14.5, 'lng': 120.9},
          ],
        }),
        200,
        headers: {'content-type': 'application/json'},
      ),
    );
    await oldSearch;
    expect(provider.placeResults.single.address, 'New Road');
  });
}
