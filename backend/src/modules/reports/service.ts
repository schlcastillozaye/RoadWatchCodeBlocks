import type { ModerationStatus, PhotoKind, Prisma, RepairStatus, Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { nextReferenceNo } from '../../utils/reference';
import { recordAudit, recordHistory } from '../../utils/audit';
import { getImageProcessing } from '../../services/imageProcessing';
import { discardStored, persistPhotos, storeBuffers } from '../uploads/service';
import { photoUrl, reportInclude, reportToDto, type ReportWithRelations } from './dto';
import type { AssignInput, CreateReportInput, ListReportsQuery, ModerationInput, RepairUpdateInput } from './types';

interface Actor {
  id: string;
  role: Role;
}

// ---------------------------------------------------------------------------
//  Access control
// ---------------------------------------------------------------------------

/** Public map visibility: ONLY approved reports, never pending/rejected. */
export function isPubliclyVisible(status: ModerationStatus): boolean {
  return status === 'APPROVED';
}

export function canViewReport(
  report: { citizenId: string; assignedOfficerId: string | null; moderationStatus: ModerationStatus },
  actor?: Actor,
): boolean {
  if (!actor) return isPubliclyVisible(report.moderationStatus);
  if (actor.role === 'ADMIN') return true;
  if (actor.role === 'MAINTENANCE_OFFICER') {
    return report.assignedOfficerId === actor.id || isPubliclyVisible(report.moderationStatus);
  }
  return report.citizenId === actor.id;
}

// ---------------------------------------------------------------------------
//  Queries
// ---------------------------------------------------------------------------

export async function getReportOrThrow(id: string): Promise<ReportWithRelations> {
  const report = await prisma.report.findUnique({ where: { id }, include: reportInclude });
  if (!report) throw AppError.notFound('Report not found.');
  return report;
}

export async function getReportForActor(id: string, actor?: Actor) {
  const report = await getReportOrThrow(id);
  if (!canViewReport(report, actor)) throw AppError.forbidden('You do not have access to this report.');
  return reportToDto(report, { publicView: !actor });
}

export async function getReportHistory(id: string, actor?: Actor) {
  await getReportForActor(id, actor);
  return prisma.statusHistory.findMany({
    where: { reportId: id },
    orderBy: { createdAt: 'asc' },
    include: { actor: { select: { id: true, fullName: true } } },
  });
}

export async function listReportsForCitizen(citizenId: string, query: ListReportsQuery) {
  const where: Prisma.ReportWhereInput = { citizenId };
  applyCommonFilters(where, query);

  const [total, rows] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.findMany({ where, include: reportInclude, ...pagination(query), orderBy: orderFor(query.sort) }),
  ]);

  return {
    items: rows.map((r) => reportToDto(r)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function listReportsForStaff(query: ListReportsQuery) {
  const where: Prisma.ReportWhereInput = {};
  applyCommonFilters(where, query);
  if (query.assignedOfficerId) where.assignedOfficerId = query.assignedOfficerId;
  if (query.citizenId) where.citizenId = query.citizenId;

  const [total, rows] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.findMany({ where, include: reportInclude, ...pagination(query), orderBy: orderFor(query.sort) }),
  ]);

  return {
    items: rows.map((r) => reportToDto(r)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function listPublicReports(query: ListReportsQuery) {
  const where: Prisma.ReportWhereInput = { moderationStatus: 'APPROVED' };
  if (query.category) where.category = query.category;
  if (query.repairStatus) where.repairStatus = query.repairStatus;
  if (query.areaLabel) where.areaLabel = { contains: query.areaLabel };
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }
  // Public-safe text search: only fields a citizen could already see.
  if (query.search) {
    const s = query.search;
    where.OR = [
      { title: { contains: s } },
      { referenceNo: { contains: s } },
      { addressText: { contains: s } },
      { areaLabel: { contains: s } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      include: { photos: { where: { kind: 'BEFORE' }, take: 1, orderBy: { createdAt: 'asc' } } },
      ...pagination(query),
      orderBy: orderFor(query.sort),
    }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      referenceNo: r.referenceNo,
      title: r.title,
      category: r.category,
      priority: r.priority,
      latitude: r.latitude,
      longitude: r.longitude,
      addressText: r.addressText,
      areaLabel: r.areaLabel,
      repairStatus: r.repairStatus,
      moderationStatus: r.moderationStatus,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      thumbnailUrl: r.photos[0] ? photoUrl(r.photos[0].storageKey) : null,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

function pagination(query: ListReportsQuery) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

function orderFor(sort: ListReportsQuery['sort']): Prisma.ReportOrderByWithRelationInput[] {
  if (sort === 'oldest') return [{ createdAt: 'asc' }];
  if (sort === 'priority') return [{ priority: 'desc' }, { createdAt: 'desc' }];
  return [{ createdAt: 'desc' }];
}

function applyCommonFilters(where: Prisma.ReportWhereInput, query: ListReportsQuery) {
  if (query.category) where.category = query.category;
  if (query.priority) where.priority = query.priority;
  if (query.moderationStatus) where.moderationStatus = query.moderationStatus;
  if (query.repairStatus) where.repairStatus = query.repairStatus;
  if (query.areaLabel) where.areaLabel = { contains: query.areaLabel };
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }
  if (query.search) {
    const s = query.search;
    where.OR = [
      { title: { contains: s } },
      { description: { contains: s } },
      { referenceNo: { contains: s } },
      { addressText: { contains: s } },
      { areaLabel: { contains: s } },
    ];
  }
}

// ---------------------------------------------------------------------------
//  Submission
// ---------------------------------------------------------------------------

export async function createReport(params: {
  actor: Actor;
  input: CreateReportInput;
  files: Express.Multer.File[];
}) {
  const { actor, input, files } = params;
  if (!files || files.length < 1) {
    throw AppError.badRequest('At least one photo of the issue is required.');
  }

  // 1) Persist images to storage first (filesystem/object IO outside the DB tx).
  const storedPhotos = await storeBuffers(files, 'reports');

  try {
    const report = await prisma.$transaction(async (tx) => {
      const referenceNo = await nextReferenceNo(tx);

      // Best-effort reverse-geocode label from the provided address text.
      const created = await tx.report.create({
        data: {
          referenceNo,
          title: input.title,
          description: input.description,
          category: input.category,
          priority: input.priority ?? 'MEDIUM',
          latitude: input.latitude,
          longitude: input.longitude,
          addressText: input.addressText ?? null,
          areaLabel: input.areaLabel ?? null,
          citizenId: actor.id,
          photos: {
            create: storedPhotos.map((p) => ({
              kind: 'BEFORE' as PhotoKind,
              storageKey: p.stored.key,
              mimeType: p.stored.mimeType,
              sizeBytes: p.stored.sizeBytes,
              width: p.width,
              height: p.height,
              uploadedById: actor.id,
            })),
          },
        },
        include: { photos: true },
      });

      await recordHistory({
        reportId: created.id,
        type: 'CREATION',
        toValue: 'PENDING_REVIEW',
        note: 'Report submitted by citizen.',
        actorId: actor.id,
        actorRole: actor.role,
        tx,
      });

      return created;
    });

    await recordAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'REPORT_CREATED',
      entityType: 'Report',
      entityId: report.id,
      metadata: { referenceNo: report.referenceNo, category: report.category },
    });

    // 7) Optional image analysis — never blocks submission.
    if (getImageProcessing().enabled) {
      for (const p of report.photos) {
        // lazy import avoids a cycle at module load time
        const { scheduleImageAnalysis } = await import('../../services/imageProcessing');
        scheduleImageAnalysis(report.id, p.id, photoUrl(p.storageKey));
      }
    }

    return reportToDto(await getReportOrThrow(report.id));
  } catch (err) {
    // Roll back orphaned files if the DB transaction failed.
    await discardStored(storedPhotos);
    throw err;
  }
}

export async function addReportPhotos(params: {
  reportId: string;
  actor: Actor;
  files: Express.Multer.File[];
  kind: PhotoKind;
}) {
  const report = await getReportOrThrow(params.reportId);
  const { actor } = params;

  const isOwner = report.citizenId === actor.id;
  const isAdmin = actor.role === 'ADMIN';
  const isAssignedOfficer = report.assignedOfficerId === actor.id;

  if (!isOwner && !isAdmin && !isAssignedOfficer) {
    throw AppError.forbidden('You cannot add photos to this report.');
  }
  // Citizens may only add "before" photos while the report is still pending.
  if (isOwner && !isAdmin && params.kind !== 'BEFORE') {
    throw AppError.forbidden('Only maintenance staff can add progress or completion photos.');
  }
  if (isOwner && !isAdmin && report.moderationStatus !== 'PENDING_REVIEW') {
    throw AppError.conflict('Photos can only be added while the report is pending review.');
  }

  const photos = await persistPhotos({
    reportId: report.id,
    files: params.files,
    kind: params.kind,
    uploadedById: actor.id,
  });

  await recordHistory({
    reportId: report.id,
    type: 'REPAIR',
    toValue: report.repairStatus,
    note: `${params.kind} photo(s) uploaded (${photos.length}).`,
    actorId: actor.id,
    actorRole: actor.role,
  });

  return reportToDto(await getReportOrThrow(report.id));
}

export async function deleteReport(reportId: string, actor: Actor) {
  const report = await getReportOrThrow(reportId);

  if (actor.role !== 'ADMIN') {
    if (report.citizenId !== actor.id) throw AppError.forbidden('You cannot delete this report.');
    if (report.moderationStatus !== 'PENDING_REVIEW') {
      throw AppError.conflict('Only reports still pending review can be withdrawn.');
    }
  }

  await prisma.report.delete({ where: { id: reportId } });
  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'REPORT_DELETED',
    entityType: 'Report',
    entityId: reportId,
    metadata: { referenceNo: report.referenceNo },
  });
  return { success: true };
}

