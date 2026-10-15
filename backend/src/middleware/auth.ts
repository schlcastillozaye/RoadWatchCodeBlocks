import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { AppError } from '../utils/errors';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  email: string;
  fullName: string;
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  jti: string;
}

export function signAccessToken(user: { id: string; role: Role; email: string; fullName: string }): string {
  const payload: AccessTokenPayload = {
    sub: user.id,
    role: user.role,
    email: user.email,
    fullName: user.fullName,
  };
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtl as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(userId: string, jti: string): string {
  const payload: RefreshTokenPayload = { sub: userId, type: 'refresh', jti };
  return jwt.sign(payload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtl as jwt.SignOptions['expiresIn'],
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const payload = jwt.verify(token, env.jwt.refreshSecret) as RefreshTokenPayload;
    if (payload.type !== 'refresh') throw new Error('wrong token type');
    return payload;
  } catch {
    throw AppError.unauthenticated('Invalid or expired refresh token');
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/** Requires a valid access token; attaches `req.auth`. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  if (!token) throw AppError.unauthenticated();
  try {
    const payload = jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
    req.auth = { id: payload.sub, role: payload.role, email: payload.email, fullName: payload.fullName };
    next();
  } catch {
    throw AppError.unauthenticated('Invalid or expired access token');
  }
}

/** Attaches `req.auth` when a valid token is present, but never rejects. */
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  if (token) {
    try {
      const payload = jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
      req.auth = { id: payload.sub, role: payload.role, email: payload.email, fullName: payload.fullName };
    } catch {
      /* ignore invalid token for optional auth */
    }
  }
  next();
}
