import type { LanguagesResponse, OrganType, PlantCandidate } from '../src/types/plant';
import { type ServerConfig, redactApiKey } from './config';
import { AppApiError, isTimeoutError, mapUpstreamStatusToError } from './errors';

export type FetchLike = typeof fetch;

export interface PlantNetIdentifyRawResult {
  score?: number;
  species?: {
    scientificName?: string;
    scientificNameWithoutAuthor?: string;
    scientificNameAuthorship?: string;
    commonNames?: string[];
    family?: { scientificNameWithoutAuthor?: string; scientificName?: string };
    genus?: { scientificNameWithoutAuthor?: string; scientificName?: string };
  };
  gbif?: { id?: string | number };
  powo?: { id?: string };
  iucn?: { id?: string; category?: string };
}

export interface PlantNetIdentifyResponse {
  bestMatch?: string;
  results?: PlantNetIdentifyRawResult[];
  remainingIdentificationRequests?: number;
  version?: string;
  language?: string;
}

export interface ParsedIdentificationResult {
  bestMatch: string | null;
  candidates: PlantCandidate[];
  lowConfidenceWarning: boolean;
  remainingRequests: number | null;
  version: string | null;
  languageUsed: string;
}

interface LanguageCacheEntry {
  languages: string[];
  cachedAt: string;
  expiresAt: number;
}

let languageCache: LanguageCacheEntry | null = null;
const LANGUAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export function clearLanguageCache(): void {
  languageCache = null;
}

export function classifyConfidence(score: number): 'high' | 'moderate' | 'low' {
  if (score >= 0.7) return 'high';
  if (score >= 0.35) return 'moderate';
  return 'low';
}

export function parsePlantNetIdentifyResponse(
  data: PlantNetIdentifyResponse,
  languageUsed: string
): ParsedIdentificationResult {
  const rawResults = Array.isArray(data?.results) ? data.results : [];

  const candidates: PlantCandidate[] = rawResults
    .filter((item) => item && item.species && typeof item.score === 'number')
    .map((item) => {
      const sp = item.species!;
      const scientificNameWithoutAuthor = (
        sp.scientificNameWithoutAuthor ||
        sp.scientificName ||
        ''
      ).trim();
      const author = sp.scientificNameAuthorship?.trim() || null;
      const scientificName =
        sp.scientificName?.trim() ||
        [scientificNameWithoutAuthor, author].filter(Boolean).join(' ');

      const score = Math.max(0, Math.min(1, Number(item.score)));

      return {
        scientificName,
        scientificNameWithoutAuthor,
        author,
        commonNames: Array.isArray(sp.commonNames)
          ? sp.commonNames.map((n) => String(n).trim()).filter(Boolean)
          : [],
        family:
          sp.family?.scientificNameWithoutAuthor?.trim() ||
          sp.family?.scientificName?.trim() ||
          null,
        genus:
          sp.genus?.scientificNameWithoutAuthor?.trim() ||
          sp.genus?.scientificName?.trim() ||
          null,
        score,
        gbifId: item.gbif?.id != null ? String(item.gbif.id) : null,
        powoId: item.powo?.id ? String(item.powo.id) : null,
        iucnCategory: item.iucn?.category ? String(item.iucn.category) : null,
        confidenceLevel: classifyConfidence(score),
      };
    })
    .filter((candidate) => Boolean(candidate.scientificNameWithoutAuthor));

  const topScore = candidates[0]?.score ?? 0;

  return {
    bestMatch: data.bestMatch?.trim() || candidates[0]?.scientificName || null,
    candidates,
    lowConfidenceWarning: candidates.length > 0 && topScore < 0.35,
    remainingRequests:
      typeof data.remainingIdentificationRequests === 'number'
        ? data.remainingIdentificationRequests
        : null,
    version: data.version ? String(data.version) : null,
    languageUsed: data.language || languageUsed,
  };
}