// ---------------------------------------------------------------------------
//  Moderation (ADMIN only)
// ---------------------------------------------------------------------------

export async function moderateReport(reportId: string, actor: Actor, input: ModerationInput) {
  const report = await getReportOrThrow(reportId);

  if (report.moderationStatus !== 'PENDING_REVIEW') {
    throw AppError.conflict(`This report has already been ${report.moderationStatus.toLowerCase()}.`);
  }

  const approve = input.decision === 'APPROVE';
  const nextStatus: ModerationStatus = approve ? 'APPROVED' : 'REJECTED';

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.report.update({
      where: { id: reportId },
      data: {
        moderationStatus: nextStatus,
        rejectionReason: approve ? null : (input.reason ?? null),
        moderatedById: actor.id,
        moderatedAt: new Date(),
        ...(input.priority ? { priority: input.priority } : {}),
        // Approved reports await maintenance assignment; rejected stay unassigned.
        repairStatus: approve ? 'NOT_ASSIGNED' : report.repairStatus,
      },
      include: reportInclude,
    });

    await recordHistory({
      reportId,
      type: 'MODERATION',
      fromValue: report.moderationStatus,
      toValue: nextStatus,
      note: approve ? 'Report approved.' : `Report rejected: ${input.reason}`,
      actorId: actor.id,
      actorRole: actor.role,
      tx,
    });

    return result;
  });

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: approve ? 'REPORT_APPROVED' : 'REPORT_REJECTED',
    entityType: 'Report',
    entityId: reportId,
    metadata: { reason: input.reason ?? null, referenceNo: report.referenceNo },
  });

  return reportToDto(updated);
}

