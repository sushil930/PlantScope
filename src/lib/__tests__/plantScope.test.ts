import test from 'node:test';
import assert from 'node:assert/strict';
import en from '../../i18n/en.json';
import hi from '../../i18n/hi.json';
import {
  createStoredRecordFromScan,
  filterAndSortHistory,
  formatScorePercent,
  getErrorTranslationKey,
  MAX_IMAGES_PER_SCAN,
  validateClientImageFiles,
} from '../utils';
import type { ApiErrorCode, ScanResult } from '../../types/plant';

function makeMockFile(name: string, type: string, sizeBytes: number): File {
  const content = new Uint8Array(Math.min(sizeBytes, 16));
  const file = new File([content], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...collectKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

function makeSampleScan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    id: 'scan-001',
    timestamp: '2026-11-20T10:00:00.000Z',
    languageRequested: 'en',
    languageSentToApi: 'en',
    imageCount: 2,
    organs: ['leaf', 'flower'],
    bestMatch: 'Solanum lycopersicum L.',
    lowConfidenceWarning: false,
    candidates: [
      {
        scientificName: 'Solanum lycopersicum L.',
        scientificNameWithoutAuthor: 'Solanum lycopersicum',
        author: 'L.',
        commonNames: ['Tomato'],
        family: 'Solanaceae',
        genus: 'Solanum',
        score: 0.875,
        gbifId: '2930137',
        powoId: null,
        iucnCategory: null,
        confidenceLevel: 'high',
      },
    ],
    taxonomy: {
      kingdom: 'Plantae',
      phylum: 'Tracheophyta',
      class: 'Magnoliopsida',
      order: 'Solanales',
      family: 'Solanaceae',
      genus: 'Solanum',
      species: 'Solanum lycopersicum',
      gbifUsageKey: 2930137,
      canonicalName: 'Solanum lycopersicum',
      scientificName: 'Solanum lycopersicum L.',
      taxonomicStatus: 'ACCEPTED',
      matchType: 'EXACT',
      synonyms: ['Lycopersicon esculentum Mill.'],
      verifiedByGbif: true,
    },
    disease: {
      enabled: true,
      status: 'no_supported_match',
      candidates: [],
      remainingRequests: 495,
      version: '2026-01',
    },
    quotaRemaining: 495,
    plantnetVersion: '2026-01',
    attribution: {
      plantnet: 'Plant identification powered by Pl@ntNet.',
      gbif: 'Taxonomic backbone verification powered by GBIF.',
    },
    warnings: [],
    ...overrides,
  };
}

test('Client image upload validation enforces allowed formats, 10MB size limit, and 5-image cap', () => {
  const validJpg = makeMockFile('leaf.jpg', 'image/jpeg', 500_000);
  const validPng = makeMockFile('flower.png', 'image/png', 800_000);
  const badWebp = makeMockFile('leaf.webp', 'image/webp', 200_000);
  const hugeJpg = makeMockFile('huge.jpg', 'image/jpeg', 12 * 1024 * 1024);

  const res = validateClientImageFiles([validJpg, validPng, badWebp, hugeJpg], 0);
  assert.equal(res.validFiles.length, 2);
  assert.equal(res.errors.length, 2);
  assert.equal(res.errors[0].key, 'invalidType');
  assert.equal(res.errors[1].key, 'tooLarge');

  // Enforces maximum of 5 images across existing + incoming
  const extra = [
    makeMockFile('a.jpg', 'image/jpeg', 1000),
    makeMockFile('b.jpg', 'image/jpeg', 1000),
  ];
  const capped = validateClientImageFiles(extra, MAX_IMAGES_PER_SCAN - 1);
  assert.equal(capped.validFiles.length, 1);
  assert.equal(capped.errors[0].key, 'maxImages');
});

