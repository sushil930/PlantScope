from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import JSONResponse

from app.core.config import Settings, get_settings
from app.schemas.disease import ScanResult
from app.schemas.plant import ApiLimits, HealthResponse, LanguagesResponse, QuotaInfo
from app.services.plantnet_service import ServiceError, fetch_supported_languages
from app.services.quota_service import fetch_daily_quota
from app.services.result_service import process_plant_scan

router = APIRouter(prefix="/api", tags=["plantscope"])


def _error_response(err: ServiceError) -> JSONResponse:
    body = {
        "error": {
            "code": err.code,
            "message": err.message,
            "status": err.status,
            "resetAt": err.reset_at,
        }
    }
    return JSONResponse(status_code=err.status, content=body)


@router.get("/health", response_model=HealthResponse)
async def health_check(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(
        plantnetConfigured=settings.is_plantnet_configured,
        plantnetBaseUrl=settings.plantnet_api_base_url,
        gbifBaseUrl=settings.gbif_api_base_url,
        limits=ApiLimits(
            maxImages=settings.max_images_per_scan,
            maxImageSizeMb=settings.max_image_size_bytes // (1024 * 1024),
            maxTotalSizeMb=settings.max_total_upload_bytes // (1024 * 1024),
        ),
    )


@router.get("/quota", response_model=QuotaInfo)
async def get_quota(settings: Settings = Depends(get_settings)) -> QuotaInfo:
    return await fetch_daily_quota(settings)


@router.get("/languages", response_model=LanguagesResponse)
async def get_languages(settings: Settings = Depends(get_settings)):
    try:
        return await fetch_supported_languages(settings)
    except ServiceError as err:
        return _error_response(err)


@router.post("/scan", response_model=ScanResult)
async def scan_plant(
    images: list[UploadFile] = File(default_factory=list),
    organs: Optional[list[str]] = Form(default=None),
    lang: str = Form(default="en"),
    include_disease: bool = Form(default=False),
    settings: Settings = Depends(get_settings),
):
    try:
        raw_files: list[tuple[str, str, bytes]] = []
        for upload in images:
            data = await upload.read()
            raw_files.append(
                (upload.filename or "specimen.jpg", upload.content_type or "", data)
            )
        result = await process_plant_scan(
            raw_files=raw_files,
            raw_organs=organs or [],
            language=lang,
            include_disease=include_disease,
            settings=settings,
        )
        return result.model_dump(by_alias=True)
    except ServiceError as err:
        return _error_response(err)
