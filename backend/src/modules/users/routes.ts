import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { getCurrentUser } from '../auth/service';
import {
  changePasswordSchema,
  createUserSchema,
  idParamSchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  updateProfileSchema,
  updateUserSchema,
} from './schemas';
import * as users from './service';

const router = Router();

router.use(authenticate);

// --- self service -----------------------------------------------------------

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ user: await getCurrentUser(req.auth!.id) });
  }),
);

router.patch(
  '/me',
  validate({ body: updateProfileSchema }),
  asyncHandler(async (req, res) => {
    res.json({ user: await users.updateOwnProfile(req.auth!.id, req.body) });
  }),
);

router.post(
  '/me/password',
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    res.json(await users.changeOwnPassword(req.auth!.id, req.body));
  }),
);

// --- administration ---------------------------------------------------------

router.get(
  '/officers',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ officers: await users.listOfficers() });
  }),
);

router.get(
  '/',
  requireAdmin,
  validate({ query: listUsersQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await users.listUsers(req.query as never));
  }),
);

router.post(
  '/',
  requireAdmin,
  validate({ body: createUserSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ user: await users.createUser(req.auth!, req.body) });
  }),
);

router.patch(
  '/:id',
  requireAdmin,
  validate({ params: idParamSchema, body: updateUserSchema }),
  asyncHandler(async (req, res) => {
    res.json({ user: await users.updateUser(req.auth!, req.params.id, req.body) });
  }),
);

router.post(
  '/:id/reset-password',
  requireAdmin,
  validate({ params: idParamSchema, body: resetPasswordSchema }),
  asyncHandler(async (req, res) => {
    res.json(await users.adminResetPassword(req.auth!, req.params.id, req.body.newPassword));
  }),
);

export default router;
