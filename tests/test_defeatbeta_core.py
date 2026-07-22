from datetime import date

import pandas as pd
import pytest

from defeatbeta_lab.core import calculate_quality, compare_sources, normalize_prices


def sample_frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "report_date": ["2026-07-20", "2026-07-21", "2026-07-21"],
            "open": [10.0, 10.5, 10.6],
            "high": [11.0, 11.2, 11.3],
            "low": [9.5, 10.1, 10.2],
            "close": [10.8, 11.0, 11.1],
            "volume": [1000, 1200, 1250],
        }
    )


def test_normalize_prices_deduplicates_and_renames():
    normalized, duplicates = normalize_prices(sample_frame())
    assert duplicates == 1
    assert list(normalized.columns) == ["date", "open", "high", "low", "close", "volume"]
    assert normalized["close"].tolist() == [10.8, 11.1]


def test_quality_score_is_high_for_clean_recent_data():
    normalized, duplicates = normalize_prices(sample_frame())
    metrics = calculate_quality(
        normalized,
        source="test",
        symbol="abc",
        duplicate_dates_removed=duplicates,
        as_of=date(2026, 7, 22),
    )
    assert metrics.symbol == "ABC"
    assert metrics.rows == 2
    assert metrics.quality_score >= 95


def test_compare_sources_detects_close_difference():
    left, _ = normalize_prices(sample_frame())
    right = left.copy()
    right["close"] = right["close"] * 1.01
    result = compare_sources(left, right)
    assert result["overlap_rows"] == 2
    assert result["mean_close_diff_pct"] == pytest.approx(0.990099, abs=1e-6)
    assert result["verdict"] == "يحتاج مراجعة قبل الاعتماد"


def test_missing_required_columns_raise_clear_error():
    with pytest.raises(ValueError, match="Missing required OHLCV"):
        normalize_prices(pd.DataFrame({"date": ["2026-01-01"], "close": [10]}))
