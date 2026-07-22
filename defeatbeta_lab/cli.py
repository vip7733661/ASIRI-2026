from __future__ import annotations

import argparse
import json
from pathlib import Path

from .core import calculate_quality, compare_sources, normalize_prices
from .providers import DefeatBetaProvider, YFinanceProvider
from .report import write_html_report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audit defeatbeta-api OHLCV data and optionally compare it with yfinance."
    )
    parser.add_argument("symbol", help="US stock ticker, for example TSLA or AAPL")
    parser.add_argument("--start", help="Optional ISO start date, for example 2020-01-01")
    parser.add_argument("--end", help="Optional ISO end date")
    parser.add_argument(
        "--compare-yfinance",
        action="store_true",
        help="Download the same symbol from yfinance and compare overlapping rows.",
    )
    parser.add_argument(
        "--output-dir",
        default="defeatbeta_lab/output",
        help="Folder for CSV, JSON and HTML outputs.",
    )
    return parser.parse_args()


def run() -> int:
    args = parse_args()
    symbol = args.symbol.strip().upper()
    if not symbol:
        raise SystemExit("A non-empty ticker symbol is required.")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    primary_provider = DefeatBetaProvider()
    primary_raw = primary_provider.prices(symbol)
    primary_frame, primary_duplicates = normalize_prices(
        primary_raw, start=args.start, end=args.end
    )
    primary_metrics = calculate_quality(
        primary_frame,
        source=primary_provider.name,
        symbol=symbol,
        duplicate_dates_removed=primary_duplicates,
    )
    primary_frame.to_csv(output_dir / f"{symbol}_defeatbeta.csv", index=False)

    comparison_metrics = None
    comparison_result = None
    metrics_payload: dict[str, object] = {"primary": primary_metrics.to_dict()}

    if args.compare_yfinance:
        reference_provider = YFinanceProvider()
        reference_raw = reference_provider.prices(symbol)
        reference_frame, reference_duplicates = normalize_prices(
            reference_raw, start=args.start, end=args.end
        )
        comparison_metrics = calculate_quality(
            reference_frame,
            source=reference_provider.name,
            symbol=symbol,
            duplicate_dates_removed=reference_duplicates,
        )
        comparison_result = compare_sources(primary_frame, reference_frame)
        reference_frame.to_csv(output_dir / f"{symbol}_yfinance.csv", index=False)
        metrics_payload["comparison"] = comparison_metrics.to_dict()
        metrics_payload["source_comparison"] = comparison_result

    (output_dir / f"{symbol}_metrics.json").write_text(
        json.dumps(metrics_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    report_path = output_dir / f"{symbol}_report.html"
    write_html_report(
        report_path,
        symbol=symbol,
        primary=primary_metrics,
        comparison=comparison_metrics,
        comparison_result=comparison_result,
    )

    print(f"Quality score: {primary_metrics.quality_score}/100")
    print(f"Rows: {primary_metrics.rows:,}")
    print(f"Latest date: {primary_metrics.last_date}")
    if comparison_result:
        print(f"Comparison verdict: {comparison_result['verdict']}")
    print(f"Report: {report_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
