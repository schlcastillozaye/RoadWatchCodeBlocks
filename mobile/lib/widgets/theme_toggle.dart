import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/theme_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// Icon button that flips between light and dark.
///
/// The tooltip wording matches the web toggle (`Switch to dark mode` /
/// `Switch to light mode`), and the icon shows the mode you would switch *to*.
class ThemeToggleButton extends StatelessWidget {
  const ThemeToggleButton({super.key, this.onDark = false});

  /// Set when the button sits on a navy header / app bar, so it draws in the
  /// colour that contrasts with that surface rather than the page ink.
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final palette = AppColors.syncTo(context);
    final theme = context.watch<ThemeProvider>();

    // `Theme.of` resolves `ThemeMode.system` to the live platform brightness,
    // so this is the theme actually on screen — which is what the user expects
    // to be flipped, not the raw enum value.
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return IconButton(
      tooltip: isDark ? 'Switch to light mode' : 'Switch to dark mode',
      onPressed: () =>
          theme.toggleFrom(isDark ? Brightness.dark : Brightness.light),
      icon: Icon(isDark ? Icons.light_mode_rounded : Icons.dark_mode_rounded),
      color: onDark ? palette.onNavy : palette.ink,
      style: IconButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        backgroundColor: onDark
            ? palette.onNavy.withValues(alpha: 0.12)
            : Colors.transparent,
      ),
    );
  }
}

/// Three-way appearance control: follow the system, or force light/dark.
///
/// The web platform only offers a two-state toggle (and follows
/// `prefers-color-scheme` when the user has not chosen), so "System" here
/// reproduces the default state of the web app rather than adding a new mode.
class ThemeModeSelector extends StatelessWidget {
  const ThemeModeSelector({super.key});

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    final theme = context.watch<ThemeProvider>();

    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 380;
        return SegmentedButton<ThemeMode>(
          segments: [
            ButtonSegment(
              value: ThemeMode.system,
              icon: compact
                  ? null
                  : const Icon(Icons.brightness_auto_rounded, size: 17),
              label: const Text('System'),
            ),
            ButtonSegment(
              value: ThemeMode.light,
              icon: compact
                  ? null
                  : const Icon(Icons.light_mode_rounded, size: 17),
              label: const Text('Light'),
            ),
            ButtonSegment(
              value: ThemeMode.dark,
              icon: compact
                  ? null
                  : const Icon(Icons.dark_mode_rounded, size: 17),
              label: const Text('Dark'),
            ),
          ],
          selected: {theme.mode},
          showSelectedIcon: false,
          onSelectionChanged: (selection) => theme.setMode(selection.first),
          style: ButtonStyle(
            textStyle: WidgetStatePropertyAll(
              AppTypography.caption(size: 12, weight: FontWeight.w600),
            ),
            foregroundColor: WidgetStatePropertyAll(AppColors.textSecondary),
            side: WidgetStatePropertyAll(BorderSide(color: AppColors.border)),
          ),
        );
      },
    );
  }
}
