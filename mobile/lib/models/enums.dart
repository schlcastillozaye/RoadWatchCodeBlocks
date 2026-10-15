import 'package:flutter/material.dart';

/// Domain enums mirrored from the backend API.
/// Keeping a single source of truth avoids stringly-typed UI code.

enum UserRole {
  citizen,
  maintenanceOfficer,
  admin;

  static UserRole fromApi(String? value) => switch (value) {
        'ADMIN' => UserRole.admin,
        'MAINTENANCE_OFFICER' => UserRole.maintenanceOfficer,
        _ => UserRole.citizen,
      };

  String get api => switch (this) {
        UserRole.admin => 'ADMIN',
        UserRole.maintenanceOfficer => 'MAINTENANCE_OFFICER',
        UserRole.citizen => 'CITIZEN',
      };

  String get label => switch (this) {
        UserRole.admin => 'Administrator',
        UserRole.maintenanceOfficer => 'Maintenance Officer',
        UserRole.citizen => 'Citizen',
      };
}

enum IssueCategory {
  pothole,
  damagedPavement,
  roadCrack,
  flooding,
  damagedDrainage,
  other;

  static IssueCategory fromApi(String? value) => switch (value) {
        'POTHOLE' => IssueCategory.pothole,
        'DAMAGED_PAVEMENT' => IssueCategory.damagedPavement,
        'ROAD_CRACK' => IssueCategory.roadCrack,
        'FLOODING' => IssueCategory.flooding,
        'DAMAGED_DRAINAGE' => IssueCategory.damagedDrainage,
        _ => IssueCategory.other,
      };

  String get api => switch (this) {
        IssueCategory.pothole => 'POTHOLE',
        IssueCategory.damagedPavement => 'DAMAGED_PAVEMENT',
        IssueCategory.roadCrack => 'ROAD_CRACK',
        IssueCategory.flooding => 'FLOODING',
        IssueCategory.damagedDrainage => 'DAMAGED_DRAINAGE',
        IssueCategory.other => 'OTHER',
      };

  String get label => switch (this) {
        IssueCategory.pothole => 'Pothole',
        IssueCategory.damagedPavement => 'Damaged pavement',
        IssueCategory.roadCrack => 'Road crack',
        IssueCategory.flooding => 'Flooding',
        IssueCategory.damagedDrainage => 'Damaged drainage',
        IssueCategory.other => 'Other road issue',
      };

  IconData get icon => switch (this) {
        IssueCategory.pothole => Icons.trip_origin,
        IssueCategory.damagedPavement => Icons.grid_view_rounded,
        IssueCategory.roadCrack => Icons.timeline,
        IssueCategory.flooding => Icons.water_rounded,
        IssueCategory.damagedDrainage => Icons.water_damage_rounded,
        IssueCategory.other => Icons.flag_rounded,
      };
}

enum ModerationStatus {
  pendingReview,
  approved,
  rejected;

  static ModerationStatus fromApi(String? value) => switch (value) {
        'APPROVED' => ModerationStatus.approved,
        'REJECTED' => ModerationStatus.rejected,
        _ => ModerationStatus.pendingReview,
      };

  String get api => switch (this) {
        ModerationStatus.pendingReview => 'PENDING_REVIEW',
        ModerationStatus.approved => 'APPROVED',
        ModerationStatus.rejected => 'REJECTED',
      };

  String get label => switch (this) {
        ModerationStatus.pendingReview => 'Pending review',
        ModerationStatus.approved => 'Approved',
        ModerationStatus.rejected => 'Rejected',
      };
}

enum RepairStatus {
  notAssigned,
  awaitingMaintenance,
  inProgress,
  completed;

  static RepairStatus fromApi(String? value) => switch (value) {
        'AWAITING_MAINTENANCE' => RepairStatus.awaitingMaintenance,
        'IN_PROGRESS' => RepairStatus.inProgress,
        'COMPLETED' => RepairStatus.completed,
        _ => RepairStatus.notAssigned,
      };

  String get api => switch (this) {
        RepairStatus.notAssigned => 'NOT_ASSIGNED',
        RepairStatus.awaitingMaintenance => 'AWAITING_MAINTENANCE',
        RepairStatus.inProgress => 'IN_PROGRESS',
        RepairStatus.completed => 'COMPLETED',
      };

  String get label => switch (this) {
        RepairStatus.notAssigned => 'Not assigned',
        RepairStatus.awaitingMaintenance => 'Awaiting maintenance',
        RepairStatus.inProgress => 'In progress',
        RepairStatus.completed => 'Completed',
      };
}

enum PhotoKind {
  before,
  progress,
  after;
  static PhotoKind fromApi(String? value) => switch (value) {
        'PROGRESS' => PhotoKind.progress,
        'AFTER' => PhotoKind.after,
        _ => PhotoKind.before,
      };

  String get api => switch (this) {
        PhotoKind.before => 'BEFORE',
        PhotoKind.progress => 'PROGRESS',
        PhotoKind.after => 'AFTER',
      };

  String get label => switch (this) {
        PhotoKind.before => 'Before',
        PhotoKind.progress => 'Progress',
        PhotoKind.after => 'After',
      };
}

enum Priority {
  low,
  medium,
  high,
  urgent;

  static Priority fromApi(String? value) => switch (value) {
        'LOW' => Priority.low,
        'HIGH' => Priority.high,
        'URGENT' => Priority.urgent,
        _ => Priority.medium,
      };

  String get api => switch (this) {
        Priority.low => 'LOW',
        Priority.medium => 'MEDIUM',
        Priority.high => 'HIGH',
        Priority.urgent => 'URGENT',
      };

  String get label => switch (this) {
        Priority.low => 'Low',
        Priority.medium => 'Medium',
        Priority.high => 'High',
        Priority.urgent => 'Urgent',
      };
}
