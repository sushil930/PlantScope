import test from 'node:test';
import assert from 'node:assert/strict';
import { getServerConfig, redactApiKey, type ServerConfig } from '../config';
import { detectImageFormatFromMagicBytes, normalizeOrgans, validateUploadedImages } from '../imageValidation';
import {
  clearLanguageCache,
  parsePlantNetIdentifyResponse,
  resolveApiLanguage,
  type FetchLike,
} from '../plantnetService';
import { parsePlantNetDiseaseResponse } from '../diseaseService';
import { parseGbifTaxonomyResponse } from '../gbifService';
import { fetchDailyQuota, isLocallyMarkedExhausted, resetQuotaTracker } from '../quotaService';
import { processPlantScan } from '../resultService';
import { AppApiError } from '../errors';

// Minimal valid 1x1 PNG binary buffer (passes magic byte & IHDR dimension verification)
const VALID_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cfc000000301010018dd8d0000000049454e44ae426082',
  'hex'
);

// Minimal valid JPEG SOI + APP0 header
const VALID_JPEG = Buffer.from('ffd8ffe000104a46494600010101004800480000ffd9', 'hex');

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 3000,
    plantnetApiKey: 'test-free-plantnet-key',
    plantnetApiBaseUrl: 'https://my-api.plantnet.org',
    gbifApiBaseUrl: 'https://api.gbif.org',
    corsOrigins: ['http://localhost:3000'],
    maxImagesPerScan: 5,
    maxImageSizeBytes: 10 * 1024 * 1024,
    maxTotalUploadBytes: 25 * 1024 * 1024,
    requestTimeoutMs: 5000,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

test('API key configuration rejects placeholder keys and redacts URLs', () => {
  const unsetCfg = getServerConfig({ PLANTNET_API_KEY: 'your_private_api_key' });
  assert.equal(unsetCfg.plantnetApiKey, '');

  const setCfg = getServerConfig({ PLANTNET_API_KEY: 'real_free_key_999' });
  assert.equal(setCfg.plantnetApiKey, 'real_free_key_999');

  const redacted = redactApiKey(
    'https://my-api.plantnet.org/v2/identify/all?api-key=real_free_key_999&lang=en'
  );
  assert.ok(!redacted.includes('real_free_key_999'));
  assert.ok(redacted.includes('api-key=[REDACTED]'));
});

test('Image validation accepts valid PNG/JPEG and rejects invalid formats and spoofed headers', () => {
  assert.equal(detectImageFormatFromMagicBytes(VALID_PNG), 'png');
  assert.equal(detectImageFormatFromMagicBytes(VALID_JPEG), 'jpeg');
  assert.equal(detectImageFormatFromMagicBytes(Buffer.from('not-an-image-payload')), null);

  const limits = {
    maxImages: 5,
    maxImageSizeBytes: 1024 * 1024,
    maxTotalUploadBytes: 5 * 1024 * 1024,
  };

  const valid = validateUploadedImages(
    [{ originalname: 'leaf.png', mimetype: 'image/png', size: VALID_PNG.length, buffer: VALID_PNG }],
    limits
  );
  assert.equal(valid.length, 1);
  assert.equal(valid[0].mimeType, 'image/png');

  // Unsupported MIME
  assert.throws(
    () =>
      validateUploadedImages(
        [{ originalname: 'notes.txt', mimetype: 'text/plain', size: 12, buffer: Buffer.from('hello world!') }],
        limits
      ),
    (err: unknown) => err instanceof AppApiError && err.code === 'INVALID_IMAGE_FORMAT'
  );

  // Spoofed MIME with non-image bytes
  assert.throws(
    () =>
      validateUploadedImages(
        [{ originalname: 'fake.jpg', mimetype: 'image/jpeg', size: 16, buffer: Buffer.from('0123456789abcdef') }],
        limits
      ),
    (err: unknown) => err instanceof AppApiError && err.code === 'INVALID_IMAGE_FORMAT'
  );
});

