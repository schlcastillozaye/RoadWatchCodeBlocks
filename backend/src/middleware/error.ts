import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

interface NormalizedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

function normalize(err: unknown): NormalizedError {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details };
  }

  if (err instanceof ZodError) {
    return {
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
    };
  }

  if (err instanceof MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `File too large. Maximum size is ${Math.round(env.storage.maxUploadBytes / (1024 * 1024))} MB.`
        : `Upload error: ${err.message}`;
    return { status, code: `UPLOAD_${err.code}`, message };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | string | undefined) ?? 'field';
      return {
        status: 409,
        code: 'DUPLICATE',
        message: `A record with this ${Array.isArray(target) ? target.join(', ') : target} already exists.`,
      };
    }
    if (err.code === 'P2025') {
      return { status: 404, code: 'NOT_FOUND', message: 'Resource not found.' };
    }
    return { status: 400, code: `PRISMA_${err.code}`, message: 'Database request error.' };
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return { status: 400, code: 'DB_VALIDATION', message: 'Invalid data supplied to the database.' };
  }

  if (err instanceof Error) {
    return { status: 500, code: 'INTERNAL_ERROR', message: env.isProd ? 'Internal server error' : err.message };
  }

  return { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const { status, code, message, details } = normalize(err);

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${status}`, err);
  } else {
    logger.debug(`${req.method} ${req.originalUrl} -> ${status} ${code}`);
  }

  res.status(status).json({
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  });
}
