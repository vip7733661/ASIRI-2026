from __future__ import annotations

import asyncio
import os
import re
import threading
import time
from datetime import date
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .service import audit_symbol

APP_ROOT = Path(__file__).resolve().parents[1]
DEMO_FILE = APP_ROOT / "defeatbeta-demo.html"
SYMBOL_PATTERN = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$")
CACHE_TTL_SECONDS = 900
DEFAULT_ALLOWED_ORIGINS = (
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "https://raw.githack.com",
    "https://vip7733661.github.io",
)
_CACHE: dict[tuple[str, str | None, str | None, bool], tuple[float, dict[str, Any]]] = {}
_CACHE_LOCK = threading.Lock()

app = FastAPI(
    title="DefeatBeta Market Data Reliability Lab",
    version="0.2.0",
    description="Standalone market-data quality audit API. No trading or broker connection.",
)

configured_origins = tuple(
    origin.strip()
    for origin in os.getenv("DEFEATBETA_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(configured_origins or DEFAULT_ALLOWED_ORIGINS),
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["Accept", "Content-Type"],
)


def _cache_key(symbol: str, start: str | None, end: str | None, compare: bool) -> tuple[str, str | None, str | None, bool]:
    return symbol, start, end, compare


def _get_cached(key: tuple[str, str | None, str | None, bool]) -> dict[str, Any] | None:
    now = time.monotonic()
    with _CACHE_LOCK:
        entry = _CACHE.get(key)
        if not entry:
            return None
        expires_at, payload = entry
        if expires_at <= now:
            _CACHE.pop(key, None)
            return None
        return {**payload, "cached": True}


def _store_cached(key: tuple[str, str | None, str | None, bool], payload: dict[str, Any]) -> None:
    with _CACHE_LOCK:
        _CACHE[key] = (time.monotonic() + CACHE_TTL_SECONDS, payload)


@app.get("/", include_in_schema=False)
def demo() -> FileResponse:
    if not DEMO_FILE.exists():
        raise HTTPException(status_code=404, detail="Demo page is missing.")
    return FileResponse(DEMO_FILE)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "defeatbeta-reliability-lab",
        "version": app.version,
        "cache_ttl_seconds": CACHE_TTL_SECONDS,
        "trading_enabled": False,
    }


@app.get("/api/audit/{symbol}")
async def audit(
    symbol: str,
    compare: bool = Query(True, description="Compare defeatbeta-api with yfinance."),
    start: date | None = Query(None),
    end: date | None = Query(None),
) -> dict[str, Any]:
    normalized_symbol = symbol.strip().upper()
    if not SYMBOL_PATTERN.fullmatch(normalized_symbol):
        raise HTTPException(
            status_code=422,
            detail="Ticker must start with a letter and contain only letters, numbers, dot or dash.",
        )
    if start and end and start > end:
        raise HTTPException(status_code=422, detail="Start date must not be after end date.")

    start_value = start.isoformat() if start else None
    end_value = end.isoformat() if end else None
    key = _cache_key(normalized_symbol, start_value, end_value, compare)
    cached = _get_cached(key)
    if cached:
        return cached

    started = time.perf_counter()
    try:
        payload = await asyncio.to_thread(
            audit_symbol,
            normalized_symbol,
            start=start_value,
            end=end_value,
            compare=compare,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # Provider/network failures must not leak internals.
        raise HTTPException(
            status_code=502,
            detail="The market-data provider could not complete the audit.",
        ) from exc

    payload = {
        **payload,
        "cached": False,
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 1),
    }
    _store_cached(key, payload)
    return payload
