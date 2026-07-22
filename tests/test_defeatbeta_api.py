from __future__ import annotations

from fastapi.testclient import TestClient

import defeatbeta_lab.api as api_module

client = TestClient(api_module.app)


def sample_payload(symbol: str) -> dict:
    return {
        "symbol": symbol,
        "generated_at": "2026-07-22T00:00:00+00:00",
        "period": {"start": None, "end": None},
        "primary": {
            "source": "defeatbeta-api",
            "symbol": symbol,
            "rows": 3,
            "first_date": "2026-07-20",
            "last_date": "2026-07-22",
            "duplicate_dates_removed": 0,
            "missing_business_days": 0,
            "null_cells": 0,
            "invalid_ohlc_rows": 0,
            "nonpositive_close_rows": 0,
            "negative_volume_rows": 0,
            "freshness_days": 0,
            "quality_score": 100.0,
        },
        "latest": {
            "date": "2026-07-22",
            "open": 100.0,
            "high": 102.0,
            "low": 99.0,
            "close": 101.0,
            "volume": 1000.0,
        },
        "comparison": None,
        "source_comparison": None,
    }


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["trading_enabled"] is False


def test_health_endpoint_allows_preview_origin():
    response = client.get(
        "/api/health",
        headers={"Origin": "https://raw.githack.com"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://raw.githack.com"


def test_audit_endpoint_uses_service_and_cache(monkeypatch):
    calls = []

    def fake_audit(symbol: str, **kwargs):
        calls.append((symbol, kwargs))
        return sample_payload(symbol)

    monkeypatch.setattr(api_module, "audit_symbol", fake_audit)
    api_module._CACHE.clear()

    first = client.get("/api/audit/aapl?compare=false")
    second = client.get("/api/audit/AAPL?compare=false")

    assert first.status_code == 200
    assert first.json()["symbol"] == "AAPL"
    assert first.json()["cached"] is False
    assert second.json()["cached"] is True
    assert len(calls) == 1


def test_audit_endpoint_rejects_invalid_symbol():
    response = client.get("/api/audit/AAPL%20DROP")
    assert response.status_code == 422


def test_audit_endpoint_rejects_reversed_dates():
    response = client.get("/api/audit/AAPL?start=2026-07-22&end=2026-07-01")
    assert response.status_code == 422
