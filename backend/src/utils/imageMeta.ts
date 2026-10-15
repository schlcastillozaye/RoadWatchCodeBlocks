import sizeOf from 'image-size';

export interface ImageMeta {
  width?: number;
  height?: number;
}

/**
 * Best-effort dimension extraction. Never throws — an unreadable/unsupported
 * image simply yields no dimensions (the upload still succeeds).
 */
export function readImageDimensions(buffer: Buffer): ImageMeta {
  try {
    const result = sizeOf(buffer);
    return {
      width: typeof result.width === 'number' ? result.width : undefined,
      height: typeof result.height === 'number' ? result.height : undefined,
    };
  } catch {
    return {};
  }
}
