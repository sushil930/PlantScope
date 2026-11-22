from __future__ import annotations

from typing import Any, Optional
import httpx

from app.core.config import Settings
from app.schemas.plant import TaxonomyHierarchy


def parse_gbif_taxonomy(
    payload: Optional[dict[str, Any]],
    fallback_family: Optional[str] = None,
    fallback_genus: Optional[str] = None,
    fallback_species: Optional[str] = None,
    fallback_gbif_id: Optional[str] = None,
) -> TaxonomyHierarchy:
    fallback_key = int(fallback_gbif_id) if fallback_gbif_id and fallback_gbif_id.isdigit() else None

    if not payload:
        return TaxonomyHierarchy(
            family=fallback_family,
            genus=fallback_genus,
            species=fallback_species,
            gbifUsageKey=fallback_key,
            canonicalName=fallback_species,
            scientificName=fallback_species,
            matchType="NONE",
            verifiedByGbif=False,
        )

    ranks: dict[str, str] = {}
    classification = payload.get("classification")
    if isinstance(classification, list):
        for node in classification:
            if isinstance(node, dict) and node.get("rank") and node.get("name"):
                ranks[str(node["rank"]).upper()] = str(node["name"]).strip()

    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    accepted = (
        payload.get("acceptedUsage") if isinstance(payload.get("acceptedUsage"), dict) else {}
    )
    diagnostics = (
        payload.get("diagnostics") if isinstance(payload.get("diagnostics"), dict) else {}
    )

    def pick(rank_key: str, flat_key: str, fb: Optional[str] = None) -> Optional[str]:
        val = ranks.get(rank_key) or (str(payload.get(flat_key) or "").strip() or None) or fb
        return val if val else None

    match_type = diagnostics.get("matchType") or payload.get("matchType")
    usage_key = usage.get("key") or payload.get("usageKey") or fallback_key
    usage_key_int = int(usage_key) if isinstance(usage_key, (int, float)) else None
    verified = bool(usage_key_int and match_type != "NONE")

    synonyms: list[str] = []
    if payload.get("synonym") and usage.get("name") and accepted.get("name"):
        synonyms.append(str(usage["name"]))

    return TaxonomyHierarchy(
        kingdom=pick("KINGDOM", "kingdom"),
        phylum=pick("PHYLUM", "phylum"),
        **{"class": pick("CLASS", "class")},
        order=pick("ORDER", "order"),
        family=pick("FAMILY", "family", fallback_family),
        genus=pick("GENUS", "genus", fallback_genus),
        species=pick(
            "SPECIES",
            "species",
            accepted.get("canonicalName") or usage.get("canonicalName") or fallback_species,
        ),
        gbifUsageKey=usage_key_int,
        canonicalName=accepted.get("canonicalName")
        or usage.get("canonicalName")
        or payload.get("canonicalName")
        or fallback_species,
        scientificName=accepted.get("name")
        or usage.get("name")
        or payload.get("scientificName")
        or fallback_species,
        taxonomicStatus=usage.get("status") or payload.get("status"),
        matchType=match_type,
        synonyms=synonyms,
        verifiedByGbif=verified,
    )


async def fetch_gbif_taxonomy(
    scientific_name: str,
    settings: Settings,
    fallback_family: Optional[str] = None,
    fallback_genus: Optional[str] = None,
    fallback_gbif_id: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> TaxonomyHierarchy:
    cleaned = scientific_name.strip()
    if not cleaned:
        return parse_gbif_taxonomy(None, fallback_family, fallback_genus, None, fallback_gbif_id)

    url = f"{settings.gbif_api_base_url}/v2/species/match"
    own_client = client is None
    active_client = client or httpx.AsyncClient(timeout=min(settings.api_timeout_seconds, 10.0))

    try:
        res = await active_client.get(
            url,
            params={"scientificName": cleaned, "name": cleaned, "kingdom": "Plantae"},
            headers={"Accept": "application/json"},
        )
        if res.status_code >= 400:
            return parse_gbif_taxonomy(
                None, fallback_family, fallback_genus, cleaned, fallback_gbif_id
            )

        parsed = parse_gbif_taxonomy(
            res.json(), fallback_family, fallback_genus, cleaned, fallback_gbif_id
        )

        if parsed.gbifUsageKey and parsed.verifiedByGbif:
            try:
                syn_res = await active_client.get(
                    f"{settings.gbif_api_base_url}/v1/species/{parsed.gbifUsageKey}/synonyms",
                    params={"limit": "8"},
                    headers={"Accept": "application/json"},
                )
                if syn_res.status_code == 200:
                    syn_data = syn_res.json().get("results", [])
                    syn_names = [
                        str(s.get("scientificName") or s.get("canonicalName") or "").strip()
                        for s in syn_data
                        if isinstance(s, dict)
                    ]
                    merged = list(dict.fromkeys([*parsed.synonyms, *[n for n in syn_names if n]]))
                    parsed.synonyms = merged[:8]
            except httpx.HTTPError:
                pass

        return parsed
    except httpx.HTTPError:
        return parse_gbif_taxonomy(
            None, fallback_family, fallback_genus, cleaned, fallback_gbif_id
        )
    finally:
        if own_client:
            await active_client.aclose()
