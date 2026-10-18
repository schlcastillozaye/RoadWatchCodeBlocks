import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/api_client.dart';
import 'services/roadwatch_api.dart';
import 'state/auth_provider.dart';
import 'state/map_provider.dart';
import 'state/reports_provider.dart';
import 'state/theme_provider.dart';
import 'theme/app_colors.dart';
import 'app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final client = ApiClient();
  final api = RoadWatchApi(client);

  // Read the saved appearance before the first frame, otherwise a user who
  // chose dark mode sees a flash of the light theme on every cold start.
  final themeProvider = ThemeProvider();
  await themeProvider.load();
  AppColors.use(
    switch (themeProvider.mode) {
      ThemeMode.light => Brightness.light,
      ThemeMode.dark => Brightness.dark,
      ThemeMode.system => WidgetsBinding.instance.platformDispatcher.platformBrightness,
    },
  );

  runApp(
    MultiProvider(
      providers: [
        Provider<RoadWatchApi>.value(value: api),
        ChangeNotifierProvider.value(value: themeProvider),
        ChangeNotifierProvider(create: (_) => AuthProvider(api)..bootstrap()),
        ChangeNotifierProvider(create: (_) => MyReportsProvider(api)),
        ChangeNotifierProvider(create: (_) => MapProvider(api)),
      ],
      child: const RoadWatchApp(),
    ),
  );
}
