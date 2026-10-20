export type Role = 'CITIZEN' | 'MAINTENANCE_OFFICER' | 'ADMIN';

export type IssueCategory =
  | 'POTHOLE'
  | 'DAMAGED_PAVEMENT'
  | 'ROAD_CRACK'
  | 'FLOODING'
  | 'DAMAGED_DRAINAGE'
  | 'ROAD_OBSTRUCTION'
  | 'OTHER';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type ModerationStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export type RepairStatus = 'NOT_ASSIGNED' | 'AWAITING_MAINTENANCE' | 'IN_PROGRESS' | 'AWAITING_VERIFICATION' | 'RETURNED_FOR_WORK' | 'COMPLETED' | 'VERIFIED_COMPLETED';

export type PhotoKind = 'BEFORE' | 'PROGRESS' | 'AFTER';

export type HistoryType = 'CREATION' | 'MODERATION' | 'ASSIGNMENT' | 'REPAIR' | string;

export interface UserSummary {
  id: string;
  fullName: string;
  email?: string;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role;
  status: 'ACTIVE' | 'SUSPENDED' | string;
  avatarUrl: string | null;
  createdAt?: string;
}

export interface Officer extends User {
  activeAssignments?: number;
  completedAssignments?: number;
}

export interface ReportPhoto {
  id: string;
  kind: PhotoKind;
  url: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  caption: string | null;
  isPublic: boolean;
  createdAt: string;
}

export interface Report {
  id: string;
  referenceNo: string;
  title: string;
  description: string;
  category: IssueCategory;
  priority: Priority;
  latitude: number;
  longitude: number;
  addressText: string | null;
  areaLabel: string | null;
  moderationStatus: ModerationStatus;
  repairStatus: RepairStatus;
  photos: ReportPhoto[];
  createdAt: string;
  updatedAt: string;
  // Staff-only fields
  rejectionReason?: string | null;
  moderatedAt?: string | null;
  moderatedBy?: UserSummary | null;
  assignedAt?: string | null;
  completedAt?: string | null;
  completionNotes?: string | null;
  completionOverride?: boolean;
  citizen?: UserSummary | null;
  assignedOfficer?: UserSummary | null;
}

export interface PublicMapReport {
  id: string;
  referenceNo: string;
  title: string;
  category: IssueCategory;
  priority: Priority;
  latitude: number;
  longitude: number;
  addressText: string | null;
  areaLabel: string | null;
  repairStatus: RepairStatus;
  moderationStatus: ModerationStatus;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string | null;
}

export interface StatusHistoryEntry {
  id: string;
  reportId: string;
  type: HistoryType;
  fromValue: string | null;
  toValue: string;
  note: string | null;
  actorRole: Role | null;
  actor?: UserSummary | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** A place returned by forward geocoding (address / landmark search). */
export interface PlaceResult {
  address: string;
  lat: number;
  lng: number;
  areaLabel: string | null;
}

/**
 * Response from the optional geocoding endpoint. `available: false` means the
 * server had no key or Google refused — callers fall back to text filtering.
 */
export interface PlaceSearchResponse {
  available: boolean;
  results: PlaceResult[];
  reason: string | null;
}

export interface Statistics {
  totals: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    notAssigned: number;
    awaiting: number;
    inProgress: number;
    completed: number;
  };
  byCategory: { category: IssueCategory; count: number }[];
  byArea: { area: string; count: number }[];
  recent: Report[];
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; fullName: string; role: Role } | null;
}

export interface OfficerNotification {
  id: string;
  assignmentId: string;
  reportId: string;
  referenceNo: string;
  title: string;
  message: string;
  category: IssueCategory;
  location: string;
  repairStatus: RepairStatus;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface ReportQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: IssueCategory;
  priority?: Priority;
  moderationStatus?: ModerationStatus;
  repairStatus?: RepairStatus;
  assignedOfficerId?: string;
  areaLabel?: string;
  from?: string;
  to?: string;
  sort?: 'newest' | 'oldest' | 'priority';
}
