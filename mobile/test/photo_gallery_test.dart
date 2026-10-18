import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:roadwatch/models/models.dart';
import 'package:roadwatch/widgets/photo_thumbnail.dart';

void main() {
  testWidgets('photo thumbnail opens a swipeable full-screen gallery', (
    tester,
  ) async {
    final photos = [
      const ReportPhoto(
        id: 'photo-1',
        kind: PhotoKind.before,
        url: 'https://example.com/before.jpg',
        mimeType: 'image/jpeg',
        isPublic: true,
      ),
      const ReportPhoto(
        id: 'photo-2',
        kind: PhotoKind.after,
        url: 'https://example.com/after.jpg',
        mimeType: 'image/jpeg',
        isPublic: true,
      ),
    ];

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => Center(
              child: PhotoThumbnail(
                photo: photos.first,
                width: 80,
                height: 80,
                onTap: () =>
                    unawaited(PhotoGalleryScreen.open(context, photos)),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.byType(PhotoThumbnail));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));
    expect(find.text('1/2'), findsOneWidget);
    expect(find.text('Before photo'), findsOneWidget);

    await tester.fling(find.byType(PageView), const Offset(-600, 0), 1200);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('2/2'), findsOneWidget);
    expect(find.text('After photo'), findsOneWidget);
  });
}
