from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

PLACEHOLDER_KEYS = {
    "",
    "your_private_api_key",
    "your_private_plantnet_api_key",
    "MY_PLANTNET_API_KEY",
}


def redact_api_key(text: str) -> str:
    """Remove api-key query values from strings before logging or returning errors."""
    return re.sub(r"([?&]api-key=)[^&\s]+", r"\1[REDACTED]", text, flags=re.IGNORECASE)


@dataclass(frozen=True)
class Settings:
    plantnet_api_key: str = ""
    plantnet_api_base_url: str = "https://my-api.plantnet.org"
    gbif_api_base_url: str = "https://api.gbif.org"
    cors_origins: list[str] = field(
        default_factory=lambda: ["http://localhost:3000", "http://localhost:5173"]
    )
    max_images_per_scan: int = 5
    max_image_size_bytes: int = 10 * 1024 * 1024
    max_total_upload_bytes: int = 25 * 1024 * 1024
    api_timeout_seconds: float = 20.0

    @property
    def is_plantnet_configured(self) -> bool:
        return bool(self.plantnet_api_key)


def get_settings() -> Settings:
    raw_key = os.getenv("PLANTNET_API_KEY", "").strip()
    key = "" if raw_key in PLACEHOLDER_KEYS else raw_key

    raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173")
    origins = [item.strip() for item in raw_origins.split(",") if item.strip()]

    max_images = min(max(int(os.getenv("MAX_IMAGES_PER_SCAN", "5")), 1), 5)
    max_img_mb = min(max(int(os.getenv("MAX_IMAGE_SIZE_MB", "10")), 1), 20)
    max_total_mb = min(max(int(os.getenv("MAX_TOTAL_UPLOAD_MB", "25")), 5), 50)
    timeout = float(os.getenv("API_TIMEOUT_SECONDS", "20"))

    return Settings(
        plantnet_api_key=key,
        plantnet_api_base_url=os.getenv(
            "PLANTNET_API_BASE_URL", "https://my-api.plantnet.org"
        ).rstrip("/"),
        gbif_api_base_url=os.getenv(
            "GBIF_API_BASE_URL", "https://api.gbif.org"
        ).rstrip("/"),
        cors_origins=origins,
        max_images_per_scan=max_images,
        max_image_size_bytes=max_img_mb * 1024 * 1024,
        max_total_upload_bytes=max_total_mb * 1024 * 1024,
        api_timeout_seconds=timeout,
    )