test('Image validation rejects more than 5 images and invalid organs', () => {
  const limits = {
    maxImages: 5,
    maxImageSizeBytes: 1024 * 1024,
    maxTotalUploadBytes: 5 * 1024 * 1024,
  };

  const sixFiles = Array.from({ length: 6 }, (_, i) => ({
    originalname: `photo-${i}.png`,
    mimetype: 'image/png',
    size: VALID_PNG.length,
    buffer: VALID_PNG,
  }));

  assert.throws(
    () => validateUploadedImages(sixFiles, limits),
    (err: unknown) => err instanceof AppApiError && err.code === 'TOO_MANY_IMAGES'
  );

  assert.deepEqual(normalizeOrgans(['leaf', 'flower'], 2), ['leaf', 'flower']);
  assert.throws(
    () => normalizeOrgans(['root'], 1),
    (err: unknown) => err instanceof AppApiError && err.code === 'INVALID_REQUEST'
  );
});

test('PlantNet species response parsing extracts scores, common names, GBIF ID, and low-confidence flag', () => {
  const parsed = parsePlantNetIdentifyResponse(
    {
      bestMatch: 'Solanum lycopersicum L.',
      remainingIdentificationRequests: 492,
      version: '2026-01',
      results: [
        {
          score: 0.842,
          species: {
            scientificName: 'Solanum lycopersicum L.',
            scientificNameWithoutAuthor: 'Solanum lycopersicum',
            scientificNameAuthorship: 'L.',
            commonNames: ['Tomato', 'Garden tomato'],
            family: { scientificNameWithoutAuthor: 'Solanaceae' },
            genus: { scientificNameWithoutAuthor: 'Solanum' },
          },
          gbif: { id: '2930137' },
        },
      ],
    },
    'en'
  );

  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.candidates[0].scientificNameWithoutAuthor, 'Solanum lycopersicum');
  assert.equal(parsed.candidates[0].family, 'Solanaceae');
  assert.equal(parsed.candidates[0].gbifId, '2930137');
  assert.equal(parsed.candidates[0].confidenceLevel, 'high');
  assert.equal(parsed.lowConfidenceWarning, false);

  const lowConfidence = parsePlantNetIdentifyResponse(
    {
      results: [
        {
          score: 0.18,
          species: { scientificNameWithoutAuthor: 'Ficus religiosa', commonNames: ['Peepal'] },
        },
      ],
    },
    'en'
  );
  assert.equal(lowConfidence.lowConfidenceWarning, true);
  assert.equal(lowConfidence.candidates[0].confidenceLevel, 'low');
});

test('Disease response parsing distinguishes detected, no supported match, and inconclusive states', () => {
  const detected = parsePlantNetDiseaseResponse({
    remainingIdentificationRequests: 490,
    results: [
      {
        name: 'PHYPIN',
        description: 'Late blight (Phytophthora infestans)',
        score: 0.67,
        categories: ['Fungi'],
        images: [
          {
            url: { m: 'https://bs.plantnet.org/image/m/sample.jpg' },
            author: 'Botanical Lab',
            license: 'cc-by-sa',
          },
        ],
      },
    ],
  });
  assert.equal(detected.status, 'possible_disease_detected');
  assert.equal(detected.candidates[0].eppoCode, 'PHYPIN');
  assert.equal(detected.candidates[0].images.length, 1);

  const empty = parsePlantNetDiseaseResponse({ results: [] });
  assert.equal(empty.status, 'no_supported_match');

  const inconclusive = parsePlantNetDiseaseResponse({
    results: [{ name: 'ALTRSO', description: 'Early blight', score: 0.11 }],
  });
  assert.equal(inconclusive.status, 'inconclusive');
});

test('GBIF taxonomy parsing preserves missing ranks as null without inventing values', () => {
  const taxonomy = parseGbifTaxonomyResponse({
    usage: {
      key: 2930137,
      name: 'Solanum lycopersicum L.',
      canonicalName: 'Solanum lycopersicum',
      status: 'ACCEPTED',
    },
    classification: [
      { rank: 'KINGDOM', name: 'Plantae' },
      { rank: 'PHYLUM', name: 'Tracheophyta' },
      { rank: 'FAMILY', name: 'Solanaceae' },
      { rank: 'GENUS', name: 'Solanum' },
      { rank: 'SPECIES', name: 'Solanum lycopersicum' },
    ],
    diagnostics: { matchType: 'EXACT' },
  });

  assert.equal(taxonomy.kingdom, 'Plantae');
  assert.equal(taxonomy.phylum, 'Tracheophyta');
  assert.equal(taxonomy.class, null);
  assert.equal(taxonomy.order, null);
  assert.equal(taxonomy.family, 'Solanaceae');
  assert.equal(taxonomy.verifiedByGbif, true);
});

