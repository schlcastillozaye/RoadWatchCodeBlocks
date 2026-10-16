import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { optionalAuthenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { reverseGeocode, searchPlaces } from '../../services/geocoding';
import { listPublicReports, getReportForActor } from '../reports/service';
import { listReportsQuerySchema, idParamSchema } from '../reports/schemas';

const router = Router();

/**
 * PUBLIC map feed — approved reports only.
 * Pending and rejected reports are never returned here (also filtered in SQL).
 */
router.get(
  '/reports',
  validate({ query: listReportsQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await listPublicReports(req.query as never);
    res.json(result);
  }),
);

/** Public detail for an approved report (404/403 for anything not approved). */
router.get(
  '/reports/:id',
  optionalAuthenticate,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const report = await getReportForActor(req.params.id, req.auth);
    if (!req.auth && report.moderationStatus !== 'APPROVED') {
      // Should not happen (service enforces), keeps the contract explicit.
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not available.' } });
      return;
    }
    res.json({ report });
  }),
);

/**
 * Server-side reverse geocoding. Uses Google when a server key is configured,
 * otherwise the free OpenStreetMap Nominatim service. Never a hard error: the
 * client falls back to raw coordinates or a text label when unavailable.
 */
router.get(
  '/geocode/reverse',
  validate({
    query: z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { lat, lng } = req.query as unknown as { lat: number; lng: number };
    res.json(await reverseGeocode(lat, lng));
  }),
);

/**
 * Server-side forward geocoding (place / address search).
 *
 * Uses Google when a server key is configured, otherwise the free
 * OpenStreetMap Nominatim service. When a provider returns nothing we answer
 * with `available: false` plus a reason the client can show — never a hard
 * error. Clients degrade to matching their own reports by text instead.
 */
router.get(
  '/geocode/search',
  validate({
    query: z.object({
      q: z.string().trim().min(2, 'Enter at least 2 characters.').max(200),
      limit: z.coerce.number().int().min(1).max(10).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { q, limit } = req.query as unknown as { q: string; limit?: number };
    res.json(await searchPlaces(q, limit ?? 5));
  }),
);

export default router;
