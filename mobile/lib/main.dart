import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/api_client.dart';
import 'services/roadwatch_api.dart';
import 'state/auth_provider.dart';
import 'state/map_provider.dart';
import 'state/reports_provider.dart';
import 'app.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  final client = ApiClient();
  final api = RoadWatchApi(client);

  runApp(
    MultiProvider(
      providers: [
        Provider<RoadWatchApi>.value(value: api),
        ChangeNotifierProvider(create: (_) => AuthProvider(api)..bootstrap()),
        ChangeNotifierProvider(create: (_) => MyReportsProvider(api)),
        ChangeNotifierProvider(create: (_) => MapProvider(api)),
      ],
      child: const RoadWatchApp(),
    ),
  );
}
