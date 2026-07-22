from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .core import calculate_quality, compare_sources, normalize_prices
from .providers import DefeatBetaProvider, PriceProvider, YFinanceProvider


def audit_symbol(
    symbol: str,
    *,
    start: str | None = None,
    end: str | None = None,
    compare: bool = True,
    primary_provider: PriceProvider | None = None,
    reference_provider: PriceProvider | None = None,
) -> dict[str, Any]:
    """Run a complete market-data quality audit for one ticker."""
    normalized_symbol = symbol.strip().upper()
    if not normalized_symbol:
        raise ValueError("A non-empty ticker symbol is required.")

    primary = primary_provider or DefeatBetaProvider()
    primary_raw = primary.prices(normalized_symbol)
    primary_frame, primary_duplicates = normalize_prices(
        primary_raw,
        start=start,
        end=end,
    )
    primary_metrics = calculate_quality(
        primary_frame,
        source=primary.name,
        symbol=normalized_symbol,
        duplicate_dates_removed=primary_duplicates,
    )

    latest_row = primary_frame.iloc[-1]
    payload: dict[str, Any] = {
        "symbol": normalized_symbol,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "period": {"start": start, "end": end},
        "primary": primary_metrics.to_dict(),
        "latest": {
            "date": latest_row["date"].date().isoformat(),
            "open": float(latest_row["open"]),
            "high": float(latest_row["high"]),
            "low": float(latest_row["low"]),
            "close": float(latest_row["close"]),
            "volume": float(latest_row["volume"]),
        },
        "comparison": None,
        "source_comparison": None,
    }

    if compare:
        reference = reference_provider or YFinanceProvider()
        reference_raw = reference.prices(normalized_symbol)
        reference_frame, reference_duplicates = normalize_prices(
            reference_raw,
            start=start,
            end=end,
        )
        reference_metrics = calculate_quality(
            reference_frame,
            source=reference.name,
            symbol=normalized_symbol,
            duplicate_dates_removed=reference_duplicates,
        )
        payload["comparison"] = reference_metrics.to_dict()
        payload["source_comparison"] = compare_sources(primary_frame, reference_frame)

    return payload