// ---------------------------------------------------------------------------
//  Assignment (ADMIN only)
// ---------------------------------------------------------------------------

export async function assignReport(reportId: string, actor: Actor, input: AssignInput) {
  const report = await getReportOrThrow(reportId);

  if (report.moderationStatus !== 'APPROVED') {
    throw AppError.conflict('Only approved reports can be assigned to maintenance.');
  }

  const officer = await prisma.user.findUnique({ where: { id: input.officerId } });
  if (!officer || officer.role !== 'MAINTENANCE_OFFICER') {
    throw AppError.badRequest('Selected user is not a maintenance officer.');
  }
  if (officer.status === 'SUSPENDED') {
    throw AppError.badRequest('Selected officer account is suspended.');
  }

  const previousOfficer = report.assignedOfficerId;

  const updated = await prisma.$transaction(async (tx) => {
    if (previousOfficer && previousOfficer !== officer.id) {
      await tx.assignment.updateMany({
        where: { reportId, officerId: previousOfficer, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
        data: { status: 'CANCELLED' },
      });
    }

    await tx.assignment.create({
      data: {
        reportId,
        officerId: officer.id,
        assignedById: actor.id,
        status: 'ASSIGNED',
        note: input.note ?? null,
        dueDate: input.dueDate ?? null,
      },
    });

    const result = await tx.report.update({
      where: { id: reportId },
      data: {
        assignedOfficerId: officer.id,
        assignedAt: new Date(),
        repairStatus: 'AWAITING_MAINTENANCE',
        ...(input.priority ? { priority: input.priority } : {}),
      },
      include: reportInclude,
    });

    await recordHistory({
      reportId,
      type: 'ASSIGNMENT',
      fromValue: previousOfficer ?? 'UNASSIGNED',
      toValue: officer.id,
      note: input.note ? `Assigned to ${officer.fullName}: ${input.note}` : `Assigned to ${officer.fullName}.`,
      actorId: actor.id,
      actorRole: actor.role,
      tx,
    });

    return result;
  });

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'REPORT_ASSIGNED',
    entityType: 'Report',
    entityId: reportId,
    metadata: { officerId: officer.id, officerName: officer.fullName },
  });

  return reportToDto(updated);
}