test('Full scan pipeline handles partial disease failure without failing plant identification', async () => {
  clearLanguageCache();
  resetQuotaTracker();

  const mockFetch: FetchLike = async (input) => {
    const url = String(input);
    if (url.includes('/v2/languages')) {
      return jsonResponse(['en', 'fr', 'es']);
    }
    if (url.includes('/v2/identify/all')) {
      return jsonResponse({
        bestMatch: 'Azadirachta indica A.Juss.',
        remainingIdentificationRequests: 488,
        version: '2026-01',
        results: [
          {
            score: 0.91,
            species: {
              scientificName: 'Azadirachta indica A.Juss.',
              scientificNameWithoutAuthor: 'Azadirachta indica',
              commonNames: ['Neem'],
              family: { scientificNameWithoutAuthor: 'Meliaceae' },
              genus: { scientificNameWithoutAuthor: 'Azadirachta' },
            },
            gbif: { id: '3190474' },
          },
        ],
      });
    }
    if (url.includes('/v2/species/match')) {
      return jsonResponse({
        usage: { key: 3190474, canonicalName: 'Azadirachta indica', status: 'ACCEPTED' },
        classification: [
          { rank: 'KINGDOM', name: 'Plantae' },
          { rank: 'PHYLUM', name: 'Tracheophyta' },
          { rank: 'CLASS', name: 'Magnoliopsida' },
          { rank: 'ORDER', name: 'Sapindales' },
          { rank: 'FAMILY', name: 'Meliaceae' },
          { rank: 'GENUS', name: 'Azadirachta' },
          { rank: 'SPECIES', name: 'Azadirachta indica' },
        ],
        diagnostics: { matchType: 'EXACT' },
      });
    }
    if (url.includes('/synonyms')) {
      return jsonResponse({ results: [{ scientificName: 'Melia azadirachta L.' }] });
    }
    if (url.includes('/v2/diseases/identify')) {
      return jsonResponse({ message: 'Disease service overloaded' }, 502);
    }
    return jsonResponse({}, 404);
  };

  const result = await processPlantScan(
    {
      files: [{ originalname: 'neem.png', mimetype: 'image/png', size: VALID_PNG.length, buffer: VALID_PNG }],
      organs: ['leaf'],
      language: 'hi',
      includeDisease: true,
    },
    makeConfig(),
    mockFetch
  );

  assert.equal(result.candidates[0].scientificNameWithoutAuthor, 'Azadirachta indica');
  assert.equal(result.languageSentToApi, 'en');
  assert.ok(result.warnings.includes('hindi_api_fallback'));
  assert.equal(result.taxonomy?.order, 'Sapindales');
  assert.deepEqual(result.taxonomy?.synonyms, ['Melia azadirachta L.']);
  assert.equal(result.disease.status, 'unavailable');
  assert.ok(result.warnings.includes('disease_analysis_unavailable'));
});

test('Unsupported disease result (HTTP 404) maps to no_supported_match', async () => {
  clearLanguageCache();
  resetQuotaTracker();

  const mockFetch: FetchLike = async (input) => {
    const url = String(input);
    if (url.includes('/v2/languages')) return jsonResponse(['en']);
    if (url.includes('/v2/identify/all')) {
      return jsonResponse({
        remainingIdentificationRequests: 480,
        results: [
          {
            score: 0.78,
            species: { scientificNameWithoutAuthor: 'Mangifera indica', commonNames: ['Mango'] },
          },
        ],
      });
    }
    if (url.includes('/v2/species/match')) return jsonResponse({}, 404);
    if (url.includes('/v2/diseases/identify')) return jsonResponse({ message: 'Not found' }, 404);
    return jsonResponse({}, 404);
  };

  const result = await processPlantScan(
    {
      files: [{ originalname: 'mango.jpg', mimetype: 'image/jpeg', size: VALID_JPEG.length, buffer: VALID_JPEG }],
      organs: ['leaf'],
      language: 'en',
      includeDisease: true,
    },
    makeConfig(),
    mockFetch
  );

  assert.equal(result.disease.status, 'no_supported_match');
  assert.equal(result.candidates[0].scientificNameWithoutAuthor, 'Mangifera indica');
});

