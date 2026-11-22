import dotenv from 'dotenv';

dotenv.config();

export interface ServerConfig {
  port: number;
  plantnetApiKey: string;
  plantnetApiBaseUrl: string;
  gbifApiBaseUrl: string;
  corsOrigins: string[];
  maxImagesPerScan: number;
  maxImageSizeBytes: number;
  maxTotalUploadBytes: number;
  requestTimeoutMs: number;
}

const DEFAULT_PLANTNET_BASE = 'https://my-api.plantnet.org';
const DEFAULT_GBIF_BASE = 'https://api.gbif.org';

function validateHttpsBaseUrl(raw: string | undefined, fallback: string): string {
  const candidate = (raw || fallback).trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return fallback;
    }
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

export function getServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const maxImages = Math.min(Math.max(Number(env.MAX_IMAGES_PER_SCAN || 5), 1), 5);
  const maxImageMb = Math.min(Math.max(Number(env.MAX_IMAGE_SIZE_MB || 10), 1), 20);
  const maxTotalMb = Math.min(Math.max(Number(env.MAX_TOTAL_UPLOAD_MB || 25), 5), 50);

  const rawKey = (env.PLANTNET_API_KEY || '').trim();
  const isPlaceholder =
    !rawKey ||
    rawKey === 'your_private_api_key' ||
    rawKey === 'your_private_plantnet_api_key' ||
    rawKey === 'MY_PLANTNET_API_KEY';

  const corsOrigins = (env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    port: Number(env.PORT || 3000),
    plantnetApiKey: isPlaceholder ? '' : rawKey,
    plantnetApiBaseUrl: validateHttpsBaseUrl(env.PLANTNET_API_BASE_URL, DEFAULT_PLANTNET_BASE),
    gbifApiBaseUrl: validateHttpsBaseUrl(env.GBIF_API_BASE_URL, DEFAULT_GBIF_BASE),
    corsOrigins,
    maxImagesPerScan: maxImages,
    maxImageSizeBytes: maxImageMb * 1024 * 1024,
    maxTotalUploadBytes: maxTotalMb * 1024 * 1024,
    requestTimeoutMs: Number(env.API_TIMEOUT_MS || 20000),
  };
}

/**
 * Redacts api-key query parameters before any string is logged or returned.
 */
export function redactApiKey(input: string): string {
  return input.replace(/([?&]api-key=)[^&\s]+/gi, '$1[REDACTED]');
}
