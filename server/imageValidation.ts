import type { OrganType } from '../src/types/plant';
import { AppApiError } from './errors';

export interface UploadedImageBuffer {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
export const ALLOWED_ORGANS = new Set<OrganType>(['auto', 'leaf', 'flower', 'fruit', 'bark']);

/**
 * Inspects actual image file magic bytes (JPEG or PNG) rather than trusting MIME headers alone.
 */
export function detectImageFormatFromMagicBytes(buffer: Buffer): 'jpeg' | 'png' | null {
  if (!buffer || buffer.length < 12) {
    return null;
  }

  // JPEG SOI marker: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    // Also check IHDR chunk width/height > 0 when buffer has at least 24 bytes
    if (buffer.length >= 24) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      if (width === 0 || height === 0) {
        return null;
      }
    }
    return 'png';
  }

  return null;
}

export function validateUploadedImages(
  files: UploadedImageBuffer[],
  limits: { maxImages: number; maxImageSizeBytes: number; maxTotalUploadBytes: number }
): Array<{ buffer: Buffer; filename: string; mimeType: 'image/jpeg' | 'image/png' }> {
  if (!files || files.length === 0) {
    throw new AppApiError(400, 'NO_IMAGES', 'Please upload between 1 and 5 plant photographs.');
  }

  if (files.length > limits.maxImages) {
    throw new AppApiError(
      400,
      'TOO_MANY_IMAGES',
      `Maximum ${limits.maxImages} photographs are allowed per scan, and all must depict the same individual plant.`
    );
  }

  let totalBytes = 0;
  const validated: Array<{ buffer: Buffer; filename: string; mimeType: 'image/jpeg' | 'image/png' }> = [];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const normalizedMime = (file.mimetype || '').toLowerCase();

    if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
      throw new AppApiError(
        400,
        'INVALID_IMAGE_FORMAT',
        `File "${file.originalname || `image-${i + 1}`}" has an unsupported format. Only JPG, JPEG, and PNG photographs are accepted.`
      );
    }

    if (file.size <= 0 || file.buffer.length <= 0) {
      throw new AppApiError(
        400,
        'INVALID_IMAGE_FORMAT',
        `File "${file.originalname || `image-${i + 1}`}" is empty or unreadable.`
      );
    }

    if (file.buffer.length > limits.maxImageSizeBytes) {
      const maxMb = Math.round(limits.maxImageSizeBytes / (1024 * 1024));
      throw new AppApiError(
        400,
        'IMAGE_TOO_LARGE',
        `File "${file.originalname || `image-${i + 1}`}" exceeds the ${maxMb} MB per-image size limit.`
      );
    }

    totalBytes += file.buffer.length;
    if (totalBytes > limits.maxTotalUploadBytes) {
      const maxTotalMb = Math.round(limits.maxTotalUploadBytes / (1024 * 1024));
      throw new AppApiError(
        400,
        'REQUEST_TOO_LARGE',
        `Total upload size exceeds the ${maxTotalMb} MB request limit.`
      );
    }

    const detected = detectImageFormatFromMagicBytes(file.buffer);
    if (!detected) {
      throw new AppApiError(
        400,
        'INVALID_IMAGE_FORMAT',
        `File "${file.originalname || `image-${i + 1}`}" failed binary image verification. Please upload a valid JPEG or PNG photograph.`
      );
    }

    const safeExt = detected === 'png' ? 'png' : 'jpg';
    validated.push({
      buffer: file.buffer,
      filename: `specimen-${i + 1}.${safeExt}`,
      mimeType: detected === 'png' ? 'image/png' : 'image/jpeg',
    });
  }

  return validated;
}

export function normalizeOrgans(rawOrgans: unknown, imageCount: number): OrganType[] {
  const list: string[] = Array.isArray(rawOrgans)
    ? rawOrgans.map((o) => String(o).toLowerCase().trim())
    : typeof rawOrgans === 'string' && rawOrgans.trim()
      ? [rawOrgans.toLowerCase().trim()]
      : [];

  const normalized: OrganType[] = [];
  for (let i = 0; i < imageCount; i += 1) {
    const candidate = (list[i] || list[0] || 'auto') as OrganType;
    if (!ALLOWED_ORGANS.has(candidate)) {
      throw new AppApiError(
        400,
        'INVALID_REQUEST',
        `Unsupported plant organ value "${candidate}". Allowed values: auto, leaf, flower, fruit, bark.`
      );
    }
    normalized.push(candidate);
  }
  return normalized;
}