// ---------------------------------------------------------------------------
//  Maintenance (assigned officer, or admin)
// ---------------------------------------------------------------------------

function actorMayMaintain(report: ReportWithRelations, actor: Actor): boolean {
  if (actor.role === 'ADMIN') return true;
  return report.assignedOfficerId === actor.id;
}

export async function updateRepair(reportId: string, actor: Actor, input: RepairUpdateInput) {
  const report = await getReportOrThrow(reportId);

  if (report.moderationStatus !== 'APPROVED') {
    throw AppError.conflict('Only approved reports can receive maintenance updates.');
  }
  if (!actorMayMaintain(report, actor)) {
    throw AppError.forbidden('This report is not assigned to you.');
  }

  const targetStatus: RepairStatus | undefined = input.repairStatus;
  const wantsCompletion = targetStatus === 'COMPLETED';

  if (input.note && !targetStatus) {
    // A plain note is allowed without a status change.
  }

  let completionOverride = false;
  let completionNotes = input.completionNotes ?? report.completionNotes;

  if (wantsCompletion) {
    const afterPhotoCount = await prisma.reportPhoto.count({
      where: { reportId, kind: 'AFTER' },
    });
    const notesOk = Boolean(completionNotes && completionNotes.trim().length >= 5);

    if (!notesOk) {
      throw AppError.unprocessable('Completion notes are required to mark a repair as completed.');
    }
    if (afterPhotoCount < 1) {
      if (actor.role !== 'ADMIN' || !input.overrideCompletion) {
        throw AppError.unprocessable(
          'At least one completion (after) photo is required. An administrator may override this requirement.',
        );
      }
      completionOverride = true;
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.report.update({
      where: { id: reportId },
      data: {
        ...(targetStatus ? { repairStatus: targetStatus } : {}),
        ...(input.completionNotes ? { completionNotes } : {}),
        ...(wantsCompletion
          ? { completedAt: new Date(), completionOverride }
          : {}),
      },
      include: reportInclude,
    });

    if (targetStatus) {
      await recordHistory({
        reportId,
        type: 'REPAIR',
        fromValue: report.repairStatus,
        toValue: targetStatus,
        note: input.note ?? null,
        actorId: actor.id,
        actorRole: actor.role,
        tx,
      });

      await tx.assignment.updateMany({
        where: { reportId, officerId: report.assignedOfficerId ?? undefined, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
        data: {
          status: targetStatus === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
          ...(targetStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
        },
      });
    } else if (input.note) {
      await recordHistory({
        reportId,
        type: 'REPAIR',
        toValue: report.repairStatus,
        note: input.note,
        actorId: actor.id,
        actorRole: actor.role,
        tx,
      });
    }

    return result;
  });

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: wantsCompletion ? 'REPAIR_COMPLETED' : 'REPAIR_UPDATED',
    entityType: 'Report',
    entityId: reportId,
    metadata: { to: targetStatus ?? report.repairStatus, override: completionOverride },
  });

  // Optional before/after comparison — best effort only.
  if (wantsCompletion && getImageProcessing().enabled) {
    // reserved for future use; never blocks the response
  }

  return reportToDto(updated);
}

