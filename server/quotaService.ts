import type { QuotaInfo } from '../src/types/plant';
import { type ServerConfig, redactApiKey } from './config';
import { isTimeoutError, mapUpstreamStatusToError } from './errors';
import type { FetchLike } from './plantnetService';

interface QuotaTrackerState {
  exhaustedUntilDay: string | null;
  lastKnownRemaining: number | null;
  lastKnownDailyLimit: number | null;
}

const quotaTracker: QuotaTrackerState = {
  exhaustedUntilDay: null,
  lastKnownRemaining: null,
  lastKnownDailyLimit: null,
};

function getUtcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function getNextUtcMidnightIso(now = new Date()): string {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
  );
  return next.toISOString();
}

export function resetQuotaTracker(): void {
  quotaTracker.exhaustedUntilDay = null;
  quotaTracker.lastKnownRemaining = null;
  quotaTracker.lastKnownDailyLimit = null;
}

export function markQuotaExhausted(): void {
  quotaTracker.exhaustedUntilDay = getUtcDayKey();
  quotaTracker.lastKnownRemaining = 0;
}

export function recordRemainingQuota(remaining: number | null): void {
  if (typeof remaining === 'number' && !Number.isNaN(remaining)) {
    quotaTracker.lastKnownRemaining = Math.max(0, remaining);
    if (remaining <= 0) {
      quotaTracker.exhaustedUntilDay = getUtcDayKey();
    } else if (quotaTracker.exhaustedUntilDay === getUtcDayKey()) {
      quotaTracker.exhaustedUntilDay = null;
    }
  }
}

export function isLocallyMarkedExhausted(): boolean {
  return quotaTracker.exhaustedUntilDay === getUtcDayKey();
}

export function parseQuotaResponse(payload: Record<string, unknown>): QuotaInfo {
  const quotaObj = (payload.quota as Record<string, unknown> | undefined) ?? {};
  const identifyObj = (quotaObj.identify as Record<string, unknown> | undefined) ?? {};

  const numOrNull = (val: unknown): number | null =>
    typeof val === 'number' && Number.isFinite(val) ? val : null;

  const dailyLimit =
    numOrNull(identifyObj.total) ??
    numOrNull(identifyObj.limit) ??
    numOrNull(quotaObj.total) ??
    numOrNull(payload.dailyQuota) ??
    numOrNull(payload.total) ??
    numOrNull(payload.limit) ??
    null;

  const used =
    numOrNull(identifyObj.count) ??
    numOrNull(identifyObj.used) ??
    numOrNull(quotaObj.count) ??
    numOrNull(payload.count) ??
    numOrNull(payload.used) ??
    null;

  let remaining =
    numOrNull(identifyObj.remaining) ??
    numOrNull(quotaObj.remaining) ??
    numOrNull(payload.remainingIdentificationRequests) ??
    numOrNull(payload.remaining) ??
    null;

  if (remaining === null && dailyLimit !== null && used !== null) {
    remaining = Math.max(0, dailyLimit - used);
  }

  const exhausted = remaining !== null ? remaining <= 0 : false;
  if (remaining !== null) {
    recordRemainingQuota(remaining);
  }

  const resetAt =
    typeof payload.resetAt === 'string'
      ? payload.resetAt
      : typeof payload.day === 'string'
        ? getNextUtcMidnightIso()
        : getNextUtcMidnightIso();

  return {
    available: !exhausted,
    configured: true,
    dailyLimit,
    remaining,
    used: used ?? (dailyLimit !== null && remaining !== null ? Math.max(0, dailyLimit - remaining) : null),
    resetAt,
    exhausted,
  };
}

export async function fetchDailyQuota(
  config: ServerConfig,
  fetchImpl: FetchLike = fetch
): Promise<QuotaInfo> {
  if (!config.plantnetApiKey) {
    return {
      available: false,
      configured: false,
      dailyLimit: null,
      remaining: null,
      used: null,
      resetAt: null,
      exhausted: false,
      errorCode: 'API_KEY_NOT_CONFIGURED',
      message: 'Identification service key is not configured on the server.',
    };
  }

  if (isLocallyMarkedExhausted()) {
    return {
      available: false,
      configured: true,
      dailyLimit: quotaTracker.lastKnownDailyLimit,
      remaining: 0,
      used: quotaTracker.lastKnownDailyLimit,
      resetAt: getNextUtcMidnightIso(),
      exhausted: true,
      errorCode: 'QUOTA_EXHAUSTED',
      message: 'Daily scan allowance has been reached. Resets daily (UTC).',
    };
  }

  const url = `${config.plantnetApiBaseUrl}/v2/quota/daily?api-key=${encodeURIComponent(config.plantnetApiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(config.requestTimeoutMs, 10000));

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (response.status === 429) {
      markQuotaExhausted();
      return {
        available: false,
        configured: true,
        dailyLimit: quotaTracker.lastKnownDailyLimit,
        remaining: 0,
        used: quotaTracker.lastKnownDailyLimit,
        resetAt: getNextUtcMidnightIso(),
        exhausted: true,
        errorCode: 'QUOTA_EXHAUSTED',
        message: 'Daily scan allowance has been reached.',
      };
    }

    if (!response.ok) {
      const mapped = mapUpstreamStatusToError(response.status, 'quota');
      return {
        available: false,
        configured: true,
        dailyLimit: quotaTracker.lastKnownDailyLimit,
        remaining: quotaTracker.lastKnownRemaining,
        used: null,
        resetAt: getNextUtcMidnightIso(),
        exhausted: false,
        errorCode: mapped.code,
        message: mapped.message,
      };
    }

    const json = (await response.json()) as Record<string, unknown>;
    const parsed = parseQuotaResponse(json);
    if (parsed.dailyLimit !== null) {
      quotaTracker.lastKnownDailyLimit = parsed.dailyLimit;
    }
    return parsed;
  } catch (err) {
    const timedOut = isTimeoutError(err);
    return {
      available: false,
      configured: true,
      dailyLimit: quotaTracker.lastKnownDailyLimit,
      remaining: quotaTracker.lastKnownRemaining,
      used: null,
      resetAt: getNextUtcMidnightIso(),
      exhausted: false,
      errorCode: timedOut ? 'NETWORK_TIMEOUT' : 'UPSTREAM_ERROR',
      message: timedOut
        ? 'Timed out while checking daily scan allowance.'
        : `Quota service unavailable: ${redactApiKey(err instanceof Error ? err.message : 'Network error')}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
