import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { recordAudit } from '../../utils/audit';
import { userToDto } from '../reports/dto';
import { hashPassword, verifyPassword } from '../auth/service';
import type { changePasswordSchema, createUserSchema, listUsersQuerySchema, updateProfileSchema, updateUserSchema } from './schemas';

type CreateUserInput = z.infer<typeof createUserSchema>;
type UpdateUserInput = z.infer<typeof updateUserSchema>;
type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

interface Actor {
  id: string;
  role: 'CITIZEN' | 'MAINTENANCE_OFFICER' | 'ADMIN';
}

export async function listUsers(query: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {};
  if (query.role) where.role = query.role;
  if (query.status) where.status = query.status;
  if (query.search) {
    where.OR = [
      { fullName: { contains: query.search } },
      { email: { contains: query.search } },
      { phone: { contains: query.search } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    items: rows.map(userToDto),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function listOfficers() {
  const rows = await prisma.user.findMany({
    where: { role: 'MAINTENANCE_OFFICER', status: 'ACTIVE' },
    orderBy: { fullName: 'asc' },
  });

  const withLoad = await Promise.all(
    rows.map(async (officer) => {
      const [active, completed] = await Promise.all([
        prisma.report.count({
          where: { assignedOfficerId: officer.id, repairStatus: { in: ['AWAITING_MAINTENANCE', 'IN_PROGRESS'] } },
        }),
        prisma.report.count({ where: { assignedOfficerId: officer.id, repairStatus: 'COMPLETED' } }),
      ]);
      return { ...userToDto(officer), activeAssignments: active, completedAssignments: completed };
    }),
  );

  return withLoad;
}

export async function createUser(actor: Actor, input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw AppError.conflict('A user with this email already exists.');

  const user = await prisma.user.create({
    data: {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone ?? null,
      role: input.role,
      passwordHash: await hashPassword(input.password),
      status: 'ACTIVE',
    },
  });

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'USER_CREATED',
    entityType: 'User',
    entityId: user.id,
    metadata: { role: user.role, email: user.email },
  });

  return userToDto(user);
}

export async function updateUser(actor: Actor, userId: string, input: UpdateUserInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('User not found.');

  if (userId === actor.id && input.status === 'SUSPENDED') {
    throw AppError.badRequest('You cannot suspend your own account.');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.fullName ? { fullName: input.fullName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
  });

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'USER_UPDATED',
    entityType: 'User',
    entityId: userId,
    metadata: { changes: input as never },
  });

  return userToDto(updated);
}

export async function adminResetPassword(actor: Actor, userId: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('User not found.');

  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'PASSWORD_RESET',
    entityType: 'User',
    entityId: userId,
  });

  return { success: true };
}

export async function updateOwnProfile(userId: string, input: UpdateProfileInput) {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.fullName ? { fullName: input.fullName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
    },
  });
  return userToDto(updated);
}

export async function changeOwnPassword(userId: string, input: ChangePasswordInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('User not found.');

  const ok = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!ok) throw AppError.unauthenticated('Current password is incorrect.');

  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(input.newPassword) } });
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

  return { success: true };
}
