import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../models/models.dart';
import '../../services/roadwatch_api.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_typography.dart';
import '../../widgets/section_card.dart';

class AdminUsersScreen extends StatefulWidget {
  const AdminUsersScreen({super.key});

  @override
  State<AdminUsersScreen> createState() => _AdminUsersScreenState();
}

class _AdminUsersScreenState extends State<AdminUsersScreen> {
  final _search = TextEditingController();
  List<AppUser> _users = [];
  String? _role;
  String? _status;
  String? _error;
  bool _loading = true;
  int _page = 1;
  int _totalPages = 1;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await context.read<RoadWatchApi>().users(
        page: _page,
        pageSize: 20,
        search: _search.text,
        role: _role,
        status: _status,
      );
      if (!mounted) return;
      setState(() {
        _users = result.items;
        _totalPages = result.totalPages;
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not load registered users.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _editUser(AppUser user) async {
    final formKey = GlobalKey<FormState>();
    var updatedName = user.fullName;
    var updatedPhone = user.phone ?? '';
    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Edit user'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                initialValue: user.fullName,
                autofocus: true,
                maxLength: 120,
                onSaved: (value) => updatedName = value?.trim() ?? '',
                decoration: const InputDecoration(labelText: 'Full name'),
                validator: (value) => (value?.trim().length ?? 0) < 2
                    ? 'Enter at least 2 characters.'
                    : null,
              ),
              TextFormField(
                initialValue: user.phone ?? '',
                keyboardType: TextInputType.phone,
                maxLength: 30,
                onSaved: (value) => updatedPhone = value?.trim() ?? '',
                decoration: const InputDecoration(
                  labelText: 'Phone (optional)',
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '${user.email} · ${user.role.label}',
                style: AppTypography.caption(size: 12),
              ),
              const SizedBox(height: 4),
              const Text('Role and email cannot be changed here.'),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final form = formKey.currentState!;
              if (form.validate()) {
                form.save();
                Navigator.pop(dialogContext, true);
              }
            },
            child: const Text('Save changes'),
          ),
        ],
      ),
    );
    if (accepted == true && mounted) {
      try {
        await context.read<RoadWatchApi>().updateManagedUser(
          user.id,
          fullName: updatedName,
          phone: updatedPhone,
        );
        if (mounted) _message('User information updated.');
        await _load();
      } on ApiException catch (error) {
        if (mounted) _message(error.message);
      }
    }
  }

  Future<void> _setAccountStatus(AppUser user) async {
    final suspending = user.status == 'ACTIVE';
    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(suspending ? 'Deactivate account?' : 'Reactivate account?'),
        content: Text(
          suspending
              ? 'This prevents ${user.fullName} from signing in. Their reports and history will be preserved.'
              : 'This allows ${user.fullName} to sign in again.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(suspending ? 'Deactivate' : 'Reactivate'),
          ),
        ],
      ),
    );
    if (accepted != true || !mounted) return;
    try {
      await context.read<RoadWatchApi>().updateManagedUser(
        user.id,
        fullName: user.fullName,
        phone: user.phone,
        status: suspending ? 'SUSPENDED' : 'ACTIVE',
      );
      if (mounted) {
        _message(suspending ? 'Account deactivated.' : 'Account reactivated.');
      }
      await _load();
    } on ApiException catch (error) {
      if (mounted) _message(error.message);
    }
  }

  void _message(String value) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(value)));
  }

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('User management')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: SectionCard(
              title: 'Registered accounts',
              subtitle: 'Administrator accounts are protected from changes.',
              child: Column(
                children: [
                  TextField(
                    controller: _search,
                    textInputAction: TextInputAction.search,
                    maxLines: 1,
                    onSubmitted: (_) {
                      _page = 1;
                      _load();
                    },
                    decoration: InputDecoration(
                      labelText: 'Search name, email or phone',
                      prefixIcon: const Icon(Icons.search_rounded),
                      prefixIconConstraints: const BoxConstraints(
                        minWidth: 40,
                        minHeight: 48,
                      ),
                      suffixIconConstraints: const BoxConstraints(
                        minWidth: 40,
                        minHeight: 48,
                      ),
                      suffixIcon: IconButton(
                        tooltip: 'Search users',
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints.tightFor(
                          width: 40,
                          height: 48,
                        ),
                        onPressed: () {
                          _page = 1;
                          _load();
                        },
                        icon: const Icon(Icons.arrow_forward_rounded),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String?>(
                          isExpanded: true,
                          initialValue: _role,
                          decoration: const InputDecoration(labelText: 'Role'),
                          items: const [
                            DropdownMenuItem(
                              value: null,
                              child: Text('All roles'),
                            ),
                            DropdownMenuItem(
                              value: 'CITIZEN',
                              child: Text('Citizen'),
                            ),
                            DropdownMenuItem(
                              value: 'MAINTENANCE_OFFICER',
                              child: Text(
                                'Officer',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            DropdownMenuItem(
                              value: 'ADMIN',
                              child: Text(
                                'Administrator',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                          onChanged: (value) {
                            setState(() {
                              _role = value;
                              _page = 1;
                            });
                            _load();
                          },
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: DropdownButtonFormField<String?>(
                          isExpanded: true,
                          initialValue: _status,
                          decoration: const InputDecoration(
                            labelText: 'Status',
                          ),
                          items: const [
                            DropdownMenuItem(
                              value: null,
                              child: Text('All status'),
                            ),
                            DropdownMenuItem(
                              value: 'ACTIVE',
                              child: Text('Active'),
                            ),
                            DropdownMenuItem(
                              value: 'SUSPENDED',
                              child: Text('Suspended'),
                            ),
                          ],
                          onChanged: (value) {
                            setState(() {
                              _status = value;
                              _page = 1;
                            });
                            _load();
                          },
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                _error!,
                style: TextStyle(color: AppColors.statusRedInk),
              ),
            ),
          Expanded(
            child: _loading
                ? Center(
                    child: CircularProgressIndicator(
                      color: AppColors.brandAccent,
                    ),
                  )
                : _users.isEmpty
                ? const Center(child: Text('No accounts match these filters.'))
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                      itemCount: _users.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final account = _users[index];
                        final protected = account.role == UserRole.admin;
                        return SectionCard(
                          title: account.fullName,
                          subtitle: account.email,
                          trailing: Text(
                            account.status == 'ACTIVE' ? 'Active' : 'Suspended',
                            style: AppTypography.caption(
                              size: 12,
                              weight: FontWeight.w600,
                              color: account.status == 'ACTIVE'
                                  ? AppColors.statusGreenInk
                                  : AppColors.statusRedInk,
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Role: ${account.role.label}',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              Text(
                                'Phone: ${account.phone?.isNotEmpty == true ? account.phone : 'Not provided'}',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              if (protected) ...[
                                const SizedBox(height: 8),
                                const Text('Administrator account — protected'),
                              ] else
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: [
                                    TextButton.icon(
                                      onPressed: () => _editUser(account),
                                      icon: const Icon(Icons.edit_outlined),
                                      label: const Text('Edit details'),
                                    ),
                                    TextButton.icon(
                                      onPressed: () =>
                                          _setAccountStatus(account),
                                      icon: Icon(
                                        account.status == 'ACTIVE'
                                            ? Icons.person_off_outlined
                                            : Icons.person_outline_rounded,
                                      ),
                                      label: Text(
                                        account.status == 'ACTIVE'
                                            ? 'Deactivate'
                                            : 'Reactivate',
                                      ),
                                    ),
                                  ],
                                ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  tooltip: 'Previous page',
                  onPressed: _page > 1
                      ? () {
                          setState(() => _page--);
                          _load();
                        }
                      : null,
                  icon: const Icon(Icons.chevron_left_rounded),
                ),
                Text('Page $_page of $_totalPages'),
                IconButton(
                  tooltip: 'Next page',
                  onPressed: _page < _totalPages
                      ? () {
                          setState(() => _page++);
                          _load();
                        }
                      : null,
                  icon: const Icon(Icons.chevron_right_rounded),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
