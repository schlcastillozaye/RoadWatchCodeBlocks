import { PrismaClient } from '@prisma/client';
import { env } from './env';

/**
 * Single shared Prisma client instance.
 * Reused across hot reloads in development to avoid connection exhaustion.
 */
declare global {
  // eslint-disable-next-line no-var
  var __roadwatchPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__roadwatchPrisma ??
  new PrismaClient({
    log: env.isProd ? ['error', 'warn'] : ['error', 'warn'],
  });

if (!env.isProd) global.__roadwatchPrisma = prisma;
