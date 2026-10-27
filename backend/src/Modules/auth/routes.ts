import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { recordAudit } from '../../utils/audit';
import { loginSchema, refreshSchema, registerSchema } from './schemas';
import * as authService from './service';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' } },
});

function meta(req: { headers: Record<string, unknown>; ip?: string }) {
  return {
    userAgent: typeof req.headers['user-agent'] === 'string' ? (req.headers['user-agent'] as string) : null,
    ipAddress: req.ip ?? null,
  };
}

router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.registerCitizen(req.body);
    await recordAudit({
      actorId: result.user.id,
      actorRole: 'CITIZEN',
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: result.user.id,
      ipAddress: req.ip,
    });
    res.status(201).json(result);
  }),
);

router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body, meta(req));
    await recordAudit({
      actorId: result.user.id,
      actorRole: result.user.role as never,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: result.user.id,
      ipAddress: req.ip,
    });
    res.json(result);
  }),
);

router.post(
  '/refresh',
  authLimiter,
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.refresh(req.body.refreshToken, meta(req));
    res.json(result);
  }),
);

router.post(
  '/logout',
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    await authService.logout(req.body.refreshToken);
    res.json({ success: true });
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: await authService.getCurrentUser(req.auth!.id) });
  }),
);

export default router;
