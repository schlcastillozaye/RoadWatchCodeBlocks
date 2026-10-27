import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../state/auth_provider.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_typography.dart';
import '../../widgets/app_button.dart';
import '../../widgets/brand_logo.dart';
import '../../widgets/theme_toggle.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _obscure = true;
  bool _submitting = false;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting || context.read<AuthProvider>().isBusy) return;
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();

    setState(() => _submitting = true);
    try {
      await context.read<AuthProvider>().register(
        fullName: _name.text.trim(),
        email: _email.text.trim(),
        password: _password.text,
        phone: _phone.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) _showError(_registrationError(e));
    } catch (_) {
      if (mounted) _showError('Unable to create your account right now.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _registrationError(ApiException error) {
    final details = error.details;
    if (details is List) {
      final messages = details
          .whereType<Map>()
          .map((detail) {
            final path = detail['path']?.toString();
            final message = detail['message']?.toString();
            if (message == null || message.isEmpty) return null;
            return path == null || path.isEmpty ? message : '$path: $message';
          })
          .whereType<String>()
          .toList();
      if (messages.isNotEmpty) return messages.join('\n');
    }
    return error.message;
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      // See LoginScreen._showError: the red fill inverts in dark mode.
      ..showSnackBar(
        SnackBar(
          content: Text(
            message,
            style: AppTypography.bodyStyle(
              size: 14,
              color: AppColors.isDark ? AppColors.darkBlue : AppColors.white,
            ),
          ),
          backgroundColor: AppColors.statusRed,
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    final busy = context.watch<AuthProvider>().isBusy;
    final submitting = busy || _submitting;

    return Scaffold(
      backgroundColor: AppColors.sheetBackground,
      appBar: AppBar(
        title: const Text('Create account'),
        backgroundColor: AppColors.darkBlue,
        actions: const [ThemeToggleButton(onDark: true), SizedBox(width: 6)],
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final cardPadding = constraints.maxWidth < 400 ? 20.0 : 28.0;
            return SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 28),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 520),
                  child: Container(
                    key: const Key('register-card'),
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: AppColors.cardSurface,
                      borderRadius: BorderRadius.circular(28),
                      border: Border.all(color: AppColors.border),
                    ),
                    padding: EdgeInsets.all(cardPadding),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                const Align(
                  alignment: Alignment.centerLeft,
                  child: BrandLogo(
                    onDark: false,
                    size: LogoSize.auth,
                    showTagline: true,
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  'Join RoadBlocks',
                  style: AppTypography.display(
                    size: 26,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Create an account to report road issues and follow repair progress.',
                  style: AppTypography.bodyStyle(
                    size: 14,
                    color: AppColors.textMuted,
                  ),
                ),
                const SizedBox(height: 22),
                TextFormField(
                  key: const Key('register-name-field'),
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.next,
                  maxLength: 120,
                  decoration: const InputDecoration(
                    labelText: 'Full name',
                    prefixIcon: Icon(Icons.person_outline_rounded),
                  ),
                  validator: (v) {
                    final value = v?.trim() ?? '';
                    if (value.length < 2) {
                      return 'Enter your full name';
                    }
                    if (value.length > 120) {
                      return 'Name must be 120 characters or fewer';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 14),
                TextFormField(
                  key: const Key('register-email-field'),
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  maxLength: 190,
                  decoration: const InputDecoration(
                    labelText: 'Email address',
                    prefixIcon: Icon(Icons.mail_outline_rounded),
                  ),
                  validator: (v) {
                    final value = v?.trim() ?? '';
                    if (value.isEmpty) {
                      return 'Email is required';
                    }
                    if (value.length > 190) {
                      return 'Email must be 190 characters or fewer';
                    }
                    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
                        .hasMatch(value)) {
                      return 'Enter a valid email address';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 14),
                TextFormField(
                  key: const Key('register-phone-field'),
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  textInputAction: TextInputAction.next,
                  maxLength: 30,
                  decoration: const InputDecoration(
                    labelText: 'Mobile number (optional)',
                    prefixIcon: Icon(Icons.phone_outlined),
                  ),
                  validator: (v) => (v?.trim().length ?? 0) > 30
                      ? 'Phone must be 30 characters or fewer'
                      : null,
                ),
                const SizedBox(height: 14),
                TextFormField(
                  key: const Key('register-password-field'),
                  controller: _password,
                  obscureText: _obscure,
                  textInputAction: TextInputAction.next,
                  maxLength: 128,
                  decoration: InputDecoration(
                    labelText: 'Password',
                    helperText: '8–128 characters',
                    prefixIcon: const Icon(Icons.lock_outline_rounded),
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscure
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                      ),
                      tooltip: _obscure ? 'Show passwords' : 'Hide passwords',
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                  validator: (v) {
                    if (v == null || v.length < 8) {
                      return 'Use at least 8 characters';
                    }
                    if (v.length > 128) {
                      return 'Password must be 128 characters or fewer';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 14),
                TextFormField(
                  key: const Key('register-confirm-password-field'),
                  controller: _confirm,
                  obscureText: _obscure,
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _submit(),
                  decoration: const InputDecoration(
                    labelText: 'Confirm password',
                    prefixIcon: Icon(Icons.lock_reset_rounded),
                  ),
                  validator: (v) =>
                      v != _password.text ? 'Passwords do not match' : null,
                ),
                const SizedBox(height: 24),
                AppButton(
                  key: const Key('register-submit'),
                  label: 'Create my account',
                  icon: Icons.person_add_alt_1_rounded,
                  loading: submitting,
                  onPressed: submitting ? null : _submit,
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: submitting ? null : () => Navigator.of(context).pop(),
                  child: const Text('I already have an account? Sign in'),
                ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              );
          },
        ),
      ),
    );
  }
}
