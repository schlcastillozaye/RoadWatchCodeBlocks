import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { listAuditLogs, reportStatistics } from '../reports/service';

const router = Router();

router.use(authenticate, requireAdmin);

router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    res.json(await reportStatistics());
  }),
);

router.get(
  '/audit-logs',
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }) }),
  asyncHandler(async (req, res) => {
    const { limit } = req.query as unknown as { limit: number };
    res.json({ logs: await listAuditLogs(limit) });
  }),
);

export default router;
