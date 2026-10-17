import type { ModerationStatus, PhotoKind, Prisma } from '@prisma/client';
import { env } from '../../config/env';

/** URL clients should use to fetch a stored photo (authorisation enforced server-side). */
export function photoUrl(storageKey: string): string {
  const base = env.storage.publicBaseUrl.replace(/\/$/, '');
  return `${base}/api/files/by-key/${storageKey
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')}`;
}

export const reportInclude = {
  photos: { orderBy: { createdAt: 'asc' } },
  citizen: { select: { id: true, fullName: true } },
  assignedOfficer: { select: { id: true, fullName: true, email: true } },
  moderatedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ReportInclude;

export type ReportWithRelations = Prisma.ReportGetPayload<{ include: typeof reportInclude }>;
export type PhotoRow = ReportWithRelations['photos'][number];

export function photoToDto(photo: PhotoRow, moderation: ModerationStatus) {
  return {
    id: photo.id,
    kind: photo.kind as PhotoKind,
    url: photoUrl(photo.storageKey),
    mimeType: photo.mimeType,
    sizeBytes: photo.sizeBytes,
    width: photo.width,
    height: photo.height,
    caption: photo.caption,
    /** Public photos (approved reports) need no Authorization header to load. */
    isPublic: moderation === 'APPROVED',
    createdAt: photo.createdAt,
  };
}

export interface SerializeOptions {
  /** Public/map view: hides reporter identity and moderation internals. */
  publicView?: boolean;
}

export function reportToDto(report: ReportWithRelations, options: SerializeOptions = {}) {
  const { publicView = false } = options;

  const base = {
    id: report.id,
    referenceNo: report.referenceNo,
    title: report.title,
    description: report.description,
    category: report.category,
    priority: report.priority,
    latitude: report.latitude,
    longitude: report.longitude,
    addressText: report.addressText,
    areaLabel: report.areaLabel,
    moderationStatus: report.moderationStatus,
    repairStatus: report.repairStatus,
    photos: report.photos.map((p) => photoToDto(p, report.moderationStatus)),
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };

  if (publicView) return base;

  return {
    ...base,
    rejectionReason: report.rejectionReason,
    moderatedAt: report.moderatedAt,
    moderatedBy: report.moderatedBy ? { id: report.moderatedBy.id, fullName: report.moderatedBy.fullName } : null,
    assignedAt: report.assignedAt,
    completedAt: report.completedAt,
    completionNotes: report.completionNotes,
    completionOverride: report.completionOverride,
    citizen: report.citizen ? { id: report.citizen.id, fullName: report.citizen.fullName } : null,
    assignedOfficer: report.assignedOfficer
      ? { id: report.assignedOfficer.id, fullName: report.assignedOfficer.fullName }
      : null,
  };
}

export function userToDto(user: {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  avatarKey: string | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarKey ? photoUrl(user.avatarKey) : null,
    createdAt: user.createdAt,
  };
}
