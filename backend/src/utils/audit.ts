import type { AuditLog, HistoryType, Prisma, Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';

interface AuditInput {
  actorId?: string | null;
  actorRole?: Role | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Appends an audit-log entry. Never throws into the caller. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: input.metadata,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.warn('Failed to write audit log', err);
  }
}

interface HistoryInput {
  reportId: string;
  type: HistoryType;
  fromValue?: string | null;
  toValue: string;
  note?: string | null;
  actorId?: string | null;
  actorRole?: Role | null;
  tx?: Prisma.TransactionClient;
}

/** Appends an immutable status-history row (also works inside a transaction). */
export async function recordHistory(input: HistoryInput): Promise<void> {
  const client = input.tx ?? prisma;
  await client.statusHistory.create({
    data: {
      reportId: input.reportId,
      type: input.type,
      fromValue: input.fromValue ?? null,
      toValue: input.toValue,
      note: input.note ?? null,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
    },
  });
}

export type { AuditLog };
