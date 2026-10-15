import type { RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import { AppError } from '../utils/errors';

/** Image MIME types we accept for report photos. */
export const ACCEPTED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export const MAX_PHOTOS_PER_REQUEST = 8;

const storage = multer.memoryStorage();

function fileFilter(_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (ACCEPTED_IMAGE_MIME.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(AppError.unsupportedMedia(`Unsupported image type: ${file.mimetype}. Allowed: JPEG, PNG, WebP, HEIC.`));
  }
}

export const multerPhotos = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.storage.maxUploadBytes,
    files: MAX_PHOTOS_PER_REQUEST,
  },
});

/**
 * Accepts multipart/form-data with:
 *   - `photos`   (0..8 image files)
 *   - `afterPhotos` / `progressPhotos` aliases handled per-route
 */
export function uploadReportPhotos(): RequestHandler {
  return multerPhotos.fields([
    { name: 'photos', maxCount: MAX_PHOTOS_PER_REQUEST },
    { name: 'progressPhotos', maxCount: MAX_PHOTOS_PER_REQUEST },
    { name: 'afterPhotos', maxCount: MAX_PHOTOS_PER_REQUEST },
  ]) as unknown as RequestHandler;
}

export function uploadSinglePhoto(field = 'photo'): RequestHandler {
  return multerPhotos.single(field) as unknown as RequestHandler;
}
