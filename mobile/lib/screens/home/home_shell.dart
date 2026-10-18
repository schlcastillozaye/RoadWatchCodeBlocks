import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../map/public_map_screen.dart';
import '../profile/profile_screen.dart';
import '../reports/my_reports_screen.dart';
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

  void _goTo(int index) => setState(() => _index = index);

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final isStaff = user != null && user.role != UserRole.citizen;
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: isStaff
            ? [
                StaffDashboardScreen(isAdmin: user.isAdmin),
                const PublicMapScreen(),
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
        selectedIndex: _index,
        onDestinationSelected: _goTo,
        destinations: isStaff
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
                  label: user.isAdmin ? 'Review' : 'Work',
                ),
                const NavigationDestination(
                  icon: Icon(Icons.map_outlined),
                  selectedIcon: Icon(Icons.map_rounded),
                  label: 'Map',
                ),
                const NavigationDestination(
                  icon: Icon(Icons.person_outline_rounded),
                  selectedIcon: Icon(Icons.person_rounded),
                  label: 'Profile',
                ),
              ]
            : const [
                NavigationDestination(
                  icon: Icon(Icons.home_outlined),
                  selectedIcon: Icon(Icons.home_rounded),
                  label: 'Home',
                ),
                NavigationDestination(
                  icon: Icon(Icons.map_outlined),
                  selectedIcon: Icon(Icons.map_rounded),
                  label: 'Map',
                ),
                NavigationDestination(
                  icon: Icon(Icons.article_outlined),
                  selectedIcon: Icon(Icons.article_rounded),
                  label: 'Reports',
                ),
                NavigationDestination(
                  icon: Icon(Icons.person_outline_rounded),
                  selectedIcon: Icon(Icons.person_rounded),
                  label: 'Profile',
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
