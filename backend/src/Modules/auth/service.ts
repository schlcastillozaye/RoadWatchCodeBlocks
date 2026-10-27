import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Prisma, User } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { parseTtlToMs } from '../../utils/ttl';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../middleware/auth';
import { userToDto } from '../reports/dto';

const BCRYPT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

interface RequestMeta {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface AuthResult {
  user: ReturnType<typeof userToDto>;
  accessToken: string;
  refreshToken: string;
}

async function issueTokens(user: User, meta: RequestMeta = {}): Promise<AuthResult> {
  const jti = crypto.randomUUID();
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user.id, jti);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + parseTtlToMs(env.jwt.refreshTtl, 30 * 86_400_000)),
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    },
  });

  return { user: userToDto(user), accessToken, refreshToken };
}

export async function registerCitizen(input: {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<{ user: ReturnType<typeof userToDto> }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw AppError.conflict('An account with this email already exists.');

  const user = await prisma.user.create({
    data: {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone ?? null,
      passwordHash: await hashPassword(input.password),
      role: 'CITIZEN',
      status: 'ACTIVE',
    },
  });

  return { user: userToDto(user) };
}

export async function login(input: { email: string; password: string }, meta: RequestMeta = {}): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw AppError.unauthenticated('Invalid email or password.');

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw AppError.unauthenticated('Invalid email or password.');

  if (user.status === 'SUSPENDED') {
    throw AppError.forbidden('This account has been suspended. Contact an administrator.');
  }

  return issueTokens(user, meta);
}

/** Rotates a refresh token: the old one is revoked and a new pair issued. */
export async function refresh(refreshToken: string, meta: RequestMeta = {}): Promise<AuthResult> {
  const payload = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
    throw AppError.unauthenticated('Refresh token is no longer valid.');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status === 'SUSPENDED') {
    throw AppError.unauthenticated('Account is not available.');
  }

  // Revoke the used token (rotation).
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  return issueTokens(user, meta);
}

export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  await prisma.refreshToken
    .updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } })
    .catch(() => undefined);
}

export async function logoutAll(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('User not found.');
  return userToDto(user);
}

export type { Prisma };
