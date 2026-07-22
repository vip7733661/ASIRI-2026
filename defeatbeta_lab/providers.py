from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import pandas as pd


class PriceProvider(Protocol):
    name: str

    def prices(self, symbol: str) -> pd.DataFrame:
        ...


@dataclass
class DefeatBetaProvider:
    name: str = "defeatbeta-api"

    def prices(self, symbol: str) -> pd.DataFrame:
        try:
            from defeatbeta_api.data.ticker import Ticker
        except ImportError as exc:
            raise RuntimeError(
                "defeatbeta-api is not installed. Run: "
                "pip install -r defeatbeta_lab/requirements.txt"
            ) from exc
        return Ticker(symbol.upper()).price()


@dataclass
class YFinanceProvider:
    name: str = "yfinance"

    def prices(self, symbol: str) -> pd.DataFrame:
        try:
            import yfinance as yf
        except ImportError as exc:
            raise RuntimeError(
                "yfinance is not installed. Run: "
                "pip install -r defeatbeta_lab/requirements.txt"
            ) from exc

        frame = yf.download(
            symbol.upper(),
            period="max",
            auto_adjust=False,
            actions=False,
            progress=False,
            threads=False,
        )
        if frame.empty:
            raise RuntimeError(f"yfinance returned no rows for {symbol.upper()}.")
        return frame.reset_index()
