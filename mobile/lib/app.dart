import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/app_config.dart';
import 'screens/auth/login_screen.dart';
import 'screens/home/home_shell.dart';
import 'screens/splash_screen.dart';
import 'state/auth_provider.dart';
import 'state/theme_provider.dart';
import 'theme/app_colors.dart';
import 'theme/app_theme.dart';

class RoadWatchApp extends StatelessWidget {
  const RoadWatchApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Deliberately *not* AppColors.syncTo(context) here: this context sits above
    // MaterialApp, so Theme.of would fall back to the default (light) theme.
    // The MaterialApp builder below activates the right palette instead.
    // Rebuilds when the stored preference changes, which is what swaps the
    // MaterialApp theme.
    final theme = context.watch<ThemeProvider>();

    return MaterialApp(
      title: '${AppConfig.productName} · ${AppConfig.brandName}',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: theme.mode,
      home: const _RootGate(),
      builder: (context, child) {
        final media = MediaQuery.of(context);
        // Resolve the brightness the same way MaterialApp does, and activate the
        // matching brand palette before anything below builds. Individual
        // widgets re-activate it via AppColors.syncTo so that the ones Flutter
        // would otherwise skip (const widgets) stay correct — this is the
        // before-first-frame guarantee for everything else.
        AppColors.use(
          switch (theme.mode) {
            ThemeMode.light => Brightness.light,
            ThemeMode.dark => Brightness.dark,
            ThemeMode.system => media.platformBrightness,
          },
        );

        // Clamp text scaling so the layout survives extreme accessibility settings.
        return MediaQuery(
          data: media.copyWith(textScaler: media.textScaler.clamp(minScaleFactor: 0.9, maxScaleFactor: 1.3)),
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}

class _RootGate extends StatelessWidget {
  const _RootGate();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    if (auth.isInitializing) return const SplashScreen();
    return auth.isAuthenticated ? const HomeShell() : const LoginScreen();
  }
}