export async function listAssignmentsForOfficer(officerId: string, query: ListReportsQuery) {
  const where: Prisma.ReportWhereInput = { assignedOfficerId: officerId, moderationStatus: 'APPROVED' };
  applyCommonFilters(where, query);

  const [total, rows] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.findMany({ where, include: reportInclude, ...pagination(query), orderBy: orderFor(query.sort) }),
  ]);

  return {
    items: rows.map((r) => reportToDto(r)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function officerSummary(officerId: string) {
  const [assigned, inProgress, completed, awaiting] = await Promise.all([
    prisma.report.count({ where: { assignedOfficerId: officerId } }),
    prisma.report.count({ where: { assignedOfficerId: officerId, repairStatus: 'IN_PROGRESS' } }),
    prisma.report.count({ where: { assignedOfficerId: officerId, repairStatus: 'COMPLETED' } }),
    prisma.report.count({ where: { assignedOfficerId: officerId, repairStatus: 'AWAITING_MAINTENANCE' } }),
  ]);
  return { assigned, awaiting, inProgress, completed };
}

// ---------------------------------------------------------------------------
//  Statistics (dashboard)
// ---------------------------------------------------------------------------

export async function reportStatistics() {
  const [total, pending, approved, rejected, notAssigned, awaiting, inProgress, completed] = await Promise.all([
    prisma.report.count(),
    prisma.report.count({ where: { moderationStatus: 'PENDING_REVIEW' } }),
    prisma.report.count({ where: { moderationStatus: 'APPROVED' } }),
    prisma.report.count({ where: { moderationStatus: 'REJECTED' } }),
    prisma.report.count({ where: { repairStatus: 'NOT_ASSIGNED' } }),
    prisma.report.count({ where: { repairStatus: 'AWAITING_MAINTENANCE' } }),
    prisma.report.count({ where: { repairStatus: 'IN_PROGRESS' } }),
    prisma.report.count({ where: { repairStatus: 'COMPLETED' } }),
  ]);

  const byCategoryRaw = await prisma.report.groupBy({ by: ['category'], _count: { _all: true } });
  const byCategory = byCategoryRaw.map((r) => ({ category: r.category, count: r._count._all }));

  const byAreaRaw = await prisma.report.groupBy({
    by: ['areaLabel'],
    _count: { _all: true },
    where: { areaLabel: { not: null } },
    orderBy: { _count: { areaLabel: 'desc' } },
    take: 10,
  });
  const byArea = byAreaRaw.map((r) => ({ area: r.areaLabel ?? 'Unknown', count: r._count._all }));

  const recent = await prisma.report.findMany({
    take: 8,
    orderBy: { createdAt: 'desc' },
    include: reportInclude,
  });

  return {
    totals: { total, pending, approved, rejected, notAssigned, awaiting, inProgress, completed },
    byCategory,
    byArea,
    recent: recent.map((r) => reportToDto(r)),
  };
}

export async function listAuditLogs(limit = 100) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 500),
    include: { actor: { select: { id: true, fullName: true, role: true } } },
  });
}
