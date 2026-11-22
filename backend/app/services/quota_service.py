from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
import httpx

from app.core.config import Settings, redact_api_key
from app.schemas.plant import QuotaInfo
from app.services.plantnet_service import map_upstream_error

_exhausted_day: Optional[str] = None
_last_known_remaining: Optional[int] = None
_last_known_limit: Optional[int] = None


def _utc_day() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _next_utc_midnight() -> str:
    now = datetime.now(timezone.utc)
    nxt = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return nxt.isoformat()


def reset_quota_tracker() -> None:
    global _exhausted_day, _last_known_remaining, _last_known_limit
    _exhausted_day = None
    _last_known_remaining = None
    _last_known_limit = None


def mark_quota_exhausted() -> None:
    global _exhausted_day, _last_known_remaining
    _exhausted_day = _utc_day()
    _last_known_remaining = 0


def record_remaining_quota(remaining: Optional[int]) -> None:
    global _exhausted_day, _last_known_remaining
    if remaining is None:
        return
    _last_known_remaining = max(0, remaining)
    if remaining <= 0:
        _exhausted_day = _utc_day()
    elif _exhausted_day == _utc_day():
        _exhausted_day = None


def is_locally_exhausted() -> bool:
    return _exhausted_day == _utc_day()


def parse_quota_response(payload: dict[str, Any]) -> QuotaInfo:
    global _last_known_limit
    quota_obj = payload.get("quota") if isinstance(payload.get("quota"), dict) else {}
    identify_obj = quota_obj.get("identify") if isinstance(quota_obj.get("identify"), dict) else {}

    def pick_int(*vals: Any) -> Optional[int]:
        for v in vals:
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                return int(v)
        return None

    daily_limit = pick_int(
        identify_obj.get("total"),
        identify_obj.get("limit"),
        quota_obj.get("total"),
        payload.get("dailyQuota"),
        payload.get("total"),
        payload.get("limit"),
    )
    used = pick_int(
        identify_obj.get("count"),
        identify_obj.get("used"),
        quota_obj.get("count"),
        payload.get("count"),
        payload.get("used"),
    )
    remaining = pick_int(
        identify_obj.get("remaining"),
        quota_obj.get("remaining"),
        payload.get("remainingIdentificationRequests"),
        payload.get("remaining"),
    )

    if remaining is None and daily_limit is not None and used is not None:
        remaining = max(0, daily_limit - used)

    if daily_limit is not None:
        _last_known_limit = daily_limit
    if remaining is not None:
        record_remaining_quota(remaining)

    exhausted = remaining is not None and remaining <= 0
    return QuotaInfo(
        available=not exhausted,
        configured=True,
        dailyLimit=daily_limit,
        remaining=remaining,
        used=used if used is not None else (
            max(0, daily_limit - remaining)
            if daily_limit is not None and remaining is not None
            else None
        ),
        resetAt=str(payload.get("resetAt")) if payload.get("resetAt") else _next_utc_midnight(),
        exhausted=exhausted,
    )


async def fetch_daily_quota(
    settings: Settings,
    client: Optional[httpx.AsyncClient] = None,
) -> QuotaInfo:
    if not settings.is_plantnet_configured:
        return QuotaInfo(
            available=False,
            configured=False,
            exhausted=False,
            errorCode="API_KEY_NOT_CONFIGURED",
            message="PLANTNET_API_KEY is not configured in backend/.env.",
        )

    if is_locally_exhausted():
        return QuotaInfo(
            available=False,
            configured=True,
            dailyLimit=_last_known_limit,
            remaining=0,
            used=_last_known_limit,
            resetAt=_next_utc_midnight(),
            exhausted=True,
            errorCode="QUOTA_EXHAUSTED",
            message="Daily free Pl@ntNet API quota has been exhausted.",
        )

    url = f"{settings.plantnet_api_base_url}/v2/quota/daily"
    own_client = client is None
    active_client = client or httpx.AsyncClient(timeout=min(settings.api_timeout_seconds, 10.0))

    try:
        res = await active_client.get(
            url,
            params={"api-key": settings.plantnet_api_key},
            headers={"Accept": "application/json"},
        )
        if res.status_code == 429:
            mark_quota_exhausted()
            return QuotaInfo(
                available=False,
                configured=True,
                dailyLimit=_last_known_limit,
                remaining=0,
                used=_last_known_limit,
                resetAt=_next_utc_midnight(),
                exhausted=True,
                errorCode="QUOTA_EXHAUSTED",
                message="Daily free Pl@ntNet API quota has been exhausted.",
            )
        if res.status_code >= 400:
            err = map_upstream_error(res.status_code, "quota")
            return QuotaInfo(
                available=False,
                configured=True,
                dailyLimit=_last_known_limit,
                remaining=_last_known_remaining,
                resetAt=_next_utc_midnight(),
                exhausted=False,
                errorCode=err.code,
                message=err.message,
            )
        return parse_quota_response(res.json())
    except httpx.TimeoutException:
        return QuotaInfo(
            available=False,
            configured=True,
            dailyLimit=_last_known_limit,
            remaining=_last_known_remaining,
            resetAt=_next_utc_midnight(),
            errorCode="NETWORK_TIMEOUT",
            message="Timed out while checking Pl@ntNet daily quota.",
        )
    except httpx.HTTPError as exc:
        return QuotaInfo(
            available=False,
            configured=True,
            dailyLimit=_last_known_limit,
            remaining=_last_known_remaining,
            resetAt=_next_utc_midnight(),
            errorCode="UPSTREAM_ERROR",
            message=f"Quota service unavailable: {redact_api_key(str(exc))}",
        )
    finally:
        if own_client:
            await active_client.aclose()
