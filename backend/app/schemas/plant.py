from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


OrganType = Literal["auto", "leaf", "flower", "fruit", "bark"]
ConfidenceLevel = Literal["high", "moderate", "low"]


class ApiLimits(BaseModel):
    maxImages: int
    maxImageSizeMb: int
    maxTotalSizeMb: int


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str = "plantscope-ai"
    plantnetConfigured: bool
    plantnetBaseUrl: str
    gbifBaseUrl: str
    limits: ApiLimits


class QuotaInfo(BaseModel):
    available: bool
    configured: bool
    dailyLimit: Optional[int] = None
    remaining: Optional[int] = None
    used: Optional[int] = None
    resetAt: Optional[str] = None
    exhausted: bool = False
    message: Optional[str] = None
    errorCode: Optional[str] = None


class LanguagesResponse(BaseModel):
    languages: list[str]
    supportsHindi: bool
    source: Literal["plantnet_api", "fallback_unconfigured"]
    cachedAt: Optional[str] = None


class PlantCandidate(BaseModel):
    scientificName: str
    scientificNameWithoutAuthor: str
    author: Optional[str] = None
    commonNames: list[str] = Field(default_factory=list)
    family: Optional[str] = None
    genus: Optional[str] = None
    score: float
    gbifId: Optional[str] = None
    powoId: Optional[str] = None
    iucnCategory: Optional[str] = None
    confidenceLevel: ConfidenceLevel


class TaxonomyHierarchy(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    kingdom: Optional[str] = None
    phylum: Optional[str] = None
    taxon_class: Optional[str] = Field(default=None, alias="class")
    order: Optional[str] = None
    family: Optional[str] = None
    genus: Optional[str] = None
    species: Optional[str] = None
    gbifUsageKey: Optional[int] = None
    canonicalName: Optional[str] = None
    scientificName: Optional[str] = None
    taxonomicStatus: Optional[str] = None
    matchType: Optional[str] = None
    synonyms: list[str] = Field(default_factory=list)
    verifiedByGbif: bool = False
