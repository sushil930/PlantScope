import type { ApiErrorCode, ApiErrorPayload } from '../src/types/plant';

export class AppApiError extends Error {
  public readonly status: number;
  public readonly code: ApiErrorCode;
  public readonly details?: string;
  public readonly resetAt?: string | null;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    options?: { details?: string; resetAt?: string | null }
  ) {
    super(message);
    this.name = 'AppApiError';
    this.status = status;
    this.code = code;
    this.details = options?.details;
    this.resetAt = options?.resetAt ?? null;
  }

  toPayload(): ApiErrorPayload {
    return {
      error: {
        code: this.code,
        message: this.message,
        status: this.status,
        ...(this.details ? { details: this.details } : {}),
        ...(this.resetAt !== undefined ? { resetAt: this.resetAt } : {}),
      },
    };
  }
}

export function mapUpstreamStatusToError(
  status: number,
  context: 'identify' | 'disease' | 'quota' | 'languages',
  resetAt?: string | null
): AppApiError {
  switch (status) {
    case 400:
      return new AppApiError(
        400,
        'INVALID_REQUEST',
        'The uploaded plant image or request parameters could not be processed.'
      );
    case 401:
      return new AppApiError(
        401,
        'UNAUTHORIZED',
        'The configured identification service key was rejected. Verify your server environment configuration.'
      );
    case 403:
      return new AppApiError(
        403,
        'FORBIDDEN',
        'Access to this identification endpoint is denied for the configured key.'
      );
    case 404:
      return new AppApiError(
        404,
        'NOT_FOUND',
        context === 'disease'
          ? 'No supported plant disease match was returned for the submitted specimen.'
          : 'No matching plant species could be identified from the submitted photograph(s).'
      );
    case 429:
      return new AppApiError(
        429,
        'QUOTA_EXHAUSTED',
        'The daily scan allowance has been reached. No automatic retries will be attempted.',
        { resetAt: resetAt ?? null }
      );
    case 500:
    case 502:
    case 503:
    case 504:
      return new AppApiError(
        502,
        'UPSTREAM_ERROR',
        'The botanical analysis service is currently experiencing an issue. Please try again later.'
      );
    default:
      return new AppApiError(
        status >= 400 && status < 600 ? status : 502,
        'UPSTREAM_ERROR',
        `Unexpected response (HTTP ${status}) from upstream botanical API.`
      );
  }
}

export function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'AbortError' ||
    err.name === 'TimeoutError' ||
    /timeout|aborted|ECONNABORTED|ETIMEDOUT/i.test(err.message)
  );
}
