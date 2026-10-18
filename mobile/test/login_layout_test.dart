import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import 'package:roadwatch/core/api_client.dart';
import 'package:roadwatch/core/token_store.dart';
import 'package:roadwatch/screens/auth/login_screen.dart';
import 'package:roadwatch/services/roadwatch_api.dart';
import 'package:roadwatch/state/auth_provider.dart';
import 'package:roadwatch/state/theme_provider.dart';
import 'package:roadwatch/theme/app_theme.dart';
import 'package:roadwatch/widgets/brand_logo.dart';

/// Layout coverage for the sign-in screen: the lockup must match the web login
/// proportions (not the full-screen splash size) and the whole form must fit a
/// phone — including a small one with the keyboard open.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const phone = Size(375, 667);

  setUpAll(() async {
    // Flutter's test default is the Ahem placeholder font, where every glyph is
    // a square of the font size — which inflates text and makes layout
    // measurements meaningless. Load the real brand faces so these assertions
    // reflect what actually ships on a phone.
    final league = FontLoader('LeagueSpartan')
      ..addFont(rootBundle.load('assets/fonts/LeagueSpartan-Variable.ttf'));
    await league.load();

    final poppins = FontLoader('Poppins');
    for (final weight in ['Regular', 'Medium', 'SemiBold', 'Bold']) {
      poppins.addFont(rootBundle.load('assets/fonts/Poppins-$weight.ttf'));
    }
    await poppins.load();
  });

  Widget app(ThemeMode mode, {double keyboardInset = 0}) {
    final api = RoadWatchApi(ApiClient(
      tokenStore: TokenStore(),
      httpClient: MockClient((_) async => http.Response('{}', 200)),
      baseUrl: 'http://example.test',
    ));
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider(api)),
        ChangeNotifierProvider(create: (_) => ThemeProvider()),
      ],
      child: MaterialApp(
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        themeMode: mode,
        home: Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              viewInsets: EdgeInsets.only(bottom: keyboardInset),
            ),
            child: const LoginScreen(),
          ),
        ),
      ),
    );
  }

  Future<void> pumpAt(WidgetTester tester, Size size, ThemeMode mode, {double keyboardInset = 0}) async {
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(app(mode, keyboardInset: keyboardInset));
    await tester.pumpAndSettle();
  }

  testWidgets('the sign-in lockup is sized like the web login, not the splash', (tester) async {
    await pumpAt(tester, phone, ThemeMode.light);

    expect(find.byType(BrandLogo), findsOneWidget);
    expect(find.text('RoadWatch'), findsOneWidget);
    expect(find.text('by Code Blocks Inc.'), findsOneWidget);

    // The web `.rw-auth-brand` lockup is ~47px tall. The previous
    // `LogoSize.large` lockup rendered ~113px and dominated the screen.
    final size = tester.getSize(find.byType(BrandLogo));
    expect(size.height, lessThan(60));
    expect(size.height, greaterThan(30));
  });

  testWidgets('the whole form fits a 375x667 phone without scrolling', (tester) async {
    await pumpAt(tester, phone, ThemeMode.light);

    expect(tester.takeException(), isNull);
    expect(find.text('Sign in'), findsOneWidget);

    expect(find.text('Create account'), findsOneWidget);
    final bottom = tester.getBottomRight(find.text('Create account')).dy;
    expect(bottom, lessThanOrEqualTo(phone.height));
  });

  testWidgets('a small screen with the keyboard open does not overflow', (tester) async {
    await pumpAt(tester, const Size(320, 568), ThemeMode.light, keyboardInset: 280);

    expect(tester.takeException(), isNull);
    expect(find.byType(BrandLogo), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
  });

  testWidgets('dark mode keeps the login form available without overflow', (tester) async {
    await pumpAt(tester, phone, ThemeMode.dark);

    expect(find.text('Sign in to continue'), findsOneWidget);
    expect(find.byType(TextFormField), findsNWidgets(2));
    expect(tester.takeException(), isNull);
  });
}
