import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { getStorage } from '../../services/storage';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/errors';
import { optionalAuthenticate } from '../../middleware/auth';

const router = Router();

/**
 * Authorisation-gated file delivery.
 *
 *  - Photos attached to APPROVED reports are public (they appear on the map).
 *  - Any other photo requires a Bearer token and is limited to the owning
 *    citizen or staff (ADMIN / MAINTENANCE_OFFICER).
 *  - Storage keys are random and never reveal the reporter's identity.
 */
router.get(
  '/by-key/*',
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const raw = (req.params as unknown as Record<string, string>)[0] ?? '';
    const key = decodeURIComponent(raw).replace(/^\/+/, '');
    if (!key) throw AppError.badRequest('Missing file key');

    const photo = await prisma.reportPhoto.findFirst({
      where: { storageKey: key },
      include: {
        report: { select: { moderationStatus: true, citizenId: true } },
      },
    });
    if (!photo) throw AppError.notFound('File not found');

    const isPublic = photo.report.moderationStatus === 'APPROVED';
    const auth = req.auth;
    const isOwner = Boolean(auth && auth.id === photo.report.citizenId);
    const isStaff = auth?.role === 'ADMIN' || auth?.role === 'MAINTENANCE_OFFICER';

    if (!isPublic && !isOwner && !isStaff) {
      throw AppError.unauthenticated('You are not allowed to view this file.');
    }

    const storage = getStorage();
    const buffer = await storage.read(key);

    res.setHeader('Content-Type', photo.mimeType);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', isPublic ? 'public, max-age=86400' : 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  }),
);

export default router;
