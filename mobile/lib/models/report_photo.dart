import '../core/app_config.dart';
import '../core/json.dart';
import 'enums.dart';

class ReportPhoto {
  const ReportPhoto({
    required this.id,
    required this.kind,
    required this.url,
    required this.mimeType,
    this.sizeBytes = 0,
    this.width,
    this.height,
    this.isPublic = false,
    this.caption,
    this.createdAt,
    this.uploadedByName,
    this.uploadedByRole,
  });

  final String id;
  final PhotoKind kind;

  /// Absolute URL ready for network image loading.
  final String url;
  final String mimeType;
  final int sizeBytes;
  final int? width;
  final int? height;

  /// True when the parent report is approved (no auth header required).
  final bool isPublic;
  final String? caption;
  final DateTime? createdAt;
  final String? uploadedByName;
  final String? uploadedByRole;

  double get aspectRatio {
    if (width != null && height != null && height! > 0) return width! / height!;
    return 4 / 3;
  }

  factory ReportPhoto.fromJson(Map<String, dynamic> json) => ReportPhoto(
    id: asString(json['id']),
    kind: PhotoKind.fromApi(asStringOrNull(json['kind'])),
    url: AppConfig.absoluteUrl(asString(json['url'])),
    mimeType: asString(json['mimeType'], 'image/jpeg'),
    sizeBytes: asInt(json['sizeBytes']),
    width: asIntOrNull(json['width']),
    height: asIntOrNull(json['height']),
    isPublic: asBool(json['isPublic']),
    caption: asStringOrNull(json['caption']),
    createdAt: asDate(json['createdAt']),
    uploadedByName: json['uploadedBy'] is Map
        ? asStringOrNull((json['uploadedBy'] as Map)['fullName'])
        : null,
    uploadedByRole: json['uploadedBy'] is Map
        ? asStringOrNull((json['uploadedBy'] as Map)['role'])
        : null,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'kind': kind.api,
    'url': url,
    'mimeType': mimeType,
    'sizeBytes': sizeBytes,
    'width': width,
    'height': height,
    'isPublic': isPublic,
    'caption': caption,
    'createdAt': createdAt?.toIso8601String(),
    'uploadedBy': uploadedByName == null
        ? null
        : {'fullName': uploadedByName, 'role': uploadedByRole},
  };
}
