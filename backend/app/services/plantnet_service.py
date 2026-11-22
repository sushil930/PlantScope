from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
import httpx

from app.core.config import Settings, redact_api_key
from app.schemas.plant import LanguagesResponse, PlantCandidate


class ServiceError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        reset_at: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.reset_at = reset_at


_language_cache: Optional[tuple[list[str], str, float]] = None
LANGUAGE_CACHE_TTL_SECONDS = 6 * 60 * 60


def clear_language_cache() -> None:
    global _language_cache
    _language_cache = None


def classify_confidence(score: float) -> str:
    if score >= 0.7:
        return "high"
    if score >= 0.35:
        return "moderate"
    return "low"


def map_upstream_error(status: int, context: str, reset_at: Optional[str] = None) -> ServiceError:
    if status == 400:
        return ServiceError(
            400,
            "INVALID_REQUEST",
            "The uploaded plant image or request parameters could not be processed by Pl@ntNet.",
        )
    if status == 401:
        return ServiceError(
            401,
            "UNAUTHORIZED",
            "Pl@ntNet rejected the configured API key. Verify PLANTNET_API_KEY in backend/.env.",
        )
    if status == 403:
        return ServiceError(
            403,
            "FORBIDDEN",
            "Access to this Pl@ntNet endpoint is denied for the configured API key.",
        )
    if status == 404:
        msg = (
            "No supported plant disease match was returned for the submitted specimen."
            if context == "disease"
            else "No matching plant species could be identified from the submitted photograph(s)."
        )
        return ServiceError(404, "NOT_FOUND", msg)
    if status == 429:
        return ServiceError(
            429,
            "QUOTA_EXHAUSTED",
            "The free Pl@ntNet daily API quota has been exhausted. No automatic retries will be attempted.",
            reset_at=reset_at,
        )
    return ServiceError(
        502,
        "UPSTREAM_ERROR",
        f"Pl@ntNet returned an upstream error (HTTP {status}). Please try again later.",
    )


def parse_identify_response(payload: dict[str, Any], language_used: str) -> dict[str, Any]:
    raw_results = payload.get("results") if isinstance(payload.get("results"), list) else []
    candidates: list[PlantCandidate] = []

    for item in raw_results:
        if not isinstance(item, dict):
            continue
        species = item.get("species")
        score = item.get("score")
        if not isinstance(species, dict) or not isinstance(score, (int, float)):
            continue

        sci_no_author = str(
            species.get("scientificNameWithoutAuthor") or species.get("scientificName") or ""
        ).strip()
        if not sci_no_author:
            continue

        author = str(species.get("scientificNameAuthorship") or "").strip() or None
        sci_name = str(species.get("scientificName") or "").strip() or (
            f"{sci_no_author} {author}".strip() if author else sci_no_author
        )

        family_obj = species.get("family") if isinstance(species.get("family"), dict) else {}
        genus_obj = species.get("genus") if isinstance(species.get("genus"), dict) else {}
        gbif_obj = item.get("gbif") if isinstance(item.get("gbif"), dict) else {}
        powo_obj = item.get("powo") if isinstance(item.get("powo"), dict) else {}
        iucn_obj = item.get("iucn") if isinstance(item.get("iucn"), dict) else {}

        clamped_score = max(0.0, min(1.0, float(score)))
        common_names = [
            str(n).strip()
            for n in (species.get("commonNames") or [])
            if str(n).strip()
        ]

        candidates.append(
            PlantCandidate(
                scientificName=sci_name,
                scientificNameWithoutAuthor=sci_no_author,
                author=author,
                commonNames=common_names,
                family=str(family_obj.get("scientificNameWithoutAuthor") or "").strip() or None,
                genus=str(genus_obj.get("scientificNameWithoutAuthor") or "").strip() or None,
                score=clamped_score,
                gbifId=str(gbif_obj["id"]) if gbif_obj.get("id") is not None else None,
                powoId=str(powo_obj["id"]) if powo_obj.get("id") else None,
                iucnCategory=str(iucn_obj["category"]) if iucn_obj.get("category") else None,
                confidenceLevel=classify_confidence(clamped_score),
            )
        )

    top_score = candidates[0].score if candidates else 0.0
    remaining = payload.get("remainingIdentificationRequests")

    return {
        "bestMatch": str(payload.get("bestMatch") or "").strip()
        or (candidates[0].scientificName if candidates else None),
        "candidates": candidates,
        "lowConfidenceWarning": bool(candidates) and top_score < 0.35,
        "remainingRequests": int(remaining) if isinstance(remaining, (int, float)) else None,
        "version": str(payload.get("version")) if payload.get("version") else None,
        "languageUsed": str(payload.get("language") or language_used),
    }


