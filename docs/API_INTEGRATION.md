# PlantScope AI — API Integration Documentation

PlantScope AI relies exclusively on free, open-access scientific APIs: **Pl@ntNet API v2** and the **GBIF Taxon API**.

## 1. Pl@ntNet API (`https://my-api.plantnet.org`)

Authentication:
- Pass `api-key={PLANTNET_API_KEY}` as a query parameter from the backend server only.
- Never expose `PLANTNET_API_KEY` to client JavaScript, responses, or server logs.

Endpoints used:
1. `POST /v2/identify/all`
   - Query params: `api-key`, `lang`, `nb-results=6`, `detailed=true`
   - Multipart body: 1–5 `images` of the same individual plant + matching `organs` (`auto`, `leaf`, `flower`, `fruit`, `bark`).
2. `POST /v2/diseases/identify` (Beta)
   - Query params: `api-key`, `lang`, `nb-results=5`, `include-related-images=true`
   - Multipart body: same validated `images` and `organs`.
   - Consumes **1 additional daily request** from the same free daily Pl@ntNet quota.
   - Executed in an isolated error boundary: if disease identification fails or returns 404, species identification and GBIF taxonomy are still returned.
3. `GET /v2/quota/daily`
   - Used by `GET /api/quota` to display daily allowance, remaining requests, and UTC reset timing.
   - When HTTP 429 is received, the server marks the quota exhausted for the current UTC day and stops calling Pl@ntNet automatically.
4. `GET /v2/languages`
   - Cached in memory for 6 hours. Before forwarding `lang=hi`, the server verifies whether Pl@ntNet supports `hi`; otherwise it sends `en` while preserving verified Hindi UI labels and canonical Latin scientific names.

## 2. GBIF Taxon API (`https://api.gbif.org`)

Authentication:
- None required for public taxonomy lookups.

Endpoints used:
1. `GET /v2/species/match?scientificName={name}&name={name}&kingdom=Plantae`
   - Verifies the leading scientific name returned by Pl@ntNet and extracts the seven taxonomic ranks: Kingdom, Phylum, Class, Order, Family, Genus, and Species.
   - Missing or unverified ranks are returned as `null` and rendered as `"Information unavailable"` — ranks are never invented.
2. `GET /v1/species/{usageKey}/synonyms?limit=8`
   - Optional enrichment for known taxonomic synonyms.

## 3. Application Backend Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Returns service status, upload limits, and whether `PLANTNET_API_KEY` is configured (never the key itself). |
| `GET` | `/api/quota` | Returns Pl@ntNet daily quota allowance, remaining count, and exhaustion state. |
| `GET` | `/api/languages` | Returns cached Pl@ntNet supported languages and whether Hindi is supported upstream. |
| `POST` | `/api/scan` | Accepts multipart `images` (1–5 JPG/PNG), `organs`, `lang`, and `include_disease`. Validates magic bytes in memory, calls Pl@ntNet + GBIF, and returns normalized JSON. |

## 4. Error Code Contract

All backend errors return:

```json
{
  "error": {
    "code": "QUOTA_EXHAUSTED",
    "message": "Human-readable explanation",
    "status": 429,
    "resetAt": "2026-11-23T00:00:00.000Z"
  }
}
```

Handled HTTP statuses: `400`, `401`, `403`, `404`, `429`, `500/502`, and `504` (timeout).
