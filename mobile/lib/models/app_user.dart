import '../core/json.dart';
import 'enums.dart';

class AppUser {
  const AppUser({
    required this.id,
    required this.fullName,
    required this.email,
    required this.role,
    this.phone,
    this.status = 'ACTIVE',
    this.avatarUrl,
  });

  final String id;
  final String fullName;
  final String email;
  final UserRole role;
  final String? phone;
  final String status;
  final String? avatarUrl;

  bool get isAdmin => role == UserRole.admin;
  bool get isOfficer => role == UserRole.maintenanceOfficer;
  bool get isCitizen => role == UserRole.citizen;

  String get initials {
    final parts = fullName.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
  }

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        id: asString(json['id']),
        fullName: asString(json['fullName'], 'Unknown user'),
        email: asString(json['email']),
        phone: asStringOrNull(json['phone']),
        role: UserRole.fromApi(asStringOrNull(json['role'])),
        status: asString(json['status'], 'ACTIVE'),
        avatarUrl: asStringOrNull(json['avatarUrl']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'fullName': fullName,
        'email': email,
        'phone': phone,
        'role': role.api,
        'status': status,
        'avatarUrl': avatarUrl,
      };
}
