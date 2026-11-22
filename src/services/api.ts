import type {
  ApiErrorCode,
  ApiErrorPayload,
  HealthResponse,
  LanguagesResponse,
  OrganType,
  QuotaInfo,
  ScanResult,
} from '../types/plant';

export class ClientApiError extends Error {
  public readonly code: ApiErrorCode;
  public readonly status: number;
  public readonly resetAt?: string | null;

  constructor(code: ApiErrorCode, message: string, status: number, resetAt?: string | null) {
    super(message);
    this.name = 'ClientApiError';
    this.code = code;
    this.status = status;
    this.resetAt = resetAt;
  }
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(apiUrl('/api/health'), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new ClientApiError('UPSTREAM_ERROR', 'Health check failed.', response.status);
  }
  return (await response.json()) as HealthResponse;
}

export async function fetchQuota(): Promise<QuotaInfo> {
  const response = await fetch(apiUrl('/api/quota'), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    return {
      available: false,
      configured: false,
      dailyLimit: null,
      remaining: null,
      used: null,
      resetAt: null,
      exhausted: false,
      errorCode: 'UPSTREAM_ERROR',
      message: 'Unable to fetch quota status.',
    };
  }
  return (await response.json()) as QuotaInfo;
}

export async function fetchSupportedLanguages(): Promise<LanguagesResponse> {
  const response = await fetch(apiUrl('/api/languages'), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    return {
      languages: ['en'],
      supportsHindi: false,
      source: 'fallback_unconfigured',
      cachedAt: null,
    };
  }
  return (await response.json()) as LanguagesResponse;
}

export interface SubmitScanParams {
  items: Array<{ file: File; organ: OrganType }>;
  lang: string;
  includeDisease: boolean;
  onUploadProgress?: (percent: number) => void;
}

export function submitPlantScan(params: SubmitScanParams): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    params.items.forEach((item) => {
      formData.append('images', item.file, item.file.name);
      formData.append('organs', item.organ);
    });
    formData.append('lang', params.lang);
    formData.append('include_disease', params.includeDisease ? 'true' : 'false');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl('/api/scan'), true);
    xhr.setRequestHeader('Accept', 'application/json');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && params.onUploadProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        params.onUploadProgress(Math.min(100, Math.max(0, percent)));
      }
    };

    xhr.onload = () => {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        parsed = null;
      }

      if (xhr.status >= 200 && xhr.status < 300 && parsed) {
        resolve(parsed as ScanResult);
        return;
      }

      const errPayload = parsed as ApiErrorPayload | null;
      const code: ApiErrorCode = errPayload?.error?.code || mapStatusToCode(xhr.status);
      const message =
        errPayload?.error?.message || `Request failed with status ${xhr.status}.`;
      reject(new ClientApiError(code, message, xhr.status, errPayload?.error?.resetAt));
    };

    xhr.onerror = () => {
      reject(
        new ClientApiError(
          'UPSTREAM_ERROR',
          'Could not connect to the PlantScope AI server.',
          0
        )
      );
    };

    xhr.ontimeout = () => {
      reject(
        new ClientApiError(
          'NETWORK_TIMEOUT',
          'The scan request timed out while waiting for the server.',
          504
        )
      );
    };

    xhr.timeout = 45000;
    xhr.send(formData);
  });
}

function mapStatusToCode(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return 'INVALID_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 429:
      return 'QUOTA_EXHAUSTED';
    case 504:
      return 'NETWORK_TIMEOUT';
    default:
      return 'UPSTREAM_ERROR';
  }
}
