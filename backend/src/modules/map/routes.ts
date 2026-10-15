import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { optionalAuthenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { env } from '../../config/env';
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
 * Server-side reverse geocoding. Optional: when no Google key is configured the
 * client falls back to raw coordinates (never an error the user must handle).
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

    if (!env.googleMaps.serverApiKey) {
      res.json({ available: false, address: null, areaLabel: null, reason: 'GOOGLE_MAPS_SERVER_API_KEY is not configured.' });
      return;
    }

    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('latlng', `${lat},${lng}`);
      url.searchParams.set('key', env.googleMaps.serverApiKey);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) {
        res.json({ available: false, address: null, areaLabel: null, reason: `Geocoding failed (${response.status}).` });
        return;
      }

      const data = (await response.json()) as {
        status: string;
        error_message?: string;
        results?: Array<{ formatted_address: string; address_components: Array<{ long_name: string; types: string[] }> }>;
      };

      const first = data.results?.[0];
      const areaLabel =
        first?.address_components.find((c) => c.types.includes('sublocality') || c.types.includes('locality'))?.long_name ??
        null;

      res.json({
        available: Boolean(first),
        address: first?.formatted_address ?? null,
        areaLabel,
        reason: first ? null : describeGeocodeStatus(data.status, data.error_message),
      });
    } catch {
      res.json({ available: false, address: null, areaLabel: null, reason: 'Geocoding service unavailable.' });
    }
  }),
);

/**
 * Server-side forward geocoding (place / address search).
 *
 * Optional, exactly like reverse geocoding: when no key is configured, or when
 * Google refuses the request, we answer with `available: false` plus a reason
 * the client can show — never a hard error the user has to interpret. Clients
 * degrade to matching their own reports by text instead.
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

    if (!env.googleMaps.serverApiKey) {
      res.json({
        available: false,
        results: [],
        reason: 'GOOGLE_MAPS_SERVER_API_KEY is not configured.',
      });
      return;
    }

    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', q);
      url.searchParams.set('key', env.googleMaps.serverApiKey);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) {
        res.json({ available: false, results: [], reason: `Geocoding failed (${response.status}).` });
        return;
      }

      const data = (await response.json()) as {
        status: string;
        error_message?: string;
        results?: Array<{
          formatted_address: string;
          geometry: { location: { lat: number; lng: number } };
          address_components: Array<{ long_name: string; types: string[] }>;
        }>;
      };

      const results = (data.results ?? []).slice(0, limit ?? 5).map((result) => ({
        address: result.formatted_address,
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        areaLabel:
          result.address_components.find(
            (component) => component.types.includes('sublocality') || component.types.includes('locality'),
          )?.long_name ?? null,
      }));

      res.json({
        available: results.length > 0,
        results,
        reason: results.length > 0 ? null : describeGeocodeStatus(data.status, data.error_message),
      });
    } catch {
      res.json({ available: false, results: [], reason: 'Geocoding service unavailable.' });
    }
  }),
);

/** Turns a Google Geocoding status into something a person can act on. */
function describeGeocodeStatus(status: string, errorMessage?: string): string {
  switch (status) {
    case 'ZERO_RESULTS':
      return 'No matching place was found.';
    case 'REQUEST_DENIED':
      return errorMessage
        ? `Google rejected the request: ${errorMessage}`
        : 'Google rejected the request — check that billing is enabled and the Geocoding API is turned on.';
    case 'OVER_QUERY_LIMIT':
      return 'The Google Maps quota for this project has been exceeded.';
    case 'OVER_DAILY_LIMIT':
      return 'The daily Google Maps limit has been reached. Try again tomorrow.';
    case 'INVALID_REQUEST':
      return 'That search was not understood — try a more specific address.';
    default:
      return `No result (${status}).`;
  }
}

export default router;
