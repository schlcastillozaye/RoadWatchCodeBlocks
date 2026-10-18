import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:roadwatch/core/app_config.dart';

/// The Profile screen renders [AppConfig.appVersion], while the Android build
/// stamps `versionName`/`versionCode` from `pubspec.yaml`. If the two drift, a
/// release APK advertises a version it was not built with — so read the pubspec
/// back and assert the constants agree.
void main() {
  test('AppConfig version matches pubspec.yaml', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    final match = RegExp(r'^version:\s*(\S+)\s*$', multiLine: true).firstMatch(pubspec);
    expect(match, isNotNull, reason: 'pubspec.yaml must declare a `version:` line');

    expect(
      match!.group(1),
      '${AppConfig.appVersion}+${AppConfig.buildNumber}',
      reason: 'bump AppConfig.appVersion / AppConfig.buildNumber and pubspec.yaml together',
    );
  });

  test('the version label is the build-name + build-number pair', () {
    expect(AppConfig.versionLabel, '${AppConfig.appVersion}+${AppConfig.buildNumber}');
    expect(AppConfig.appVersion, matches(RegExp(r'^\d+\.\d+\.\d+$')));
    expect(int.tryParse(AppConfig.buildNumber), isNotNull);
  });
}
