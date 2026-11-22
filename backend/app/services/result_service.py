from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from typing import Optional
import uuid
import httpx
from PIL import Image, UnidentifiedImageError

from app.core.config import Settings
from app.schemas.disease import DiseaseAnalysisResult, ScanResult
from app.schemas.plant import OrganType
from app.services.disease_service import identify_plant_diseases
from app.services.gbif_service import fetch_gbif_taxonomy
from app.services.plantnet_service import (
    ServiceError,
    fetch_supported_languages,
    identify_plant_species,
    resolve_api_language,
)
from app.services.quota_service import (
    is_locally_exhausted,
    mark_quota_exhausted,
    record_remaining_quota,
)

ALLOWED_MIMES = {"image/jpeg", "image/jpg", "image/png"}
ALLOWED_FORMATS = {"JPEG", "PNG"}
ALLOWED_ORGANS = {"auto", "leaf", "flower", "fruit", "bark"}


def validate_images_in_memory(
    raw_files: list[tuple[str, str, bytes]],
    settings: Settings,
) -> list[tuple[str, bytes, str]]:
    if not raw_files:
        raise ServiceError(400, "NO_IMAGES", "Please upload between 1 and 5 plant photographs.")
    if len(raw_files) > settings.max_images_per_scan:
        raise ServiceError(
            400,
            "TOO_MANY_IMAGES",
            f"Maximum {settings.max_images_per_scan} photographs are allowed per scan.",
        )

    total_bytes = 0
    validated: list[tuple[str, bytes, str]] = []

    for idx, (filename, content_type, data) in enumerate(raw_files):
        mime = (content_type or "").lower()
        if mime not in ALLOWED_MIMES:
            raise ServiceError(
                400,
                "INVALID_IMAGE_FORMAT",
                f'File "{filename}" has an unsupported format. Only JPG, JPEG, and PNG are accepted.',
            )
        if not data:
            raise ServiceError(400, "INVALID_IMAGE_FORMAT", f'File "{filename}" is empty.')
        if len(data) > settings.max_image_size_bytes:
            raise ServiceError(
                400,
                "IMAGE_TOO_LARGE",
                f'File "{filename}" exceeds the per-image size limit.',
            )

        total_bytes += len(data)
        if total_bytes > settings.max_total_upload_bytes:
            raise ServiceError(
                400,
                "REQUEST_TOO_LARGE",
                "Total upload size exceeds the maximum allowed request size.",
            )

        try:
            with Image.open(BytesIO(data)) as img:
                img.verify()
            with Image.open(BytesIO(data)) as img:
                fmt = (img.format or "").upper()
                if fmt not in ALLOWED_FORMATS or img.width <= 0 or img.height <= 0:
                    raise ServiceError(
                        400,
                        "INVALID_IMAGE_FORMAT",
                        f'File "{filename}" is not a valid JPEG or PNG photograph.',
                    )
        except ServiceError:
            raise
        except (UnidentifiedImageError, OSError) as exc:
            raise ServiceError(
                400,
                "INVALID_IMAGE_FORMAT",
                f'File "{filename}" could not be decoded as a valid image.',
            ) from exc

        safe_mime = "image/png" if fmt == "PNG" else "image/jpeg"
        safe_ext = "png" if fmt == "PNG" else "jpg"
        validated.append((f"specimen-{idx + 1}.{safe_ext}", data, safe_mime))

    return validated


def normalize_organs(raw_organs: list[str], count: int) -> list[OrganType]:
    cleaned = [o.strip().lower() for o in raw_organs if o and o.strip()]
    resolved: list[OrganType] = []
    for i in range(count):
        candidate = cleaned[i] if i < len(cleaned) else (cleaned[0] if cleaned else "auto")
        if candidate not in ALLOWED_ORGANS:
            raise ServiceError(
                400,
                "INVALID_REQUEST",
                f'Unsupported plant organ "{candidate}". Allowed: auto, leaf, flower, fruit, bark.',
            )
        resolved.append(candidate)  # type: ignore[arg-type]
    return resolved


async def process_plant_scan(
    raw_files: list[tuple[str, str, bytes]],
    raw_organs: list[str],
    language: str,
    include_disease: bool,
    settings: Settings,
    client: Optional[httpx.AsyncClient] = None,
) -> ScanResult:
    validated_images = validate_images_in_memory(raw_files, settings)
    organs = normalize_organs(raw_organs, len(validated_images))
    requested_lang = (language or "en").strip().lower()[:5] or "en"

    if not settings.is_plantnet_configured:
        raise ServiceError(
            401,
            "API_KEY_NOT_CONFIGURED",
            "PLANTNET_API_KEY is not configured in backend/.env.",
        )

    if is_locally_exhausted():
        raise ServiceError(
            429,
            "QUOTA_EXHAUSTED",
            "Daily free Pl@ntNet API quota has been exhausted. Scanning is disabled until reset.",
        )

    try:
        lang_info = await fetch_supported_languages(settings, client)
        api_lang = resolve_api_language(requested_lang, lang_info.languages)
    except ServiceError:
        api_lang = "en"

    try:
        identified = await identify_plant_species(
            validated_images, organs, api_lang, settings, client
        )
    except ServiceError as err:
        if err.code == "QUOTA_EXHAUSTED":
            mark_quota_exhausted()
        raise

    record_remaining_quota(identified["remainingRequests"])

    warnings: list[str] = []
    candidates = identified["candidates"]
    if not candidates:
        warnings.append("no_species_candidates")
    elif identified["lowConfidenceWarning"]:
        warnings.append("low_confidence_species")

    if requested_lang == "hi" and api_lang != "hi":
        warnings.append("hindi_api_fallback")

    top = candidates[0] if candidates else None
    taxonomy = (
        await fetch_gbif_taxonomy(
            top.scientificNameWithoutAuthor,
            settings,
            fallback_family=top.family,
            fallback_genus=top.genus,
            fallback_gbif_id=top.gbifId,
            client=client,
        )
        if top
        else None
    )

    latest_remaining = identified["remainingRequests"]
    disease_result = DiseaseAnalysisResult(
        enabled=False,
        status="not_requested",
        remainingRequests=latest_remaining,
    )

    if include_disease:
        if latest_remaining is not None and latest_remaining <= 0:
            mark_quota_exhausted()
            disease_result = DiseaseAnalysisResult(
                enabled=True,
                status="unavailable",
                remainingRequests=0,
                errorCode="QUOTA_EXHAUSTED",
                errorMessage="Daily quota was exhausted after species identification.",
            )
            warnings.append("disease_skipped_quota")
        else:
            disease_result = await identify_plant_diseases(
                validated_images, organs, api_lang, settings, client
            )
            if disease_result.errorCode == "QUOTA_EXHAUSTED":
                mark_quota_exhausted()
            if disease_result.remainingRequests is not None:
                latest_remaining = disease_result.remainingRequests
                record_remaining_quota(latest_remaining)
            if disease_result.status == "unavailable":
                warnings.append("disease_analysis_unavailable")

    return ScanResult(
        id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc).isoformat(),
        languageRequested=requested_lang,
        languageSentToApi=api_lang,
        imageCount=len(validated_images),
        organs=organs,
        bestMatch=identified["bestMatch"],
        lowConfidenceWarning=identified["lowConfidenceWarning"],
        candidates=candidates,
        taxonomy=taxonomy,
        disease=disease_result,
        quotaRemaining=latest_remaining,
        plantnetVersion=identified["version"],
        warnings=warnings,
    )
