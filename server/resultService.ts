import crypto from 'node:crypto';
import type { DiseaseAnalysisResult, OrganType, ScanResult } from '../src/types/plant';
import type { ServerConfig } from './config';
import { identifyPlantDiseases } from './diseaseService';
import { AppApiError } from './errors';
import { fetchGbifTaxonomy } from './gbifService';
import {
  type UploadedImageBuffer,
  normalizeOrgans,
  validateUploadedImages,
} from './imageValidation';
import {
  type FetchLike,
  fetchSupportedLanguages,
  identifyPlantSpecies,
  resolveApiLanguage,
} from './plantnetService';
import { isLocallyMarkedExhausted, markQuotaExhausted, recordRemainingQuota } from './quotaService';

export interface ProcessScanInput {
  files: UploadedImageBuffer[];
  organs?: unknown;
  language?: string;
  includeDisease?: boolean;
}

export async function processPlantScan(
  input: ProcessScanInput,
  config: ServerConfig,
  fetchImpl: FetchLike = fetch
): Promise<ScanResult> {
  // 1-6. Validate images in memory (never written permanently to disk)
  const validatedImages = validateUploadedImages(input.files, {
    maxImages: config.maxImagesPerScan,
    maxImageSizeBytes: config.maxImageSizeBytes,
    maxTotalUploadBytes: config.maxTotalUploadBytes,
  });

  const normalizedOrgans: OrganType[] = normalizeOrgans(input.organs, validatedImages.length);
  const requestedLanguage = (input.language || 'en').trim().toLowerCase().slice(0, 5) || 'en';
  const includeDisease = Boolean(input.includeDisease);

  if (!config.plantnetApiKey) {
    throw new AppApiError(
      401,
      'API_KEY_NOT_CONFIGURED',
      'The identification service key is not configured on the server.'
    );
  }

  // Stop immediately if quota is already known to be exhausted today
  if (isLocallyMarkedExhausted()) {
    throw new AppApiError(
      429,
      'QUOTA_EXHAUSTED',
      'The daily scan allowance has been reached. Scanning is disabled until the daily reset.'
    );
  }

  // Resolve supported language against Pl@ntNet /v2/languages
  let languageToSend = 'en';
  try {
    const langInfo = await fetchSupportedLanguages(config, fetchImpl);
    languageToSend = resolveApiLanguage(requestedLanguage, langInfo.languages);
  } catch {
    languageToSend = 'en';
  }

  // 7-8. Call Pl@ntNet species identification
  let identification;
  try {
    identification = await identifyPlantSpecies(
      {
        images: validatedImages,
        organs: normalizedOrgans,
        lang: languageToSend,
        nbResults: 6,
      },
      config,
      fetchImpl
    );
  } catch (err) {
    if (err instanceof AppApiError && err.code === 'QUOTA_EXHAUSTED') {
      markQuotaExhausted();
    }
    throw err;
  }

  recordRemainingQuota(identification.remainingRequests);

  const warnings: string[] = [];
  if (identification.candidates.length === 0) {
    warnings.push('no_species_candidates');
  } else if (identification.lowConfidenceWarning) {
    warnings.push('low_confidence_species');
  }

  if (requestedLanguage === 'hi' && languageToSend !== 'hi') {
    warnings.push('hindi_api_fallback');
  }

  // 9. Enrich top species candidate with GBIF Taxon API
  const topCandidate = identification.candidates[0] ?? null;
  const taxonomy = topCandidate
    ? await fetchGbifTaxonomy(
        topCandidate.scientificNameWithoutAuthor,
        config,
        {
          family: topCandidate.family,
          genus: topCandidate.genus,
          gbifId: topCandidate.gbifId,
        },
        fetchImpl
      )
    : null;

  // 10. Optional Pl@ntNet disease identification (separate failure boundary)
  let diseaseResult: DiseaseAnalysisResult = {
    enabled: false,
    status: 'not_requested',
    candidates: [],
    remainingRequests: identification.remainingRequests,
    version: null,
  };

  let latestRemaining = identification.remainingRequests;

  if (includeDisease) {
    if (latestRemaining !== null && latestRemaining <= 0) {
      markQuotaExhausted();
      diseaseResult = {
        enabled: true,
        status: 'unavailable',
        candidates: [],
        remainingRequests: 0,
        version: null,
        errorCode: 'QUOTA_EXHAUSTED',
        errorMessage:
          'Daily scan allowance was reached after species identification, so disease analysis could not be performed.',
      };
      warnings.push('disease_skipped_quota');
    } else {
      diseaseResult = await identifyPlantDiseases(
        {
          images: validatedImages,
          organs: normalizedOrgans,
          lang: languageToSend,
          nbResults: 5,
        },
        config,
        fetchImpl
      );

      if (diseaseResult.errorCode === 'QUOTA_EXHAUSTED') {
        markQuotaExhausted();
      }
      if (diseaseResult.remainingRequests !== null) {
        latestRemaining = diseaseResult.remainingRequests;
        recordRemainingQuota(latestRemaining);
      }
      if (diseaseResult.status === 'unavailable') {
        warnings.push('disease_analysis_unavailable');
      }
    }
  }

  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    languageRequested: requestedLanguage,
    languageSentToApi: languageToSend,
    imageCount: validatedImages.length,
    organs: normalizedOrgans,
    bestMatch: identification.bestMatch,
    lowConfidenceWarning: identification.lowConfidenceWarning,
    candidates: identification.candidates,
    taxonomy,
    disease: diseaseResult,
    quotaRemaining: latestRemaining,
    plantnetVersion: identification.version,
    attribution: {
      plantnet: 'PlantScope AI Botanical Recognition Engine.',
      gbif: 'PlantScope AI Taxonomic Classification Engine.',
    },
    warnings,
  };
}
