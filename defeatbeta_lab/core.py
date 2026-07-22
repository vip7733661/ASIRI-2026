from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date
from typing import Any

import numpy as np
import pandas as pd

CANONICAL_COLUMNS = ("date", "open", "high", "low", "close", "volume")
ALIASES = {
    "date": "date",
    "report date": "date",
    "datetime": "date",
    "timestamp": "date",
    "open": "open",
    "high": "high",
    "low": "low",
    "close": "close",
    "adj close": "adj_close",
    "volume": "volume",
}


@dataclass(frozen=True)
class QualityMetrics:
    source: str
    symbol: str
    rows: int
    first_date: str | None
    last_date: str | None
    duplicate_dates_removed: int
    missing_business_days: int
    null_cells: int
    invalid_ohlc_rows: int
    nonpositive_close_rows: int
    negative_volume_rows: int
    freshness_days: int | None
    quality_score: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _flat_column_name(column: Any) -> str:
    if isinstance(column, tuple):
        column = column[0]
    return str(column).strip().lower().replace("_", " ")


def normalize_prices(
    frame: pd.DataFrame,
    *,
    start: str | None = None,
    end: str | None = None,
) -> tuple[pd.DataFrame, int]:
    """Return a deterministic OHLCV frame and duplicate-date count."""
    if frame is None or frame.empty:
        raise ValueError("The provider returned no price rows.")

    work = frame.copy()
    renamed: dict[Any, str] = {}
    for column in work.columns:
        normalized = _flat_column_name(column)
        target = ALIASES.get(normalized)
        if target:
            renamed[column] = target
    work = work.rename(columns=renamed)

    if "date" not in work.columns:
        if isinstance(work.index, pd.DatetimeIndex) or work.index.name:
            work = work.reset_index()
            work = work.rename(columns={work.columns[0]: "date"})

    missing = [column for column in CANONICAL_COLUMNS if column not in work.columns]
    if missing:
        raise ValueError(f"Missing required OHLCV columns: {', '.join(missing)}")

    work = work.loc[:, list(CANONICAL_COLUMNS)].copy()
    work["date"] = (
        pd.to_datetime(work["date"], errors="coerce", utc=True)
        .dt.tz_convert(None)
        .dt.normalize()
    )
    for column in CANONICAL_COLUMNS[1:]:
        work[column] = pd.to_numeric(work[column], errors="coerce")

    work = work.dropna(subset=["date"]).sort_values("date")
    duplicate_count = int(work.duplicated(subset=["date"], keep="last").sum())
    work = work.drop_duplicates(subset=["date"], keep="last")

    if start:
        work = work[work["date"] >= pd.Timestamp(start)]
    if end:
        work = work[work["date"] <= pd.Timestamp(end)]

    return work.reset_index(drop=True), duplicate_count


def calculate_quality(
    frame: pd.DataFrame,
    *,
    source: str,
    symbol: str,
    duplicate_dates_removed: int = 0,
    as_of: date | None = None,
) -> QualityMetrics:
    """Calculate transparent data-quality checks and a 0-100 score."""
    if frame.empty:
        raise ValueError("Cannot score an empty price frame.")

    as_of = as_of or date.today()
    first_date = frame["date"].min()
    last_date = frame["date"].max()

    expected = pd.bdate_range(first_date, last_date)
    observed = pd.DatetimeIndex(frame["date"].dropna().unique())
    missing_business_days = int(len(expected.difference(observed)))

    null_cells = int(frame[list(CANONICAL_COLUMNS[1:])].isna().sum().sum())
    invalid_ohlc = (
        (frame["high"] < frame[["open", "close", "low"]].max(axis=1))
        | (frame["low"] > frame[["open", "close", "high"]].min(axis=1))
    )
    invalid_ohlc_rows = int(invalid_ohlc.fillna(False).sum())
    nonpositive_close_rows = int((frame["close"] <= 0).fillna(False).sum())
    negative_volume_rows = int((frame["volume"] < 0).fillna(False).sum())
    freshness_days = max(0, (as_of - last_date.date()).days)

    row_count = max(len(frame), 1)
    expected_count = max(len(expected), 1)
    penalties = (
        min(25.0, (null_cells / (row_count * 5)) * 100)
        + min(25.0, invalid_ohlc_rows * 5.0)
        + min(10.0, duplicate_dates_removed * 2.0)
        + min(10.0, nonpositive_close_rows * 5.0)
        + min(10.0, negative_volume_rows * 5.0)
        + min(15.0, (missing_business_days / expected_count) * 100)
        + min(15.0, max(0, freshness_days - 3) * 1.5)
    )
    score = round(max(0.0, 100.0 - penalties), 1)

    return QualityMetrics(
        source=source,
        symbol=symbol.upper(),
        rows=len(frame),
        first_date=first_date.date().isoformat(),
        last_date=last_date.date().isoformat(),
        duplicate_dates_removed=duplicate_dates_removed,
        missing_business_days=missing_business_days,
        null_cells=null_cells,
        invalid_ohlc_rows=invalid_ohlc_rows,
        nonpositive_close_rows=nonpositive_close_rows,
        negative_volume_rows=negative_volume_rows,
        freshness_days=freshness_days,
        quality_score=score,
    )


def compare_sources(left: pd.DataFrame, right: pd.DataFrame) -> dict[str, Any]:
    """Compare overlapping daily closes and volumes from two providers."""
    merged = left.merge(right, on="date", how="inner", suffixes=("_left", "_right"))
    if merged.empty:
        return {
            "overlap_rows": 0,
            "coverage_ratio": 0.0,
            "mean_close_diff_pct": None,
            "max_close_diff_pct": None,
            "mean_volume_diff_pct": None,
            "verdict": "لا توجد تواريخ مشتركة للمقارنة",
        }

    close_base = merged["close_right"].replace(0, np.nan).abs()
    close_diff = ((merged["close_left"] - merged["close_right"]).abs() / close_base) * 100

    volume_base = merged["volume_right"].replace(0, np.nan).abs()
    volume_diff = ((merged["volume_left"] - merged["volume_right"]).abs() / volume_base) * 100

    union_dates = len(set(left["date"]).union(set(right["date"])))
    coverage = len(merged) / max(union_dates, 1)
    mean_close = float(close_diff.mean()) if close_diff.notna().any() else None
    max_close = float(close_diff.max()) if close_diff.notna().any() else None
    mean_volume = float(volume_diff.mean()) if volume_diff.notna().any() else None

    if coverage >= 0.95 and (mean_close is not None and mean_close <= 0.05):
        verdict = "تطابق ممتاز"
    elif coverage >= 0.85 and (mean_close is not None and mean_close <= 0.25):
        verdict = "تطابق جيد مع فروقات محدودة"
    else:
        verdict = "يحتاج مراجعة قبل الاعتماد"

    return {
        "overlap_rows": len(merged),
        "coverage_ratio": round(coverage, 4),
        "mean_close_diff_pct": round(mean_close, 6) if mean_close is not None else None,
        "max_close_diff_pct": round(max_close, 6) if max_close is not None else None,
        "mean_volume_diff_pct": round(mean_volume, 4) if mean_volume is not None else None,
        "verdict": verdict,
    }
