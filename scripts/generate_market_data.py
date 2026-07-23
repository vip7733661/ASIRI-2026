from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import yfinance as yf

DEFAULT_SYMBOLS = ("AAPL", "MSFT", "SPY", "PLUG", "CRDL", "ADMA", "AMPL")
REQUIRED_COLUMNS = ("Open", "High", "Low", "Close", "Volume")


def _number(value: Any, digits: int = 4) -> float | int | None:
    if value is None or pd.isna(value) or not math.isfinite(float(value)):
        return None
    numeric = float(value)
    if digits == 0:
        return int(round(numeric))
    return round(numeric, digits)


def _rsi(close: pd.Series, period: int = 14) -> float | None:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    denominator = loss.iloc[-1]
    if pd.isna(denominator):
        return None
    if denominator == 0:
        return 100.0
    relative_strength = gain.iloc[-1] / denominator
    return _number(100 - (100 / (1 + relative_strength)), 2)


def _normalise(frame: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    if frame is None or frame.empty:
        raise ValueError("provider returned no rows")

    work = frame.copy()
    missing = [column for column in REQUIRED_COLUMNS if column not in work.columns]
    if missing:
        raise ValueError(f"missing columns: {', '.join(missing)}")

    work = work.loc[:, list(REQUIRED_COLUMNS)].copy()
    work.index = pd.to_datetime(work.index, errors="coerce", utc=True).tz_convert(None).normalize()
    work = work[~work.index.isna()].sort_index()
    duplicates = int(work.index.duplicated(keep="last").sum())
    work = work[~work.index.duplicated(keep="last")]
    for column in REQUIRED_COLUMNS:
        work[column] = pd.to_numeric(work[column], errors="coerce")
    work = work.dropna(subset=["Close"])
    if len(work) < 20:
        raise ValueError(f"insufficient rows: {len(work)}")
    return work, duplicates


def _quality(frame: pd.DataFrame, duplicates: int, now: datetime) -> dict[str, Any]:
    null_cells = int(frame[list(REQUIRED_COLUMNS)].isna().sum().sum())
    invalid_ohlc = int(
        (
            (frame["High"] < frame[["Open", "Close", "Low"]].max(axis=1))
            | (frame["Low"] > frame[["Open", "Close", "High"]].min(axis=1))
        ).fillna(False).sum()
    )
    nonpositive_close = int((frame["Close"] <= 0).fillna(False).sum())
    negative_volume = int((frame["Volume"] < 0).fillna(False).sum())
    stale_days = max(0, (now.date() - frame.index[-1].date()).days)

    score = 100.0
    score -= min(25.0, null_cells * 0.5)
    score -= min(20.0, invalid_ohlc * 4.0)
    score -= min(10.0, duplicates * 2.0)
    score -= min(10.0, nonpositive_close * 5.0)
    score -= min(10.0, negative_volume * 5.0)
    score -= min(25.0, max(0, stale_days - 4) * 2.5)

    return {
        "score": round(max(0.0, score), 1),
        "rows": len(frame),
        "nullCells": null_cells,
        "duplicateDatesRemoved": duplicates,
        "invalidOhlcRows": invalid_ohlc,
        "nonpositiveCloseRows": nonpositive_close,
        "negativeVolumeRows": negative_volume,
        "staleDays": stale_days,
    }


def build_symbol_snapshot(symbol: str, now: datetime) -> dict[str, Any]:
    ticker = yf.Ticker(symbol)
    raw = ticker.history(period="6mo", interval="1d", auto_adjust=False, actions=False)
    frame, duplicates = _normalise(raw)

    latest = frame.iloc[-1]
    previous = frame.iloc[-2]
    close = frame["Close"]
    window20 = frame.tail(20)
    previous_close = float(previous["Close"])
    latest_close = float(latest["Close"])
    change = latest_close - previous_close
    change_percent = (change / previous_close * 100) if previous_close else None

    sessions: list[dict[str, Any]] = []
    for index, row in frame.tail(30).iterrows():
        sessions.append(
            {
                "date": index.date().isoformat(),
                "open": _number(row["Open"], 4),
                "high": _number(row["High"], 4),
                "low": _number(row["Low"], 4),
                "close": _number(row["Close"], 4),
                "volume": _number(row["Volume"], 0),
            }
        )

    return {
        "symbol": symbol,
        "currency": "USD",
        "latestDate": frame.index[-1].date().isoformat(),
        "latestClose": _number(latest_close, 4),
        "previousClose": _number(previous_close, 4),
        "change": _number(change, 4),
        "changePercent": _number(change_percent, 2),
        "volume": _number(latest["Volume"], 0),
        "high20": _number(window20["High"].max(), 4),
        "low20": _number(window20["Low"].min(), 4),
        "sma20": _number(close.rolling(20).mean().iloc[-1], 4),
        "sma50": _number(close.rolling(50).mean().iloc[-1], 4),
        "rsi14": _rsi(close),
        "avgVolume20": _number(window20["Volume"].mean(), 0),
        "quality": _quality(frame, duplicates, now),
        "sessions": sessions,
    }


def generate(symbols: list[str]) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    snapshots: dict[str, Any] = {}
    errors: dict[str, str] = {}

    for raw_symbol in symbols:
        symbol = raw_symbol.strip().upper()
        if not symbol:
            continue
        try:
            snapshots[symbol] = build_symbol_snapshot(symbol, now)
        except Exception as exc:  # provider/network errors must be visible in output
            errors[symbol] = str(exc)

    if not snapshots:
        raise RuntimeError(f"all market-data requests failed: {errors}")

    return {
        "schemaVersion": 1,
        "generatedAt": now.isoformat(),
        "source": {
            "name": "yfinance",
            "version": getattr(yf, "__version__", "unknown"),
            "usage": "research-and-educational",
            "upstream": "Yahoo Finance public interfaces",
        },
        "symbols": snapshots,
        "errors": errors,
        "disclaimer": "بيانات بحثية متأخرة محتملة وليست بثًا لحظيًا أو توصية استثمارية. راجع شروط مصدر البيانات قبل الاستخدام التجاري.",
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate API Atlas market-data snapshot.")
    parser.add_argument("--output", default="api-intelligence/market-data.json")
    parser.add_argument("--symbols", nargs="*", default=list(DEFAULT_SYMBOLS))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    payload = generate(args.symbols)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "generatedAt": payload["generatedAt"],
                "symbols": list(payload["symbols"]),
                "errors": payload["errors"],
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
