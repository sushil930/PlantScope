import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ApiErrorCode, ScanResult, StoredScanRecord } from '../types/plant';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const MAX_IMAGES_PER_SCAN = 5;
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
export const ALLOWED_IMAGE_EXTENSIONS = /\.(jpe?g|png)$/i;

export interface ClientFileValidationResult {
  validFiles: File[];
  errors: Array<{ key: 'invalidType' | 'tooLarge' | 'maxImages'; fileName?: string }>;
}

export function validateClientImageFiles(
  incomingFiles: File[],
  existingCount: number
): ClientFileValidationResult {
  const validFiles: File[] = [];
  const errors: ClientFileValidationResult['errors'] = [];
  let runningCount = existingCount;

  for (const file of incomingFiles) {
    const mimeOk = file.type ? ALLOWED_IMAGE_MIMES.has(file.type.toLowerCase()) : false;
    const extOk = ALLOWED_IMAGE_EXTENSIONS.test(file.name);
    if (!mimeOk && !extOk) {
      errors.push({ key: 'invalidType', fileName: file.name });
      continue;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      errors.push({ key: 'tooLarge', fileName: file.name });
      continue;
    }

    if (runningCount >= MAX_IMAGES_PER_SCAN) {
      errors.push({ key: 'maxImages' });
      break;
    }

    validFiles.push(file);
    runningCount += 1;
  }

  return { validFiles, errors };
}

export function formatScorePercent(score: number): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0));
  return `${(clamped * 100).toFixed(1)}%`;
}

export function formatTimestamp(isoString: string, locale: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  try {
    return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function createStoredRecordFromScan(
  result: ScanResult,
  thumbnailDataUrl?: string | null
): StoredScanRecord {
  const top = result.candidates[0];
  const scientificName =
    top?.scientificNameWithoutAuthor || result.bestMatch || 'Unidentified specimen';
  const commonName = top?.commonNames?.[0] || scientificName;

  return {
    id: result.id,
    timestamp: result.timestamp,
    commonName,
    scientificName,
    score: top?.score ?? 0,
    diseaseStatus: result.disease.status,
    result,
    ...(thumbnailDataUrl ? { thumbnailDataUrl } : {}),
  };
}

export function filterAndSortHistory(
  records: StoredScanRecord[],
  query: string,
  sortOrder: 'newest' | 'oldest'
): StoredScanRecord[] {
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = normalizedQuery
    ? records.filter((item) => {
        const haystack = [
          item.commonName,
          item.scientificName,
          item.result.candidates[0]?.family || '',
          ...(item.result.candidates[0]?.commonNames || []),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : [...records];

  return filtered.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
  });
}

export function getErrorTranslationKey(code?: ApiErrorCode): string {
  if (!code) return 'errors.UNKNOWN_ERROR';
  return `errors.${code}`;
}

/**
 * Generates a small compressed JPEG thumbnail data URL strictly when the user opts in
 * to local browser photo saving.
 */
export async function generateLocalThumbnail(file: File, maxDimension = 320): Promise<string | null> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to load image'));
      el.src = objectUrl;
    });

    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height, 1));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