def resolve_api_language(requested_lang: str, supported: list[str]) -> str:
    cleaned = (requested_lang or "en").strip().lower()[:5]
    if cleaned in supported:
        return cleaned
    base = cleaned.split("-")[0]
    if base in supported:
        return base
    return "en" if "en" in supported else (supported[0] if supported else "en")


async def fetch_supported_languages(
    settings: Settings,
    client: Optional[httpx.AsyncClient] = None,
) -> LanguagesResponse:
    global _language_cache

    if not settings.is_plantnet_configured:
        return LanguagesResponse(
            languages=["en"],
            supportsHindi=False,
            source="fallback_unconfigured",
            cachedAt=None,
        )

    now_ts = datetime.now(timezone.utc).timestamp()
    if _language_cache and now_ts < _language_cache[2]:
        langs, cached_at, _ = _language_cache
        return LanguagesResponse(
            languages=langs,
            supportsHindi="hi" in langs,
            source="plantnet_api",
            cachedAt=cached_at,
        )

    url = f"{settings.plantnet_api_base_url}/v2/languages"
    own_client = client is None
    active_client = client or httpx.AsyncClient(timeout=settings.api_timeout_seconds)

    try:
        res = await active_client.get(
            url,
            params={"api-key": settings.plantnet_api_key},
            headers={"Accept": "application/json"},
        )
        if res.status_code >= 400:
            raise map_upstream_error(res.status_code, "languages")

        raw = res.json()
        raw_list = raw if isinstance(raw, list) else raw.get("languages", [])
        langs = sorted({str(c).strip().lower() for c in raw_list if str(c).strip()}) or ["en"]
        cached_at = datetime.now(timezone.utc).isoformat()
        _language_cache = (langs, cached_at, now_ts + LANGUAGE_CACHE_TTL_SECONDS)

        return LanguagesResponse(
            languages=langs,
            supportsHindi="hi" in langs,
            source="plantnet_api",
            cachedAt=cached_at,
        )
    except httpx.TimeoutException as exc:
        raise ServiceError(
            504,
            "NETWORK_TIMEOUT",
            "Timed out while retrieving supported languages from Pl@ntNet.",
        ) from exc
    except httpx.HTTPError as exc:
        raise ServiceError(
            502,
            "UPSTREAM_ERROR",
            f"Unable to reach Pl@ntNet languages endpoint: {redact_api_key(str(exc))}",
        ) from exc
    finally:
        if own_client:
            await active_client.aclose()


async def identify_plant_species(
    images: list[tuple[str, bytes, str]],
    organs: list[str],
    lang: str,
    settings: Settings,
    client: Optional[httpx.AsyncClient] = None,
) -> dict[str, Any]:
    if not settings.is_plantnet_configured:
        raise ServiceError(
            401,
            "API_KEY_NOT_CONFIGURED",
            "PLANTNET_API_KEY is not configured in backend/.env.",
        )

    url = f"{settings.plantnet_api_base_url}/v2/identify/all"
    params = {
        "api-key": settings.plantnet_api_key,
        "lang": lang,
        "nb-results": "6",
        "detailed": "true",
    }
    files = [("images", (name, data, mime)) for (name, data, mime) in images]
    data = [("organs", organ) for organ in organs]

    own_client = client is None
    active_client = client or httpx.AsyncClient(timeout=settings.api_timeout_seconds)

    try:
        res = await active_client.post(
            url,
            params=params,
            files=files,
            data=data,
            headers={"Accept": "application/json"},
        )
        if res.status_code >= 400:
            raise map_upstream_error(
                res.status_code, "identify", reset_at=res.headers.get("retry-after")
            )
        return parse_identify_response(res.json(), lang)
    except httpx.TimeoutException as exc:
        raise ServiceError(
            504,
            "NETWORK_TIMEOUT",
            "Pl@ntNet identification timed out. Please try again later.",
        ) from exc
    except httpx.HTTPError as exc:
        raise ServiceError(
            502,
            "UPSTREAM_ERROR",
            f"Failed to contact Pl@ntNet identification service: {redact_api_key(str(exc))}",
        ) from exc
    finally:
        if own_client:
            await active_client.aclose()
