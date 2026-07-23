from __future__ import annotations

import unittest
from datetime import datetime, timezone

import pandas as pd

from scripts.generate_market_data import _normalise, _quality, _rsi


class MarketDataTests(unittest.TestCase):
    def sample_frame(self) -> pd.DataFrame:
        dates = pd.date_range("2026-01-02", periods=60, freq="B", tz="America/New_York")
        close = pd.Series([10 + index * 0.1 for index in range(60)], index=dates)
        return pd.DataFrame(
            {
                "Open": close - 0.05,
                "High": close + 0.15,
                "Low": close - 0.15,
                "Close": close,
                "Volume": [100_000 + index * 1_000 for index in range(60)],
            },
            index=dates,
        )

    def test_normalise_preserves_clean_ohlcv(self) -> None:
        frame, duplicates = _normalise(self.sample_frame())
        self.assertEqual(duplicates, 0)
        self.assertEqual(len(frame), 60)
        self.assertIsNone(frame.index.tz)

    def test_rsi_detects_strong_uptrend(self) -> None:
        frame, _ = _normalise(self.sample_frame())
        value = _rsi(frame["Close"])
        self.assertIsNotNone(value)
        self.assertGreaterEqual(value, 99)

    def test_quality_is_high_for_clean_recent_data(self) -> None:
        frame, duplicates = _normalise(self.sample_frame())
        now = datetime(2026, 3, 27, tzinfo=timezone.utc)
        metrics = _quality(frame, duplicates, now)
        self.assertEqual(metrics["nullCells"], 0)
        self.assertEqual(metrics["invalidOhlcRows"], 0)
        self.assertGreaterEqual(metrics["score"], 95)

    def test_normalise_rejects_missing_columns(self) -> None:
        with self.assertRaisesRegex(ValueError, "missing columns"):
            _normalise(pd.DataFrame({"Close": [1, 2, 3]}))


if __name__ == "__main__":
    unittest.main()