test('Empty API results and quota exhaustion stop further upstream calls without retries', async () => {
  clearLanguageCache();
  resetQuotaTracker();

  // 1. Empty results
  const emptyFetch: FetchLike = async (input) => {
    const url = String(input);
    if (url.includes('/v2/languages')) return jsonResponse(['en']);
    if (url.includes('/v2/identify/all')) return jsonResponse({ results: [], remainingIdentificationRequests: 100 });
    return jsonResponse({}, 404);
  };

  const emptyResult = await processPlantScan(
    {
      files: [{ originalname: 'blur.png', mimetype: 'image/png', size: VALID_PNG.length, buffer: VALID_PNG }],
      language: 'en',
      includeDisease: false,
    },
    makeConfig(),
    emptyFetch
  );
  assert.equal(emptyResult.candidates.length, 0);
  assert.ok(emptyResult.warnings.includes('no_species_candidates'));

  // 2. Quota exhausted (HTTP 429) marks local exhaustion and prevents calling upstream again
  let identifyCalls = 0;
  const exhaustedFetch: FetchLike = async (input) => {
    const url = String(input);
    if (url.includes('/v2/languages')) return jsonResponse(['en']);
    if (url.includes('/v2/identify/all')) {
      identifyCalls += 1;
      return jsonResponse({ message: 'Too many requests' }, 429);
    }
    return jsonResponse({}, 404);
  };

  await assert.rejects(
    () =>
      processPlantScan(
        {
          files: [{ originalname: 'leaf.png', mimetype: 'image/png', size: VALID_PNG.length, buffer: VALID_PNG }],
          language: 'en',
          includeDisease: false,
        },
        makeConfig(),
        exhaustedFetch
      ),
    (err: unknown) => err instanceof AppApiError && err.code === 'QUOTA_EXHAUSTED'
  );

  assert.equal(identifyCalls, 1);
  assert.equal(isLocallyMarkedExhausted(), true);

  // Subsequent scan fails locally without making a second upstream call
  await assert.rejects(
    () =>
      processPlantScan(
        {
          files: [{ originalname: 'leaf.png', mimetype: 'image/png', size: VALID_PNG.length, buffer: VALID_PNG }],
          language: 'en',
          includeDisease: false,
        },
        makeConfig(),
        exhaustedFetch
      ),
    (err: unknown) => err instanceof AppApiError && err.code === 'QUOTA_EXHAUSTED'
  );
  assert.equal(identifyCalls, 1);

  const quotaInfo = await fetchDailyQuota(makeConfig(), exhaustedFetch);
  assert.equal(quotaInfo.exhausted, true);
  assert.equal(quotaInfo.remaining, 0);
});

test('Network errors and missing API key return structured user-friendly errors', async () => {
  clearLanguageCache();
  resetQuotaTracker();

  // Missing API key
  await assert.rejects(
    () =>
      processPlantScan(
        {
          files: [{ originalname: 'leaf.png', mimetype: 'image/png', size: VALID_PNG.length, buffer: VALID_PNG }],
          language: 'en',
          includeDisease: false,
        },
        makeConfig({ plantnetApiKey: '' })
      ),
    (err: unknown) => err instanceof AppApiError && err.code === 'API_KEY_NOT_CONFIGURED'
  );

  // Network timeout (AbortError)
  const timeoutFetch: FetchLike = async (input) => {
    if (String(input).includes('/v2/languages')) return jsonResponse(['en']);
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  };

  await assert.rejects(
    () =>
      processPlantScan(
        {
          files: [{ originalname: 'leaf.png', mimetype: 'image/png', size: VALID_PNG.length, buffer: VALID_PNG }],
          language: 'en',
          includeDisease: false,
        },
        makeConfig(),
        timeoutFetch
      ),
    (err: unknown) => err instanceof AppApiError && err.code === 'NETWORK_TIMEOUT'
  );

  assert.equal(resolveApiLanguage('hi', ['en', 'hi']), 'hi');
  assert.equal(resolveApiLanguage('hi', ['en', 'fr']), 'en');
});
