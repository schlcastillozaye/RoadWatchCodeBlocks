import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Brand primary button with an inline loading state.
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.loading = false,
    this.icon,
    this.expand = true,
    this.variant = AppButtonVariant.primary,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  final bool expand;
  final AppButtonVariant variant;

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);

    // The spinner has to contrast with the button fill. In dark mode the
    // primary button is inverted to sky-on-navy (see AppTheme), and a secondary
    // button is transparent, so the old `onPrimary` spinner was invisible in
    // both cases.
    final spinnerColor = switch (variant) {
      AppButtonVariant.primary =>
        AppColors.isDark ? AppColors.darkBlue : AppColors.onPrimary,
      AppButtonVariant.secondary => AppColors.textPrimary,
      AppButtonVariant.danger => AppColors.statusRedInk,
    };

    final child = loading
        ? SizedBox(
            height: 20,
            width: 20,
            child: CircularProgressIndicator(
              strokeWidth: 2.2,
              color: spinnerColor,
            ),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 19),
                const SizedBox(width: 8),
              ],
              Text(label),
            ],
          );

    final button = switch (variant) {
      AppButtonVariant.primary => ElevatedButton(
        onPressed: loading ? null : onPressed,
        child: child,
      ),
      AppButtonVariant.secondary => OutlinedButton(
        onPressed: loading ? null : onPressed,
        child: child,
      ),
      AppButtonVariant.danger => OutlinedButton(
        onPressed: loading ? null : onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.statusRedInk,
          backgroundColor: AppColors.tintRed,
          side: BorderSide(color: AppColors.statusRedInk),
        ),
        child: child,
      ),
    };

    return expand ? SizedBox(width: double.infinity, child: button) : button;
  }
}

enum AppButtonVariant { primary, secondary, danger }
