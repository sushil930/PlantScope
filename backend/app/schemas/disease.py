from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field
from app.schemas.plant import OrganType, PlantCandidate, TaxonomyHierarchy


DiseaseStatus = Literal[
    "not_requested",
    "possible_disease_detected",
    "no_supported_match",
    "inconclusive",
    "unavailable",
]


class DiseaseImageAttribution(BaseModel):
    url: str
    organ: Optional[str] = None
    author: Optional[str] = None
    license: Optional[str] = None
    citation: Optional[str] = None


class DiseaseCandidate(BaseModel):
    name: str
    label: str
    eppoCode: Optional[str] = None
    score: float
    description: Optional[str] = None
    categories: list[str] = Field(default_factory=list)
    images: list[DiseaseImageAttribution] = Field(default_factory=list)


class DiseaseAnalysisResult(BaseModel):
    enabled: bool
    status: DiseaseStatus
    candidates: list[DiseaseCandidate] = Field(default_factory=list)
    remainingRequests: Optional[int] = None
    version: Optional[str] = None
    errorCode: Optional[str] = None
    errorMessage: Optional[str] = None


class AttributionInfo(BaseModel):
    plantnet: str = "Plant identification powered by Pl@ntNet."
    gbif: str = "Taxonomic backbone verification powered by GBIF."


class ScanResult(BaseModel):
    id: str
    timestamp: str
    languageRequested: str
    languageSentToApi: str
    imageCount: int
    organs: list[OrganType]
    bestMatch: Optional[str] = None
    lowConfidenceWarning: bool
    candidates: list[PlantCandidate]
    taxonomy: Optional[TaxonomyHierarchy] = None
    disease: DiseaseAnalysisResult
    quotaRemaining: Optional[int] = None
    plantnetVersion: Optional[str] = None
    attribution: AttributionInfo = Field(default_factory=AttributionInfo)
    warnings: list[str] = Field(default_factory=list)
