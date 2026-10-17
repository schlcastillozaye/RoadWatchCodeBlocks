import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export interface StoredFile {
  key: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
  originalName: string;
}

export interface SaveOptions {
  originalName: string;
  mimeType: string;
  folder?: string;
}

/**
 * Storage abstraction. Swap the driver (local disk <-> object storage) without
 * touching any business logic.
 */
export interface StorageDriver {
  readonly name: string;
  save(buffer: Buffer, opts: SaveOptions): Promise<StoredFile>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  publicUrl(key: string): string;
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

export function extensionForMime(mime: string, originalName?: string): string {
  const byMime = MIME_EXT[mime];
  if (byMime) return byMime;
  const ext = originalName ? path.extname(originalName).toLowerCase() : '';
  return ext && ext.length <= 6 ? ext : '.bin';
}

function safeSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// ---------------------------------------------------------------------------
//  Local disk driver (default — no external services required)
// ---------------------------------------------------------------------------

export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';
  private readonly root: string;

  constructor(root = env.storage.localDir) {
    this.root = path.resolve(root);
    if (!existsSync(this.root)) {
      fs.mkdir(this.root, { recursive: true }).catch((e) =>
        logger.error('Failed to create local storage directory', e),
      );
    }
  }

  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (full !== this.root && !full.startsWith(rootWithSep)) {
      throw AppError.badRequest('Invalid storage key');
    }
    return full;
  }

  async save(buffer: Buffer, opts: SaveOptions): Promise<StoredFile> {
    const folder = safeSegment(opts.folder ?? 'misc');
    const ext = extensionForMime(opts.mimeType, opts.originalName);
    const key = `${folder}/${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const full = this.resolve(key);

    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);

    return {
      key,
      url: this.publicUrl(key),
      sizeBytes: buffer.length,
      mimeType: opts.mimeType,
      originalName: opts.originalName,
    };
  }

  async read(key: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.resolve(key));
    } catch {
      throw AppError.notFound('File not found');
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch (err) {
      logger.warn(`Storage remove failed for ${key}`, err);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  /** Files are served through the authorised /api/files endpoint, never statically. */
  publicUrl(key: string): string {
    return `${env.storage.publicBaseUrl.replace(/\/$/, '')}/api/files/by-key/${encodeURIComponent(key)}`;
  }
}

// ---------------------------------------------------------------------------
//  S3-compatible driver (optional — enabled via STORAGE_DRIVER=s3)
// ---------------------------------------------------------------------------

export class S3StorageDriver implements StorageDriver {
  readonly name = 's3';

  constructor() {
    const { bucket, region } = env.storage.s3;
    if (!bucket || !region) {
      throw new Error('S3 storage selected but S3_BUCKET / S3_REGION are not configured.');
    }
  }

  // Lazily load the AWS SDK so the system runs without it when unused.
  private sdk(): any {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('@aws-sdk/client-s3');
    } catch {
      throw new Error(
        'STORAGE_DRIVER=s3 requires the optional dependency "@aws-sdk/client-s3". Install it to enable S3 storage.',
      );
    }
  }

  private client(): any {
    const { region, accessKeyId, secretAccessKey, endpoint } = env.storage.s3;
    const { S3Client } = this.sdk();
    return new S3Client({
      region,
      endpoint: endpoint || undefined,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
      forcePathStyle: Boolean(endpoint),
    });
  }

  async save(buffer: Buffer, opts: SaveOptions): Promise<StoredFile> {
    const { PutObjectCommand } = this.sdk();
    const folder = safeSegment(opts.folder ?? 'misc');
    const ext = extensionForMime(opts.mimeType, opts.originalName);
    const key = `${folder}/${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    await this.client().send(
      new PutObjectCommand({
        Bucket: env.storage.s3.bucket,
        Key: key,
        Body: buffer,
        ContentType: opts.mimeType,
      }),
    );
    return { key, url: this.publicUrl(key), sizeBytes: buffer.length, mimeType: opts.mimeType, originalName: opts.originalName };
  }

  async read(key: string): Promise<Buffer> {
    const { GetObjectCommand } = this.sdk();
    const res = await this.client().send(new GetObjectCommand({ Bucket: env.storage.s3.bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async remove(key: string): Promise<void> {
    const { DeleteObjectCommand } = this.sdk();
    await this.client().send(new DeleteObjectCommand({ Bucket: env.storage.s3.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    const { HeadObjectCommand } = this.sdk();
    try {
      await this.client().send(new HeadObjectCommand({ Bucket: env.storage.s3.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  publicUrl(key: string): string {
    const { bucket, region, endpoint } = env.storage.s3;
    if (endpoint) return `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`;
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }
}

let cached: StorageDriver | undefined;

export function getStorage(): StorageDriver {
  if (cached) return cached;
  cached = env.storage.driver === 's3' ? new S3StorageDriver() : new LocalStorageDriver();
  logger.info(`Storage driver: ${cached.name}`);
  return cached;
}
