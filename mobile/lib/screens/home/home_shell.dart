import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../admin/admin_users_screen.dart';
import '../map/public_map_screen.dart';
import '../profile/profile_screen.dart';
import '../reports/my_reports_screen.dart';
import '../reports/submit_report_screen.dart';
import '../../models/enums.dart';
import '../../state/auth_provider.dart';
import 'home_screen.dart';
import 'staff_dashboard_screen.dart';

/// Authenticated shell with the primary navigation.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  Future<void> _goTo(int index) async {
    final user = context.read<AuthProvider>().user;
    if (user?.isCitizen == true) {
      if (index == 2) {
        final created = await Navigator.of(context).push<bool>(
          MaterialPageRoute(builder: (_) => const SubmitReportScreen()),
        );
        if (created == true && mounted) setState(() => _index = 0);
        return;
      }
      setState(() => _index = index < 2 ? index : index - 1);
      return;
    }
    setState(() => _index = index);
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final isStaff = user != null && user.role != UserRole.citizen;
    final isAdmin = user?.isAdmin ?? false;
    final isCitizen = user?.isCitizen ?? false;
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: isAdmin
            ? [
                const StaffDashboardScreen(isAdmin: true),
                const StaffDashboardScreen(isAdmin: true, showAllReports: true),
                const PublicMapScreen(),
                const AdminUsersScreen(),
                const ProfileScreen(),
              ]
            : isStaff
            ? [
                StaffDashboardScreen(isAdmin: false),
                const PublicMapScreen(),
                const StaffDashboardScreen(isAdmin: false, showHistory: true),
                const ProfileScreen(),
              ]
            : [
                HomeScreen(onNavigate: _goTo),
                const PublicMapScreen(),
                const MyReportsScreen(),
                const ProfileScreen(),
              ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: isCitizen && _index >= 2 ? _index + 1 : _index,
        onDestinationSelected: _goTo,
        destinations: isAdmin
            ? const [
                NavigationDestination(
                  icon: Icon(Icons.fact_check_outlined),
                  selectedIcon: Icon(Icons.fact_check_rounded),
                  label: 'Dashboard',
                ),
                NavigationDestination(
                  icon: Icon(Icons.assignment_outlined),
                  selectedIcon: Icon(Icons.assignment_rounded),
                  label: 'Reports',
                ),
                NavigationDestination(
                  icon: Icon(Icons.map_outlined),
                  selectedIcon: Icon(Icons.map_rounded),
                  label: 'Map',
                ),
                NavigationDestination(
                  icon: Icon(Icons.people_outline_rounded),
                  selectedIcon: Icon(Icons.people_rounded),
                  label: 'Users',
                ),
                NavigationDestination(
                  icon: Icon(Icons.person_outline_rounded),
                  selectedIcon: Icon(Icons.person_rounded),
                  label: 'Profile',
                ),
              ]
            : isStaff
            ? [
                NavigationDestination(
                  icon: Icon(
                    user.isAdmin
                        ? Icons.fact_check_outlined
                        : Icons.engineering_outlined,
                  ),
                  selectedIcon: Icon(
                    user.isAdmin
                        ? Icons.fact_check_rounded
                        : Icons.engineering_rounded,
                  ),
                  label: user.isAdmin ? 'Dashboard' : 'My assignments',
                ),
                const NavigationDestination(
                  icon: Icon(Icons.map_outlined),
                  selectedIcon: Icon(Icons.map_rounded),
                  label: 'Map',
                ),
                if (!user.isAdmin)
                  const NavigationDestination(
                    icon: Icon(Icons.history_rounded),
                    selectedIcon: Icon(Icons.history_rounded),
                    label: 'Repair history',
                  ),
                const NavigationDestination(
                  icon: Icon(Icons.person_outline_rounded),
                  selectedIcon: Icon(Icons.person_rounded),
                  label: 'My profile',
                ),
              ]
            : const [
                NavigationDestination(
                  icon: Icon(Icons.home_outlined),
                  selectedIcon: Icon(Icons.home_rounded),
                  label: 'Dashboard',
                ),
                NavigationDestination(
                  icon: Icon(Icons.map_outlined),
                  selectedIcon: Icon(Icons.map_rounded),
                  label: 'Map',
                ),
                NavigationDestination(
                  icon: Tooltip(
                    message: 'Report a road issue',
                    child: Icon(Icons.add_circle_outline_rounded, size: 30),
                  ),
                  selectedIcon: Tooltip(
                    message: 'Report a road issue',
                    child: Icon(Icons.add_circle_rounded, size: 32),
                  ),
                  label: 'Report',
                ),
                NavigationDestination(
                  icon: Icon(Icons.article_outlined),
                  selectedIcon: Icon(Icons.article_rounded),
                  label: 'My reports',
                ),
                NavigationDestination(
                  icon: Icon(Icons.person_outline_rounded),
                  selectedIcon: Icon(Icons.person_rounded),
                  label: 'My profile',
                ),
              ],
      ),
    );
  }

  @override
  void initState() {
    super.initState();
  }
}
