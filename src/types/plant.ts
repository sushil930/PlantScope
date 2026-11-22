export type OrganType = 'auto' | 'leaf' | 'flower' | 'fruit' | 'bark';

export type ApiErrorCode =
  | 'API_KEY_NOT_CONFIGURED'
  | 'INVALID_IMAGE_FORMAT'
  | 'TOO_MANY_IMAGES'
  | 'NO_IMAGES'
  | 'IMAGE_TOO_LARGE'
  | 'REQUEST_TOO_LARGE'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'QUOTA_EXHAUSTED'
  | 'UPSTREAM_ERROR'
  | 'NETWORK_TIMEOUT'
  | 'UNKNOWN_ERROR';

export interface ApiErrorPayload {
  error: {
    code: ApiErrorCode;
    message: string;
    status: number;
    details?: string;
    resetAt?: string | null;
  };
}

export interface HealthResponse {
  status: 'ok';
  service: string;
  plantnetConfigured: boolean;
  plantnetBaseUrl: string;
  gbifBaseUrl: string;
  limits: {
    maxImages: number;
    maxImageSizeMb: number;
    maxTotalSizeMb: number;
  };
}

export interface QuotaInfo {
  available: boolean;
  configured: boolean;
  dailyLimit: number | null;
  remaining: number | null;
  used: number | null;
  resetAt: string | null;
  exhausted: boolean;
  message?: string;
  errorCode?: ApiErrorCode;
}

export interface LanguagesResponse {
  languages: string[];
  supportsHindi: boolean;
  source: 'plantnet_api' | 'fallback_unconfigured';
  cachedAt: string | null;
}

export interface PlantCandidate {
  scientificName: string;
  scientificNameWithoutAuthor: string;
  author: string | null;
  commonNames: string[];
  family: string | null;
  genus: string | null;
  score: number;
  gbifId: string | null;
  powoId: string | null;
  iucnCategory: string | null;
  confidenceLevel: 'high' | 'moderate' | 'low';
}

export interface TaxonomyHierarchy {
  kingdom: string | null;
  phylum: string | null;
  class: string | null;
  order: string | null;
  family: string | null;
  genus: string | null;
  species: string | null;
  gbifUsageKey: number | null;
  canonicalName: string | null;
  scientificName: string | null;
  taxonomicStatus: string | null;
  matchType: string | null;
  synonyms: string[];
  verifiedByGbif: boolean;
}

export interface DiseaseImageAttribution {
  url: string;
  organ: string | null;
  author: string | null;
  license: string | null;
  citation: string | null;
}

export interface DiseaseCandidate {
  name: string;
  label: string;
  eppoCode: string | null;
  score: number;
  description: string | null;
  categories: string[];
  images: DiseaseImageAttribution[];
}

export type DiseaseAnalysisStatus =
  | 'not_requested'
  | 'possible_disease_detected'
  | 'no_supported_match'
  | 'inconclusive'
  | 'unavailable';

export interface DiseaseAnalysisResult {
  enabled: boolean;
  status: DiseaseAnalysisStatus;
  candidates: DiseaseCandidate[];
  remainingRequests: number | null;
  version: string | null;
  errorCode?: ApiErrorCode;
  errorMessage?: string;
}

export interface ScanResult {
  id: string;
  timestamp: string;
  languageRequested: string;
  languageSentToApi: string;
  imageCount: number;
  organs: OrganType[];
  bestMatch: string | null;
  lowConfidenceWarning: boolean;
  candidates: PlantCandidate[];
  taxonomy: TaxonomyHierarchy | null;
  disease: DiseaseAnalysisResult;
  quotaRemaining: number | null;
  plantnetVersion: string | null;
  attribution: {
    plantnet: string;
    gbif: string;
  };
  warnings: string[];
}

export interface StoredScanRecord {
  id: string;
  timestamp: string;
  commonName: string;
  scientificName: string;
  score: number;
  diseaseStatus: DiseaseAnalysisStatus;
  result: ScanResult;
  thumbnailDataUrl?: string | null;
}
