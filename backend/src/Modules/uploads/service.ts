import type { PhotoKind } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { getStorage, type StoredFile } from '../../services/storage';
import { readImageDimensions } from '../../utils/imageMeta';
import { AppError } from '../../utils/errors';

export interface StoredPhotoMeta {
  stored: StoredFile;
  width: number | null;
  height: number | null;
}

/**
 * Writes image buffers to storage *before* any database work, returning the
 * metadata needed to create ReportPhoto rows inside a transaction.
 */
export async function storeBuffers(
  files: Express.Multer.File[],
  folder: string,
): Promise<StoredPhotoMeta[]> {
  if (files.length > 8) throw AppError.badRequest('At most 8 photos may be uploaded at once.');
  const storage = getStorage();
  const out: StoredPhotoMeta[] = [];

  for (const file of files) {
    if (!file.buffer?.length) continue;
    const meta = readImageDimensions(file.buffer);
    const stored = await storage.save(file.buffer, {
      originalName: file.originalname,
      mimeType: file.mimetype,
      folder,
    });
    out.push({ stored, width: meta.width ?? null, height: meta.height ?? null });
  }
  return out;
}

/** Removes stored files (best-effort rollback). */
export async function discardStored(metas: StoredPhotoMeta[]): Promise<void> {
  const storage = getStorage();
  await Promise.all(metas.map((m) => storage.remove(m.stored.key)));
}

export interface PersistPhotosParams {
  reportId: string;
  files: Express.Multer.File[];
  kind: PhotoKind;
  uploadedById?: string | null;
  folder?: string;
}

/** Stores buffers and creates ReportPhoto rows for an existing report. */
export async function persistPhotos(params: PersistPhotosParams) {
  const { reportId, files, kind, uploadedById } = params;
  if (!files.length) return [];

  const metas = await storeBuffers(files, params.folder ?? 'reports');

  const created = [];
  for (const meta of metas) {
    created.push(
      await prisma.reportPhoto.create({
        data: {
          reportId,
          kind,
          storageKey: meta.stored.key,
          mimeType: meta.stored.mimeType,
          sizeBytes: meta.stored.sizeBytes,
          width: meta.width,
          height: meta.height,
          uploadedById: uploadedById ?? null,
        },
      }),
    );
  }
  return created;
}
