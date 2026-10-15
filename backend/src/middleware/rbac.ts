import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { AppError } from '../utils/errors';

/** Allows the request only when the authenticated user holds one of `roles`. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) throw AppError.unauthenticated();
    if (!roles.includes(req.auth.role)) {
      throw AppError.forbidden(`Requires one of roles: ${roles.join(', ')}`);
    }
    next();
  };
}

export const requireAdmin = requireRole('ADMIN');
export const requireOfficer = requireRole('MAINTENANCE_OFFICER');
export const requireStaff = requireRole('ADMIN', 'MAINTENANCE_OFFICER');

/** Guards administrative override actions (e.g. completing without photos). */
export function requireAdminOverride(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) throw AppError.unauthenticated();
  if (req.auth.role !== 'ADMIN') throw AppError.forbidden('Administrator authorization required');
  next();
}
