import type { AnalysisStatus } from '@prisma/client';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { prisma } from '../../config/prisma';

export interface ImageAnalysisRequest {
  reportId: string;
  photoId?: string;
  /** Publicly resolvable URL of the image to analyse. */
  imageUrl: string;
}

export interface ImageAnalysisOutcome {
  provider: string;
  status: AnalysisStatus;
  result?: unknown;
  confidence?: number;
  error?: string;
}

/**
 * Contract every image-processing backend must implement.
 * The core system only depends on this interface, never a concrete provider.
 *
 * Future capabilities plug in here without rebuilding the app:
 *  - automatic pothole / crack detection
 *  - suggested issue categories
 *  - image quality checks
 *  - duplicate-image detection
 *  - estimated damage severity
 *  - before/after comparison
 */
export interface ImageProcessingService {
  readonly name: string;
  readonly enabled: boolean;
  analyze(request: ImageAnalysisRequest): Promise<ImageAnalysisOutcome>;
  compareBeforeAfter?(beforeUrl: string, afterUrl: string): Promise<ImageAnalysisOutcome>;
}

/** Default: does nothing, always available, never blocks the workflow. */
export class NoopImageProcessingService implements ImageProcessingService {
  readonly name = 'none';
  readonly enabled = false;

  async analyze(_request: ImageAnalysisRequest): Promise<ImageAnalysisOutcome> {
    return { provider: this.name, status: 'SKIPPED' };
  }
}

/** Calls a remote HTTP image-analysis API (the future AI service). */
export class HttpImageProcessingService implements ImageProcessingService {
  readonly name: string;
  readonly enabled = true;

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    name = 'http',
  ) {
    this.name = name;
  }

  private async call(pathname: string, body: unknown): Promise<ImageAnalysisOutcome> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(`${this.apiUrl.replace(/\/$/, '')}${pathname}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        return { provider: this.name, status: 'FAILED', error: `Provider responded ${res.status}` };
      }
      const json = (await res.json()) as { result?: unknown; confidence?: number };
      return { provider: this.name, status: 'COMPLETED', result: json.result ?? json, confidence: json.confidence };
    } catch (err) {
      return { provider: this.name, status: 'FAILED', error: err instanceof Error ? err.message : 'unknown error' };
    } finally {
      clearTimeout(timeout);
    }
  }

  analyze(request: ImageAnalysisRequest): Promise<ImageAnalysisOutcome> {
    return this.call('/analyze', {
      reportId: request.reportId,
      photoId: request.photoId,
      imageUrl: request.imageUrl,
    });
  }

  compareBeforeAfter(beforeUrl: string, afterUrl: string): Promise<ImageAnalysisOutcome> {
    return this.call('/compare', { beforeUrl, afterUrl });
  }
}

let cached: ImageProcessingService | undefined;

export function getImageProcessing(): ImageProcessingService {
  if (cached) return cached;
  const cfg = env.imageProcessing;
  if (cfg.enabled && cfg.provider !== 'none' && cfg.apiUrl) {
    cached = new HttpImageProcessingService(cfg.apiUrl, cfg.apiKey, cfg.provider);
    logger.info(`Image processing enabled: provider=${cfg.provider}`);
  } else {
    cached = new NoopImageProcessingService();
    logger.info('Image processing disabled (optional module inactive).');
  }
  return cached;
}

/**
 * Fire-and-forget analysis. IMPORTANT: never throws into the caller — a
 * failure here must never break report submission, moderation, maps or
 * maintenance. Results are stored separately in ImageAnalysisResult.
 */
export function scheduleImageAnalysis(reportId: string, photoId: string | undefined, imageUrl: string): void {
  const service = getImageProcessing();
  if (!service.enabled) return;

  void (async () => {
    try {
      const outcome = await service.analyze({ reportId, photoId, imageUrl });
      await prisma.imageAnalysisResult.create({
        data: {
          reportId,
          photoId: photoId ?? null,
          provider: outcome.provider,
          status: outcome.status,
          result: (outcome.result ?? undefined) as never,
          confidence: outcome.confidence ?? null,
          error: outcome.error ?? null,
        },
      });
    } catch (err) {
      logger.warn('Image analysis failed (non-fatal)', err);
    }
  })();
}