export async function fetchSupportedLanguages(
  config: ServerConfig,
  fetchImpl: FetchLike = fetch
): Promise<LanguagesResponse> {
  if (!config.plantnetApiKey) {
    return {
      languages: ['en'],
      supportsHindi: false,
      source: 'fallback_unconfigured',
      cachedAt: null,
    };
  }

  if (languageCache && Date.now() < languageCache.expiresAt) {
    return {
      languages: languageCache.languages,
      supportsHindi: languageCache.languages.includes('hi'),
      source: 'plantnet_api',
      cachedAt: languageCache.cachedAt,
    };
  }

  const url = `${config.plantnetApiBaseUrl}/v2/languages?api-key=${encodeURIComponent(config.plantnetApiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw mapUpstreamStatusToError(response.status, 'languages');
    }

    const payload = (await response.json()) as unknown;
    const rawList = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { languages?: unknown[] })?.languages)
        ? (payload as { languages: unknown[] }).languages
        : [];

    const languages = Array.from(
      new Set(
        rawList
          .map((code) => String(code).trim().toLowerCase())
          .filter((code) => /^[a-z]{2}(-[a-z]{2})?$/.test(code))
      )
    );

    const normalized = languages.length > 0 ? languages : ['en'];
    const cachedAt = new Date().toISOString();
    languageCache = {
      languages: normalized,
      cachedAt,
      expiresAt: Date.now() + LANGUAGE_CACHE_TTL_MS,
    };

    return {
      languages: normalized,
      supportsHindi: normalized.includes('hi'),
      source: 'plantnet_api',
      cachedAt,
    };
  } catch (err) {
    if (err instanceof AppApiError) throw err;
    if (isTimeoutError(err)) {
      throw new AppApiError(
        504,
        'NETWORK_TIMEOUT',
        'Timed out while checking supported languages.'
      );
    }
    throw new AppApiError(
      502,
      'UPSTREAM_ERROR',
      `Unable to reach supported languages service: ${redactApiKey(err instanceof Error ? err.message : 'Network error')}`
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveApiLanguage(requestedLang: string, supportedLanguages: string[]): string {
  const cleaned = (requestedLang || 'en').trim().toLowerCase().slice(0, 5);
  if (supportedLanguages.includes(cleaned)) {
    return cleaned;
  }
  const base = cleaned.split('-')[0];
  if (supportedLanguages.includes(base)) {
    return base;
  }
  return supportedLanguages.includes('en') ? 'en' : supportedLanguages[0] || 'en';
}

export async function identifyPlantSpecies(
  params: {
    images: Array<{ buffer: Buffer; filename: string; mimeType: 'image/jpeg' | 'image/png' }>;
    organs: OrganType[];
    lang: string;
    nbResults?: number;
  },
  config: ServerConfig,
  fetchImpl: FetchLike = fetch
): Promise<ParsedIdentificationResult> {
  if (!config.plantnetApiKey) {
    throw new AppApiError(
      401,
      'API_KEY_NOT_CONFIGURED',
      'Identification service key is not configured on the server.'
    );
  }

  const query = new URLSearchParams({
    'api-key': config.plantnetApiKey,
    lang: params.lang,
    'nb-results': String(params.nbResults ?? 6),
    detailed: 'true',
  });

  const url = `${config.plantnetApiBaseUrl}/v2/identify/all?${query.toString()}`;
  const formData = new FormData();

  params.images.forEach((img, index) => {
    const blob = new Blob([new Uint8Array(img.buffer)], { type: img.mimeType });
    formData.append('images', blob, img.filename);
    const organ = params.organs[index] || 'auto';
    formData.append('organs', organ);
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      body: formData,
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after');
      throw mapUpstreamStatusToError(response.status, 'identify', retryAfter);
    }

    const json = (await response.json()) as PlantNetIdentifyResponse;
    return parsePlantNetIdentifyResponse(json, params.lang);
  } catch (err) {
    if (err instanceof AppApiError) throw err;
    if (isTimeoutError(err)) {
      throw new AppApiError(
        504,
        'NETWORK_TIMEOUT',
        'Botanical identification timed out. Please check your connection and try again.'
      );
    }
    throw new AppApiError(
      502,
      'UPSTREAM_ERROR',
      `Failed to contact botanical identification service: ${redactApiKey(err instanceof Error ? err.message : 'Network error')}`
    );
  } finally {
    clearTimeout(timeout);
  }
}
