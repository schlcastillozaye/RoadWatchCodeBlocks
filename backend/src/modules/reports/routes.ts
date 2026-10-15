import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate, optionalAuthenticate } from '../../middleware/auth';
import { requireAdmin, requireStaff } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { uploadReportPhotos } from '../../middleware/upload';
import { AppError } from '../../utils/errors';
import {
  createReportSchema,
  idParamSchema,
  listReportsQuerySchema,
  moderationSchema,
  assignSchema,
  repairUpdateSchema,
} from './schemas';
import * as reports from './service';

const router = Router();

function collectFiles(req: Request): Express.Multer.File[] {
  const files = req.files;
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return Object.values(files).flat();
}

function filesForKind(req: Request, kind: string): Express.Multer.File[] {
  const files = req.files;
  if (!files || Array.isArray(files)) return collectFiles(req);
  const map: Record<string, string> = { BEFORE: 'photos', PROGRESS: 'progressPhotos', AFTER: 'afterPhotos' };
  const field = map[kind] ?? 'photos';
  const picked = files[field];
  return picked && picked.length ? picked : collectFiles(req);
}

// ---------------------------------------------------------------------------
//  Citizen-facing
// ---------------------------------------------------------------------------

/** Submit a new road issue (multipart: photos + fields). */
router.post(
  '/',
  authenticate,
  uploadReportPhotos(),
  validate({ body: createReportSchema }),
  asyncHandler(async (req, res) => {
    const report = await reports.createReport({
      actor: req.auth!,
      input: req.body,
      files: collectFiles(req),
    });
    res.status(201).json({ report });
  }),
);

/** The signed-in citizen's own reports. */
router.get(
  '/mine',
  authenticate,
  validate({ query: listReportsQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await reports.listReportsForCitizen(req.auth!.id, req.query as never);
    res.json(result);
  }),
);

// ---------------------------------------------------------------------------
//  Staff-facing listings & statistics
// ---------------------------------------------------------------------------

router.get(
  '/',
  authenticate,
  requireStaff,
  validate({ query: listReportsQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await reports.listReportsForStaff(req.query as never);
    res.json(result);
  }),
);

router.get(
  '/stats',
  authenticate,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json(await reports.reportStatistics());
  }),
);

// ---------------------------------------------------------------------------
//  Single report
// ---------------------------------------------------------------------------

router.get(
  '/:id',
  optionalAuthenticate,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const report = await reports.getReportForActor(req.params.id, req.auth);
    res.json({ report });
  }),
);

router.get(
  '/:id/history',
  optionalAuthenticate,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const history = await reports.getReportHistory(req.params.id, req.auth);
    res.json({ history });
  }),
);

/** Add photos (citizen while pending, or staff). */
router.post(
  '/:id/photos',
  authenticate,
  validate({ params: idParamSchema }),
  uploadReportPhotos(),
  asyncHandler(async (req, res) => {
    const kind = z
      .enum(['BEFORE', 'PROGRESS', 'AFTER'])
      .default('BEFORE')
      .parse((req.body as Record<string, unknown>)?.kind ?? 'BEFORE');

    const report = await reports.addReportPhotos({
      reportId: req.params.id,
      actor: req.auth!,
      files: filesForKind(req, kind),
      kind,
    });
    res.status(201).json({ report });
  }),
);

router.delete(
  '/:id',
  authenticate,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await reports.deleteReport(req.params.id, req.auth!));
  }),
);

// ---------------------------------------------------------------------------
//  Moderation (ADMIN only)
// ---------------------------------------------------------------------------

router.patch(
  '/:id/moderation',
  authenticate,
  requireAdmin,
  validate({ params: idParamSchema, body: moderationSchema }),
  asyncHandler(async (req, res) => {
    const report = await reports.moderateReport(req.params.id, req.auth!, req.body);
    res.json({ report });
  }),
);

// ---------------------------------------------------------------------------
//  Assignment (ADMIN only)
// ---------------------------------------------------------------------------

router.post(
  '/:id/assign',
  authenticate,
  requireAdmin,
  validate({ params: idParamSchema, body: assignSchema }),
  asyncHandler(async (req, res) => {
    const report = await reports.assignReport(req.params.id, req.auth!, req.body);
    res.json({ report });
  }),
);

// ---------------------------------------------------------------------------
//  Maintenance updates (ADMIN or the assigned officer)
// ---------------------------------------------------------------------------

router.patch(
  '/:id/repair',
  authenticate,
  requireStaff,
  validate({ params: idParamSchema, body: repairUpdateSchema }),
  asyncHandler(async (req, res) => {
    const report = await reports.updateRepair(req.params.id, req.auth!, req.body);
    res.json({ report });
  }),
);

export default router;
