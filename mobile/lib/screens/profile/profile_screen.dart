import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_config.dart';
import '../../state/auth_provider.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_typography.dart';
import '../../widgets/app_button.dart';
import '../../widgets/brand_logo.dart';
import '../../widgets/section_card.dart';
import '../../widgets/theme_toggle.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  Future<void> _signOut(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need to sign in again to submit or track reports.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text('Sign out', style: TextStyle(color: AppColors.statusRedInk)),
          ),
        ],
      ),
    );
    if (confirmed == true && context.mounted) {
      await context.read<AuthProvider>().logout();
    }
  }

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    final user = context.watch<AuthProvider>().user;

    return Scaffold(
      backgroundColor: AppColors.sheetBackground,
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          Container(
            decoration: BoxDecoration(
              color: AppColors.darkBlue,
              borderRadius: BorderRadius.only(bottomLeft: Radius.circular(28), bottomRight: Radius.circular(28)),
            ),
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
            child: SafeArea(
              bottom: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.only(top: 12, bottom: 20),
                    child: BrandLogo(onDark: true, size: LogoSize.small),
                  ),
                  Row(
                    children: [
                      Container(
                        width: 62,
                        height: 62,
                        decoration: BoxDecoration(
                          color: AppColors.lightBlue,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          user?.initials ?? '?',
                          style: AppTypography.display(size: 24, color: AppColors.darkBlue),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user?.fullName ?? 'Guest',
                              style: AppTypography.display(size: 20, color: AppColors.onPrimary),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              user?.email ?? '',
                              style: AppTypography.caption(size: 12.5, color: AppColors.lightBlue),
                            ),
                            const SizedBox(height: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: AppColors.lightBlue.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(color: AppColors.lightBlue.withValues(alpha: 0.5)),
                              ),
                              child: Text(
                                user?.role.label ?? 'Citizen',
                                style: AppTypography.caption(size: 11, weight: FontWeight.w600, color: AppColors.lightBlue),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SectionCard(
                  title: 'Account',
                  child: Column(
                    children: [
                      _Row(label: 'Full name', value: user?.fullName ?? '—', icon: Icons.person_outline_rounded),
                      _Row(label: 'Email', value: user?.email ?? '—', icon: Icons.mail_outline_rounded),
                      _Row(label: 'Mobile', value: (user?.phone?.isNotEmpty ?? false) ? user!.phone! : 'Not provided', icon: Icons.phone_outlined),
                      _Row(label: 'Role', value: user?.role.label ?? '—', icon: Icons.badge_outlined),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                SectionCard(
                  title: 'Appearance',
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Choose how RoadWatch looks. System follows your device setting.',
                        style: AppTypography.bodyStyle(size: 13, color: AppColors.textSecondary),
                      ),
                      const SizedBox(height: 12),
                      const ThemeModeSelector(),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                SectionCard(
                  title: 'App information',
                  child: Column(
                    children: [
                      _Row(label: 'Product', value: AppConfig.productName, icon: Icons.apps_rounded),
                      _Row(label: 'Version', value: '1.0.0', icon: Icons.info_outline_rounded),
                      _Row(
                        label: 'Server',
                        value: AppConfig.apiBaseUrl,
                        icon: Icons.dns_outlined,
                      ),
                      _Row(
                        label: 'Maps',
                        value: 'OpenStreetMap',
                        icon: Icons.map_outlined,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                SectionCard(
                  title: 'About',
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Center(child: BrandLogo(onDark: false, size: LogoSize.medium, showTagline: true)),
                      const SizedBox(height: 14),
                      Text(
                        '${AppConfig.productName} is a community road-issue reporting and maintenance '
                        'tracking system, built as a BSIT 3H-G2, Group 5 project at Bulacan State University.',
                        style: AppTypography.bodyStyle(size: 13, color: AppColors.textSecondary),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Brand: Code Blocks Inc. — "Your friendly coding helper".',
                        style: AppTypography.caption(size: 12),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 22),
                AppButton(
                  label: 'Sign out',
                  variant: AppButtonVariant.secondary,
                  icon: Icons.logout_rounded,
                  onPressed: () => _signOut(context),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value, required this.icon});

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 17, color: AppColors.textMuted),
          const SizedBox(width: 10),
          SizedBox(width: 78, child: Text(label, style: AppTypography.caption(size: 12.5))),
          Expanded(
            child: Text(value, style: AppTypography.bodyStyle(size: 13.5, weight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}
