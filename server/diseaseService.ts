import type {
  DiseaseAnalysisResult,
  DiseaseCandidate,
  DiseaseImageAttribution,
  OrganType,
} from '../src/types/plant';
import { type ServerConfig, redactApiKey } from './config';
import { AppApiError, isTimeoutError, mapUpstreamStatusToError } from './errors';
import type { FetchLike } from './plantnetService';

export interface PlantNetDiseaseRawImage {
  organ?: string;
  author?: string;
  license?: string;
  citation?: string;
  url?: { s?: string; m?: string; o?: string } | string;
}

export interface PlantNetDiseaseRawItem {
  name?: string;
  label?: string;
  eppoCode?: string;
  code?: string;
  description?: string;
  score?: number;
  categories?: string[];
  images?: PlantNetDiseaseRawImage[];
}

export interface PlantNetDiseaseApiResponse {
  results?: PlantNetDiseaseRawItem[];
  remainingIdentificationRequests?: number;
  version?: string;
}

const EPPO_PATTERN = /^[A-Z0-9]{4,8}$/;
const INCONCLUSIVE_SCORE_THRESHOLD = 0.2;

function isSafeHttpsUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseDiseaseImages(rawImages: PlantNetDiseaseRawImage[] | undefined): DiseaseImageAttribution[] {
  if (!Array.isArray(rawImages)) return [];
  const parsed: DiseaseImageAttribution[] = [];

  for (const img of rawImages.slice(0, 4)) {
    const urlCandidate =
      typeof img.url === 'string' ? img.url : img.url?.m || img.url?.s || img.url?.o;
    if (!isSafeHttpsUrl(urlCandidate)) continue;
    parsed.push({
      url: urlCandidate,
      organ: img.organ ? String(img.organ) : null,
      author: img.author ? String(img.author) : null,
      license: img.license ? String(img.license) : null,
      citation: img.citation ? String(img.citation) : null,
    });
  }

  return parsed;
}

export function parsePlantNetDiseaseResponse(
  data: PlantNetDiseaseApiResponse
): DiseaseAnalysisResult {
  const rawResults = Array.isArray(data?.results) ? data.results : [];
  const remainingRequests =
    typeof data?.remainingIdentificationRequests === 'number'
      ? data.remainingIdentificationRequests
      : null;
  const version = data?.version ? String(data.version) : null;

  const candidates: DiseaseCandidate[] = rawResults
    .filter((item) => item && typeof item.score === 'number')
    .map((item) => {
      const rawName = (item.name || '').trim();
      const rawLabel = (item.label || '').trim();
      const rawDescription = (item.description || '').trim();
      const explicitCode = (item.eppoCode || item.code || '').trim();

      const eppoCode =
        explicitCode || (EPPO_PATTERN.test(rawName) ? rawName : null);

      const displayLabel =
        rawLabel ||
        (eppoCode && rawDescription ? rawDescription : rawName) ||
        eppoCode ||
        'Unnamed pathology prediction';

      const description =
        rawDescription && rawDescription !== displayLabel ? rawDescription : null;

      return {
        name: rawName || displayLabel,
        label: displayLabel,
        eppoCode,
        score: Math.max(0, Math.min(1, Number(item.score))),
        description,
        categories: Array.isArray(item.categories)
          ? item.categories.map((c) => String(c).trim()).filter(Boolean)
          : [],
        images: parseDiseaseImages(item.images),
      };
    });

  if (candidates.length === 0) {
    return {
      enabled: true,
      status: 'no_supported_match',
      candidates: [],
      remainingRequests,
      version,
    };
  }

  const topScore = candidates[0].score;
  if (topScore < INCONCLUSIVE_SCORE_THRESHOLD) {
    return {
      enabled: true,
      status: 'inconclusive',
      candidates,
      remainingRequests,
      version,
    };
  }

  return {
    enabled: true,
    status: 'possible_disease_detected',
    candidates,
    remainingRequests,
    version,
  };
}

export async function identifyPlantDiseases(
  params: {
    images: Array<{ buffer: Buffer; filename: string; mimeType: 'image/jpeg' | 'image/png' }>;
    organs: OrganType[];
    lang: string;
    nbResults?: number;
  },
  config: ServerConfig,
  fetchImpl: FetchLike = fetch
): Promise<DiseaseAnalysisResult> {
  if (!config.plantnetApiKey) {
    return {
      enabled: true,
      status: 'unavailable',
      candidates: [],
      remainingRequests: null,
      version: null,
      errorCode: 'API_KEY_NOT_CONFIGURED',
      errorMessage: 'PLANTNET_API_KEY is not configured on the server.',
    };
  }

  const query = new URLSearchParams({
    'api-key': config.plantnetApiKey,
    lang: params.lang,
    'nb-results': String(params.nbResults ?? 5),
    'include-related-images': 'true',
  });

  const url = `${config.plantnetApiBaseUrl}/v2/diseases/identify?${query.toString()}`;
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

    if (response.status === 404) {
      return {
        enabled: true,
        status: 'no_supported_match',
        candidates: [],
        remainingRequests: null,
        version: null,
      };
    }

    if (!response.ok) {
      const mapped = mapUpstreamStatusToError(
        response.status,
        'disease',
        response.headers.get('retry-after')
      );
      return {
        enabled: true,
        status: 'unavailable',
        candidates: [],
        remainingRequests: null,
        version: null,
        errorCode: mapped.code,
        errorMessage: mapped.message,
      };
    }

    const json = (await response.json()) as PlantNetDiseaseApiResponse;
    return parsePlantNetDiseaseResponse(json);
  } catch (err) {
    if (err instanceof AppApiError) {
      return {
        enabled: true,
        status: 'unavailable',
        candidates: [],
        remainingRequests: null,
        version: null,
        errorCode: err.code,
        errorMessage: err.message,
      };
    }

    const timedOut = isTimeoutError(err);
    return {
      enabled: true,
      status: 'unavailable',
      candidates: [],
      remainingRequests: null,
      version: null,
      errorCode: timedOut ? 'NETWORK_TIMEOUT' : 'UPSTREAM_ERROR',
      errorMessage: timedOut
        ? 'Plant disease identification timed out. Plant species results remain available.'
        : `Disease identification service could not be reached: ${redactApiKey(err instanceof Error ? err.message : 'Network error')}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
