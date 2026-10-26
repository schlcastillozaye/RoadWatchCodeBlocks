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

  @override
  Widget build(BuildContext context) {
    AppColors.syncTo(context);
    final busy = context.watch<AuthProvider>().isBusy;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 480),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // --- Brand hero -------------------------------------------------
                        Padding(
                          padding: const EdgeInsets.fromLTRB(8, 24, 8, 20),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const BrandLogo(
                                    onDark: false,
                                    size: LogoSize.auth,
                                    showTagline: true,
                                  ),
                                  const Spacer(),
                                  const ThemeToggleButton(),
                                ],
                              ),
                              const SizedBox(height: 20),
                              Text(
                                'Welcome back',
                                style: AppTypography.display(
                                  size: 26,
                                  color: AppColors.textPrimary,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                AppConfig.tagline,
                                style: AppTypography.bodyStyle(
                                  size: 14,
                                  color: AppColors.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        ),

                        // --- Form card --------------------------------------------------
                        Container(
                          width: double.infinity,
                          decoration: BoxDecoration(
                            color: AppColors.cardSurface,
                            borderRadius: BorderRadius.circular(28),
                            border: Border.all(color: AppColors.border),
                          ),
                          padding: const EdgeInsets.fromLTRB(24, 24, 24, 28),
                          child: Form(
                            key: _formKey,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Text(
                                  'Sign in to continue',
                                  style: AppTypography.headingStyle(size: 19),
                                ),
                                const SizedBox(height: 16),
                                TextFormField(
                                  controller: _email,
                                  keyboardType: TextInputType.emailAddress,
                                  textInputAction: TextInputAction.next,
                                  autofillHints: const [AutofillHints.email],
                                  decoration: const InputDecoration(
                                    labelText: 'Email address',
                                    prefixIcon: Icon(
                                      Icons.mail_outline_rounded,
                                    ),
                                  ),
                                  validator: (v) {
                                    if (v == null || v.trim().isEmpty) {
                                      return 'Email is required';
                                    }
                                    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
                                        .hasMatch(v.trim())) {
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
                                    prefixIcon: const Icon(
                                      Icons.lock_outline_rounded,
                                    ),
                                    suffixIcon: IconButton(
                                      icon: Icon(
                                        _obscure
                                            ? Icons.visibility_off_outlined
                                            : Icons.visibility_outlined,
                                      ),
                                      tooltip: _obscure
                                          ? 'Show password'
                                          : 'Hide password',
                                      onPressed: () =>
                                          setState(() => _obscure = !_obscure),
                                    ),
                                  ),
                                  validator: (v) => (v == null || v.isEmpty)
                                      ? 'Password is required'
                                      : null,
                                ),
                                const SizedBox(height: 22),
                                AppButton(
                                  label: 'Sign in',
                                  icon: Icons.login_rounded,
                                  loading: busy,
                                  onPressed: busy ? null : _submit,
                                ),
                                const SizedBox(height: 12),
                                // `Wrap` rather than `Row`: on a narrow phone, or with
                                // a large system text scale, the prompt and the button
                                // reflow onto two centred lines instead of clipping.
                                Wrap(
                                  alignment: WrapAlignment.center,
                                  crossAxisAlignment: WrapCrossAlignment.center,
                                  children: [
                                    Text(
                                      'New to RoadBlocks?',
                                      style: AppTypography.bodyStyle(
                                        size: 14,
                                        color: AppColors.textSecondary,
                                      ),
                                    ),
                                    TextButton(
                                      onPressed: busy
                                          ? null
                                          : () => Navigator.of(context).push(
                                              MaterialPageRoute(
                                                builder: (_) =>
                                                    const RegisterScreen(),
                                              ),
                                            ),
                                      child: const Text('Create account'),
                                    ),
                                  ],
                                ),
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
          ),
        ),
      ),
    );
  }
}
