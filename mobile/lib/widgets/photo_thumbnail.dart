import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../core/session_tokens.dart';
import '../models/models.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// Network photo with auth headers, caching and a graceful fallback.
class PhotoThumbnail extends StatelessWidget {
  const PhotoThumbnail({
    super.key,
    required this.photo,
    this.width,
    this.height,
    this.radius = 14,
    this.onTap,
    this.fit = BoxFit.cover,
    this.showKindBadge = false,
  });

  final ReportPhoto photo;
  final double? width;
  final double? height;
  final double radius;
  final VoidCallback? onTap;
  final BoxFit fit;
  final bool showKindBadge;

  @override
  Widget build(BuildContext context) {
    final image = CachedNetworkImage(
      imageUrl: photo.url,
      httpHeaders: SessionTokens.authHeaders(isPublic: photo.isPublic),
      width: width,
      height: height,
      fit: fit,
      fadeInDuration: const Duration(milliseconds: 180),
      placeholder: (context, url) => Container(
        width: width,
        height: height,
        color: AppColors.sheetBackground,
        alignment: Alignment.center,
        child: const SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.lightAzure),
        ),
      ),
      errorWidget: (context, url, error) => Container(
        width: width,
        height: height,
        color: AppColors.sheetBackground,
        alignment: Alignment.center,
        child: const Icon(Icons.broken_image_outlined, color: AppColors.textMuted),
      ),
    );

    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: Stack(
          children: [
            image,
            if (showKindBadge)
              Positioned(
                left: 6,
                bottom: 6,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.darkBlue.withValues(alpha: 0.82),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    photo.kind.label,
                    style: AppTypography.caption(size: 10, weight: FontWeight.w600, color: AppColors.onPrimary),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Full-screen, swipeable photo gallery.
class PhotoGalleryScreen extends StatefulWidget {
  const PhotoGalleryScreen({super.key, required this.photos, this.initialIndex = 0});

  final List<ReportPhoto> photos;
  final int initialIndex;

  static Future<void> open(BuildContext context, List<ReportPhoto> photos, {int initialIndex = 0}) {
    return Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PhotoGalleryScreen(photos: photos, initialIndex: initialIndex),
      ),
    );
  }

  @override
  State<PhotoGalleryScreen> createState() => _PhotoGalleryScreenState();
}

class _PhotoGalleryScreenState extends State<PhotoGalleryScreen> {
  late final PageController _controller = PageController(initialPage: widget.initialIndex);
  late int _index = widget.initialIndex;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final photo = widget.photos[_index];
    return Scaffold(
      backgroundColor: AppColors.darkBlue,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.onPrimary,
        title: Text(
          '${photo.kind.label} photo',
          style: AppTypography.headingStyle(size: 17, color: AppColors.onPrimary),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(
              child: Text(
                '${_index + 1}/${widget.photos.length}',
                style: AppTypography.bodyStyle(size: 14, color: AppColors.lightBlue),
              ),
            ),
          ),
        ],
      ),
      body: PageView.builder(
        controller: _controller,
        itemCount: widget.photos.length,
        onPageChanged: (i) => setState(() => _index = i),
        itemBuilder: (context, i) => InteractiveViewer(
          maxScale: 4,
          child: Center(
            child: CachedNetworkImage(
              imageUrl: widget.photos[i].url,
              httpHeaders: SessionTokens.authHeaders(isPublic: widget.photos[i].isPublic),
              fit: BoxFit.contain,
              placeholder: (_, _) => const Center(
                child: SizedBox(
                  width: 28,
                  height: 28,
                  child: CircularProgressIndicator(color: AppColors.lightBlue),
                ),
              ),
              errorWidget: (_, _, _) => const Center(
                child: Icon(Icons.broken_image_outlined, color: AppColors.lightBlue, size: 40),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
