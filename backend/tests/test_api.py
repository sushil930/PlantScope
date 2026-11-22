from __future__ import annotations

from io import BytesIO
import httpx
import pytest
from PIL import Image

from app.core.config import Settings, redact_api_key
from app.services.disease_service import parse_disease_response
from app.services.gbif_service import parse_gbif_taxonomy
from app.services.plantnet_service import clear_language_cache, parse_identify_response
from app.services.quota_service import reset_quota_tracker
from app.services.result_service import process_plant_scan, validate_images_in_memory


def _make_png_bytes() -> bytes:
    buf = BytesIO()
    Image.new("RGB", (32, 32), color=(34, 139, 34)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(autouse=True)
def _reset_caches():
    clear_language_cache()
    reset_quota_tracker()


def test_api_key_redaction():
    url = "https://my-api.plantnet.org/v2/identify/all?api-key=secret_12345&lang=en"
    assert "secret_12345" not in redact_api_key(url)
    assert "api-key=[REDACTED]" in redact_api_key(url)


def test_image_validation_rejects_invalid_and_too_many():
    settings = Settings(plantnet_api_key="test-key")
    with pytest.raises(Exception) as exc:
        validate_images_in_memory([("bad.txt", "text/plain", b"hello")], settings)
    assert getattr(exc.value, "code", "") == "INVALID_IMAGE_FORMAT"

    png = _make_png_bytes()
    too_many = [(f"p{i}.png", "image/png", png) for i in range(6)]
    with pytest.raises(Exception) as exc2:
        validate_images_in_memory(too_many, settings)
    assert getattr(exc2.value, "code", "") == "TOO_MANY_IMAGES"


def test_gbif_taxonomy_parsing_preserves_missing_ranks():
    parsed = parse_gbif_taxonomy(
        {
            "usage": {"key": 2930137, "name": "Solanum lycopersicum L.", "canonicalName": "Solanum lycopersicum", "status": "ACCEPTED"},
            "classification": [
                {"rank": "KINGDOM", "name": "Plantae"},
                {"rank": "FAMILY", "name": "Solanaceae"},
                {"rank": "GENUS", "name": "Solanum"},
            ],
            "diagnostics": {"matchType": "EXACT"},
        }
    )
    assert parsed.kingdom == "Plantae"
    assert parsed.phylum is None
    assert parsed.family == "Solanaceae"
    assert parsed.verifiedByGbif is True


def test_disease_parsing_states():
    empty = parse_disease_response({"results": []})
    assert empty.status == "no_supported_match"

    low = parse_disease_response({"results": [{"name": "PHYPIN", "score": 0.08}]})
    assert low.status == "inconclusive"

    match = parse_disease_response(
        {"results": [{"name": "PHYPIN", "description": "Late blight", "score": 0.64}]}
    )
    assert match.status == "possible_disease_detected"
    assert match.candidates[0].eppoCode == "PHYPIN"


@pytest.mark.asyncio
async def test_partial_scan_failure_preserves_species_identification():
    png = _make_png_bytes()
    settings = Settings(plantnet_api_key="test-key")

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/v2/languages"):
            return httpx.Response(200, json=["en", "fr"])
        if path.endswith("/v2/identify/all"):
            return httpx.Response(
                200,
                json={
                    "bestMatch": "Ocimum tenuiflorum L.",
                    "remainingIdentificationRequests": 498,
                    "results": [
                        {
                            "score": 0.89,
                            "species": {
                                "scientificName": "Ocimum tenuiflorum L.",
                                "scientificNameWithoutAuthor": "Ocimum tenuiflorum",
                                "commonNames": ["Holy basil", "Tulsi"],
                                "family": {"scientificNameWithoutAuthor": "Lamiaceae"},
                                "genus": {"scientificNameWithoutAuthor": "Ocimum"},
                            },
                            "gbif": {"id": "2927082"},
                        }
                    ],
                },
            )
        if path.endswith("/v2/species/match"):
            return httpx.Response(
                200,
                json={
                    "usage": {"key": 2927082, "canonicalName": "Ocimum tenuiflorum", "status": "ACCEPTED"},
                    "classification": [
                        {"rank": "KINGDOM", "name": "Plantae"},
                        {"rank": "PHYLUM", "name": "Tracheophyta"},
                        {"rank": "CLASS", "name": "Magnoliopsida"},
                        {"rank": "ORDER", "name": "Lamiales"},
                        {"rank": "FAMILY", "name": "Lamiaceae"},
                        {"rank": "GENUS", "name": "Ocimum"},
                        {"rank": "SPECIES", "name": "Ocimum tenuiflorum"},
                    ],
                    "diagnostics": {"matchType": "EXACT"},
                },
            )
        if path.endswith("/synonyms"):
            return httpx.Response(200, json={"results": [{"scientificName": "Ocimum sanctum L."}]})
        if path.endswith("/v2/diseases/identify"):
            return httpx.Response(502, json={"message": "Upstream disease error"})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        result = await process_plant_scan(
            raw_files=[("leaf.png", "image/png", png)],
            raw_organs=["leaf"],
            language="hi",
            include_disease=True,
            settings=settings,
            client=client,
        )

    assert len(result.candidates) == 1
    assert result.candidates[0].scientificNameWithoutAuthor == "Ocimum tenuiflorum"
    assert result.taxonomy is not None and result.taxonomy.kingdom == "Plantae"
    assert result.disease.status == "unavailable"
    assert "disease_analysis_unavailable" in result.warnings
    assert "hindi_api_fallback" in result.warnings
