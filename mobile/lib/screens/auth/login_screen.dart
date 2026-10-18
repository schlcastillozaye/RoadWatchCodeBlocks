import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/app_config.dart';
import '../../state/auth_provider.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_typography.dart';
import '../../widgets/app_button.dart';
import '../../widgets/brand_logo.dart';
import '../../widgets/theme_toggle.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    try {
      await context.read<AuthProvider>().login(
            email: _email.text.trim(),
            password: _password.text,
          );
    } on ApiException catch (e) {
      if (mounted) _showError(e.message);
    } catch (_) {
      if (mounted) _showError('Unable to sign in right now. Please try again.');
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      // The error fill is a light red in dark mode, so the label flips to navy
      // to stay readable — the same inversion the web applies to `.btn-danger`.
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

  void _fillDemo() {
    _email.text = 'citizen@example.com';
    _password.text = 'Citizen@12345';
  }

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    final busy = context.watch<AuthProvider>().isBusy;

    return Scaffold(
      backgroundColor: AppColors.darkBlue,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: Column(
                children: [
                  // --- Brand hero -------------------------------------------------
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 40, 24, 30),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const BrandLogo(onDark: true, size: LogoSize.large, showTagline: true),
                            const Spacer(),
                            const ThemeToggleButton(onDark: true),
                          ],
                        ),
                        const SizedBox(height: 26),
                        Text(
                          'Welcome back',
                          style: AppTypography.display(size: 30, color: AppColors.onPrimary),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          AppConfig.tagline,
                          style: AppTypography.bodyStyle(size: 15, color: AppColors.lightBlue),
                        ),
                      ],
                    ),
                  ),

                  // --- Form card --------------------------------------------------
                  Container(
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: AppColors.sheetBackground,
                      borderRadius: BorderRadius.only(
                        topLeft: Radius.circular(32),
                        topRight: Radius.circular(32),
                      ),
                    ),
                    padding: const EdgeInsets.fromLTRB(24, 28, 24, 32),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text('Sign in to continue', style: AppTypography.headingStyle(size: 19)),
                          const SizedBox(height: 18),
                          TextFormField(
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            textInputAction: TextInputAction.next,
                            autofillHints: const [AutofillHints.email],
                            decoration: const InputDecoration(
                              labelText: 'Email address',
                              prefixIcon: Icon(Icons.mail_outline_rounded),
                            ),
                            validator: (v) {
                              if (v == null || v.trim().isEmpty) return 'Email is required';
                              if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v.trim())) {
                                return 'Enter a valid email address';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 14),
                          TextFormField(
                            controller: _password,
                            obscureText: _obscure,
                            textInputAction: TextInputAction.done,
                            onFieldSubmitted: (_) => _submit(),
                            decoration: InputDecoration(
                              labelText: 'Password',
                              prefixIcon: const Icon(Icons.lock_outline_rounded),
                              suffixIcon: IconButton(
                                icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                                onPressed: () => setState(() => _obscure = !_obscure),
                              ),
                            ),
                            validator: (v) => (v == null || v.isEmpty) ? 'Password is required' : null,
                          ),
                          const SizedBox(height: 22),
                          AppButton(
                            label: 'Sign in',
                            icon: Icons.login_rounded,
                            loading: busy,
                            onPressed: busy ? null : _submit,
                          ),
                          const SizedBox(height: 12),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text('New to RoadWatch?',
                                  style: AppTypography.bodyStyle(size: 14, color: AppColors.textSecondary)),
                              TextButton(
                                onPressed: busy
                                    ? null
                                    : () => Navigator.of(context).push(
                                          MaterialPageRoute(builder: (_) => const RegisterScreen()),
                                        ),
                                child: const Text('Create account'),
                              ),
                            ],
                          ),
                          if (kDebugMode) ...[
                            const SizedBox(height: 4),
                            _DemoHint(onTap: _fillDemo),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DemoHint extends StatelessWidget {
  const _DemoHint({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.lightYellow,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            Icon(Icons.info_outline_rounded, size: 18, color: AppColors.darkBlue),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Demo: tap to fill citizen@example.com / Citizen@12345',
                style: AppTypography.caption(size: 12, color: AppColors.textSecondary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