test('English and Hindi i18n dictionaries have complete key parity, cover all error codes, and omit third-party API names', () => {
  const enKeys = collectKeys(en as unknown as Record<string, unknown>);
  const hiKeys = collectKeys(hi as unknown as Record<string, unknown>);
  assert.deepEqual(enKeys, hiKeys);

  const collectValues = (obj: unknown): string[] => {
    if (typeof obj === 'string') return [obj];
    if (Array.isArray(obj)) return obj.flatMap(collectValues);
    if (obj && typeof obj === 'object') return Object.values(obj).flatMap(collectValues);
    return [];
  };
  const allVisibleText = [...collectValues(en), ...collectValues(hi)].join('\n');
  assert.doesNotMatch(allVisibleText, /pl@?ntnet|gbif/i);

  const errorCodes: ApiErrorCode[] = [
    'API_KEY_NOT_CONFIGURED',
    'INVALID_IMAGE_FORMAT',
    'TOO_MANY_IMAGES',
    'NO_IMAGES',
    'IMAGE_TOO_LARGE',
    'REQUEST_TOO_LARGE',
    'INVALID_REQUEST',
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'QUOTA_EXHAUSTED',
    'UPSTREAM_ERROR',
    'NETWORK_TIMEOUT',
    'UNKNOWN_ERROR',
  ];

  for (const code of errorCodes) {
    const key = getErrorTranslationKey(code);
    assert.equal(key, `errors.${code}`);
    assert.ok((en.errors as Record<string, string>)[code]);
    assert.ok((hi.errors as Record<string, string>)[code]);
  }
});

test('Results formatting and local history record creation omit photos unless opted in', () => {
  assert.equal(formatScorePercent(0.875), '87.5%');
  assert.equal(formatScorePercent(0), '0.0%');
  assert.equal(formatScorePercent(1.2), '100.0%');

  const scan = makeSampleScan();
  const withoutPhoto = createStoredRecordFromScan(scan);
  assert.equal(withoutPhoto.commonName, 'Tomato');
  assert.equal(withoutPhoto.scientificName, 'Solanum lycopersicum');
  assert.equal(withoutPhoto.thumbnailDataUrl, undefined);

  const withPhoto = createStoredRecordFromScan(scan, 'data:image/jpeg;base64,abc');
  assert.equal(withPhoto.thumbnailDataUrl, 'data:image/jpeg;base64,abc');
});

test('History search and newest/oldest sorting operate deterministically', () => {
  const older = createStoredRecordFromScan(
    makeSampleScan({
      id: 'scan-old',
      timestamp: '2026-11-18T08:00:00.000Z',
    })
  );

  const newer = createStoredRecordFromScan(
    makeSampleScan({
      id: 'scan-new',
      timestamp: '2026-11-21T14:30:00.000Z',
      bestMatch: 'Ocimum tenuiflorum L.',
      candidates: [
        {
          scientificName: 'Ocimum tenuiflorum L.',
          scientificNameWithoutAuthor: 'Ocimum tenuiflorum',
          author: 'L.',
          commonNames: ['Holy basil', 'Tulsi'],
          family: 'Lamiaceae',
          genus: 'Ocimum',
          score: 0.92,
          gbifId: '2927082',
          powoId: null,
          iucnCategory: null,
          confidenceLevel: 'high',
        },
      ],
    })
  );

  const newestFirst = filterAndSortHistory([older, newer], '', 'newest');
  assert.deepEqual(
    newestFirst.map((r) => r.id),
    ['scan-new', 'scan-old']
  );

  const oldestFirst = filterAndSortHistory([older, newer], '', 'oldest');
  assert.deepEqual(
    oldestFirst.map((r) => r.id),
    ['scan-old', 'scan-new']
  );

  const searchByCommon = filterAndSortHistory([older, newer], 'tulsi', 'newest');
  assert.equal(searchByCommon.length, 1);
  assert.equal(searchByCommon[0].id, 'scan-new');

  const searchByFamily = filterAndSortHistory([older, newer], 'solanaceae', 'newest');
  assert.equal(searchByFamily.length, 1);
  assert.equal(searchByFamily[0].id, 'scan-old');
});
