from __future__ import annotations

import pandas as pd

from defeatbeta_lab.service import audit_symbol


class FakeProvider:
    def __init__(self, name: str, close_multiplier: float = 1.0):
        self.name = name
        self.close_multiplier = close_multiplier

    def prices(self, symbol: str) -> pd.DataFrame:
        assert symbol == "AAPL"
        return pd.DataFrame(
            {
                "report_date": ["2026-07-20", "2026-07-21", "2026-07-22"],
                "open": [100.0, 101.0, 102.0],
                "high": [102.0, 103.0, 104.0],
                "low": [99.0, 100.0, 101.0],
                "close": [101.0, 102.0, 103.0 * self.close_multiplier],
                "volume": [1000, 1100, 1200],
            }
        )


def test_audit_symbol_returns_primary_latest_and_comparison():
    payload = audit_symbol(
        "aapl",
        compare=True,
        primary_provider=FakeProvider("defeatbeta-api"),
        reference_provider=FakeProvider("yfinance", close_multiplier=1.001),
    )

    assert payload["symbol"] == "AAPL"
    assert payload["primary"]["source"] == "defeatbeta-api"
    assert payload["primary"]["rows"] == 3
    assert payload["latest"]["date"] == "2026-07-22"
    assert payload["latest"]["close"] == 103.0
    assert payload["comparison"]["source"] == "yfinance"
    assert payload["source_comparison"]["overlap_rows"] == 3


def test_audit_symbol_can_skip_reference_provider():
    payload = audit_symbol(
        "AAPL",
        compare=False,
        primary_provider=FakeProvider("defeatbeta-api"),
    )

    assert payload["comparison"] is None
    assert payload["source_comparison"] is None
