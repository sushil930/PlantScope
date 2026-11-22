import type { TaxonomyHierarchy } from '../src/types/plant';
import type { ServerConfig } from './config';
import type { FetchLike } from './plantnetService';

interface GbifClassificationNode {
  key?: number;
  name?: string;
  rank?: string;
}

export interface GbifMatchApiResponse {
  // GBIF v2 /v2/species/match response shape
  usage?: {
    key?: number;
    name?: string;
    canonicalName?: string;
    rank?: string;
    status?: string;
  };
  acceptedUsage?: {
    key?: number;
    name?: string;
    canonicalName?: string;
  };
  classification?: GbifClassificationNode[];
  diagnostics?: {
    matchType?: string;
    confidence?: number;
    status?: string;
  };
  synonym?: boolean;
  // Flat taxonomy properties (also supported by GBIF taxon objects)
  usageKey?: number;
  scientificName?: string;
  canonicalName?: string;
  status?: string;
  matchType?: string;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
  species?: string;
}

export function parseGbifTaxonomyResponse(
  data: GbifMatchApiResponse | null,
  fallback?: { family?: string | null; genus?: string | null; species?: string | null; gbifId?: string | null }
): TaxonomyHierarchy {
  if (!data) {
    return {
      kingdom: null,
      phylum: null,
      class: null,
      order: null,
      family: fallback?.family ?? null,
      genus: fallback?.genus ?? null,
      species: fallback?.species ?? null,
      gbifUsageKey: fallback?.gbifId ? Number(fallback.gbifId) || null : null,
      canonicalName: fallback?.species ?? null,
      scientificName: fallback?.species ?? null,
      taxonomicStatus: null,
      matchType: 'NONE',
      synonyms: [],
      verifiedByGbif: false,
    };
  }

  const rankMap: Record<string, string> = {};
  if (Array.isArray(data.classification)) {
    for (const node of data.classification) {
      if (node.rank && node.name) {
        rankMap[node.rank.toUpperCase()] = node.name.trim();
      }
    }
  }

  const pickRank = (rankKey: string, flatValue?: string, fallbackVal?: string | null): string | null => {
    const val = rankMap[rankKey] || flatValue?.trim() || fallbackVal || null;
    return val ? val : null;
  };

  const matchType = data.diagnostics?.matchType || data.matchType || null;
  const usageKey = data.usage?.key ?? data.usageKey ?? (fallback?.gbifId ? Number(fallback.gbifId) || null : null);
  const verifiedByGbif = Boolean(usageKey && matchType !== 'NONE');

  const synonyms: string[] = [];
  if (data.synonym && data.usage?.name && data.acceptedUsage?.name) {
    synonyms.push(data.usage.name);
  }

  return {
    kingdom: pickRank('KINGDOM', data.kingdom),
    phylum: pickRank('PHYLUM', data.phylum),
    class: pickRank('CLASS', data.class),
    order: pickRank('ORDER', data.order),
    family: pickRank('FAMILY', data.family, fallback?.family),
    genus: pickRank('GENUS', data.genus, fallback?.genus),
    species: pickRank('SPECIES', data.species, data.acceptedUsage?.canonicalName || data.usage?.canonicalName || fallback?.species),
    gbifUsageKey: usageKey,
    canonicalName: data.acceptedUsage?.canonicalName || data.usage?.canonicalName || data.canonicalName || fallback?.species || null,
    scientificName: data.acceptedUsage?.name || data.usage?.name || data.scientificName || fallback?.species || null,
    taxonomicStatus: data.usage?.status || data.status || null,
    matchType,
    synonyms,
    verifiedByGbif,
  };
}

export async function fetchGbifTaxonomy(
  scientificName: string,
  config: ServerConfig,
  fallback?: { family?: string | null; genus?: string | null; gbifId?: string | null },
  fetchImpl: FetchLike = fetch
): Promise<TaxonomyHierarchy> {
  const cleanedName = scientificName.trim();
  if (!cleanedName) {
    return parseGbifTaxonomyResponse(null, {
      family: fallback?.family,
      genus: fallback?.genus,
      species: null,
      gbifId: fallback?.gbifId,
    });
  }

  const query = new URLSearchParams({
    scientificName: cleanedName,
    name: cleanedName,
    kingdom: 'Plantae',
  });
  const url = `${config.gbifApiBaseUrl}/v2/species/match?${query.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(config.requestTimeoutMs, 10000));

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      return parseGbifTaxonomyResponse(null, {
        family: fallback?.family,
        genus: fallback?.genus,
        species: cleanedName,
        gbifId: fallback?.gbifId,
      });
    }

    const json = (await response.json()) as GbifMatchApiResponse;
    const parsed = parseGbifTaxonomyResponse(json, {
      family: fallback?.family,
      genus: fallback?.genus,
      species: cleanedName,
      gbifId: fallback?.gbifId,
    });

    // Fetch public synonyms when a valid GBIF usage key is returned (never fails the scan)
    if (parsed.gbifUsageKey && parsed.verifiedByGbif) {
      try {
        const synController = new AbortController();
        const synTimeout = setTimeout(() => synController.abort(), 5000);
        try {
          const synUrl = `${config.gbifApiBaseUrl}/v1/species/${parsed.gbifUsageKey}/synonyms?limit=8`;
          const synRes = await fetchImpl(synUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: synController.signal,
          });
          if (synRes.ok) {
            const synJson = (await synRes.json()) as {
              results?: Array<{ scientificName?: string; canonicalName?: string }>;
            };
            const synNames = Array.isArray(synJson.results)
              ? synJson.results
                  .map((s) => (s.scientificName || s.canonicalName || '').trim())
                  .filter(Boolean)
              : [];
            parsed.synonyms = Array.from(new Set([...parsed.synonyms, ...synNames])).slice(0, 8);
          }
        } finally {
          clearTimeout(synTimeout);
        }
      } catch {
        // Optional synonym enrichment failure should never fail taxonomy resolution
      }
    }

    return parsed;
  } catch {
    return parseGbifTaxonomyResponse(null, {
      family: fallback?.family,
      genus: fallback?.genus,
      species: cleanedName,
      gbifId: fallback?.gbifId,
    });
  } finally {
    clearTimeout(timeout);
  }
}
