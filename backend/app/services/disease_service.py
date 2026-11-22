from __future__ import annotations

import re
from typing import Any, Optional
from urllib.parse import urlparse
import httpx

from app.core.config import Settings, redact_api_key
from app.schemas.disease import (
    DiseaseAnalysisResult,
    DiseaseCandidate,
    DiseaseImageAttribution,
)
from app.services.plantnet_service import map_upstream_error

EPPO_RE = re.compile(r"^[A-Z0-9]{4,8}$")
INCONCLUSIVE_THRESHOLD = 0.20


def _is_safe_https_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme == "https" and bool(parsed.netloc)


def parse_disease_response(payload: dict[str, Any]) -> DiseaseAnalysisResult:
    raw_results = payload.get("results") if isinstance(payload.get("results"), list) else []
    remaining = payload.get("remainingIdentificationRequests")
    remaining_int = int(remaining) if isinstance(remaining, (int, float)) else None
    version = str(payload.get("version")) if payload.get("version") else None

    candidates: list[DiseaseCandidate] = []
    for item in raw_results:
        if not isinstance(item, dict) or not isinstance(item.get("score"), (int, float)):
            continue

        raw_name = str(item.get("name") or "").strip()
        raw_label = str(item.get("label") or "").strip()
        raw_desc = str(item.get("description") or "").strip()
        explicit_code = str(item.get("eppoCode") or item.get("code") or "").strip()

        eppo_code = explicit_code or (raw_name if EPPO_RE.match(raw_name) else None)
        display_label = (
            raw_label
            or (raw_desc if eppo_code and raw_desc else raw_name)
            or eppo_code
            or "Unnamed pathology prediction"
        )
        description = raw_desc if raw_desc and raw_desc != display_label else None

        images: list[DiseaseImageAttribution] = []
        raw_images = item.get("images") if isinstance(item.get("images"), list) else []
        for img in raw_images[:4]:
            if not isinstance(img, dict):
                continue
            url_obj = img.get("url")
            url = (
                url_obj
                if isinstance(url_obj, str)
                else (
                    url_obj.get("m") or url_obj.get("s") or url_obj.get("o")
                    if isinstance(url_obj, dict)
                    else None
                )
            )
            if not _is_safe_https_url(url):
                continue
            images.append(
                DiseaseImageAttribution(
                    url=url,
                    organ=str(img.get("organ")) if img.get("organ") else None,
                    author=str(img.get("author")) if img.get("author") else None,
                    license=str(img.get("license")) if img.get("license") else None,
                    citation=str(img.get("citation")) if img.get("citation") else None,
                )
            )

        categories = [
            str(c).strip()
            for c in (item.get("categories") or [])
            if str(c).strip()
        ]

        candidates.append(
            DiseaseCandidate(
                name=raw_name or display_label,
                label=display_label,
                eppoCode=eppo_code,
                score=max(0.0, min(1.0, float(item["score"]))),
                description=description,
                categories=categories,
                images=images,
            )
        )

    if not candidates:
        return DiseaseAnalysisResult(
            enabled=True,
            status="no_supported_match",
            candidates=[],
            remainingRequests=remaining_int,
            version=version,
        )

    if candidates[0].score < INCONCLUSIVE_THRESHOLD:
        return DiseaseAnalysisResult(
            enabled=True,
            status="inconclusive",
            candidates=candidates,
            remainingRequests=remaining_int,
            version=version,
        )

    return DiseaseAnalysisResult(
        enabled=True,
        status="possible_disease_detected",
        candidates=candidates,
        remainingRequests=remaining_int,
        version=version,
    )


async def identify_plant_diseases(
    images: list[tuple[str, bytes, str]],
    organs: list[str],
    lang: str,
    settings: Settings,
    client: Optional[httpx.AsyncClient] = None,
) -> DiseaseAnalysisResult:
    if not settings.is_plantnet_configured:
        return DiseaseAnalysisResult(
            enabled=True,
            status="unavailable",
            errorCode="API_KEY_NOT_CONFIGURED",
            errorMessage="PLANTNET_API_KEY is not configured in backend/.env.",
        )

    url = f"{settings.plantnet_api_base_url}/v2/diseases/identify"
    params = {
        "api-key": settings.plantnet_api_key,
        "lang": lang,
        "nb-results": "5",
        "include-related-images": "true",
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
        if res.status_code == 404:
            return DiseaseAnalysisResult(enabled=True, status="no_supported_match")
        if res.status_code >= 400:
            err = map_upstream_error(
                res.status_code, "disease", reset_at=res.headers.get("retry-after")
            )
            return DiseaseAnalysisResult(
                enabled=True,
                status="unavailable",
                errorCode=err.code,
                errorMessage=err.message,
            )
        return parse_disease_response(res.json())
    except httpx.TimeoutException:
        return DiseaseAnalysisResult(
            enabled=True,
            status="unavailable",
            errorCode="NETWORK_TIMEOUT",
            errorMessage="Pl@ntNet disease identification timed out. Species results remain available.",
        )
    except httpx.HTTPError as exc:
        return DiseaseAnalysisResult(
            enabled=True,
            status="unavailable",
            errorCode="UPSTREAM_ERROR",
            errorMessage=f"Disease identification unavailable: {redact_api_key(str(exc))}",
        )
    finally:
        if own_client:
            await active_client.aclose()
