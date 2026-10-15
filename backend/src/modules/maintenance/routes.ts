import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { listReportsQuerySchema } from '../reports/schemas';
import { listAssignmentsForOfficer, officerSummary } from '../reports/service';

const router = Router();

// Maintenance endpoints are for maintenance officers (admins use the reports API).
router.use(authenticate, requireRole('MAINTENANCE_OFFICER'));

router.get(
  '/assignments',
  validate({ query: listReportsQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await listAssignmentsForOfficer(req.auth!.id, req.query as never);
    res.json(result);
  }),
);

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    res.json(await officerSummary(req.auth!.id));
  }),
);

export default router;
