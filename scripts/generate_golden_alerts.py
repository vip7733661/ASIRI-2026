from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

BENCHMARKS = {"SPY", "QQQ", "IWM"}
RULES_VERSION = "golden-alert-v1.0"


def _finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(float(value))


def _round(value: Any, digits: int = 2) -> float | None:
    if not _finite(value):
        return None
    return round(float(value), digits)


def _atr(sessions: list[dict[str, Any]], period: int = 14) -> float | None:
    if len(sessions) < period + 1:
        return None
    ranges: list[float] = []
    for index in range(1, len(sessions)):
        current = sessions[index]
        previous = sessions[index - 1]
        values = (current.get("high"), current.get("low"), previous.get("close"))
        if not all(_finite(value) for value in values):
            continue
        high, low, previous_close = map(float, values)
        ranges.append(max(high - low, abs(high - previous_close), abs(low - previous_close)))
    if len(ranges) < period:
        return None
    return sum(ranges[-period:]) / period


def _market_regime(symbols: dict[str, dict[str, Any]]) -> dict[str, Any]:
    observations: list[tuple[str, bool, bool]] = []
    for symbol in ("SPY", "QQQ"):
        snapshot = symbols.get(symbol)
        if not snapshot:
            continue
        price = snapshot.get("latestClose")
        sma20 = snapshot.get("sma20")
        sma50 = snapshot.get("sma50")
        if not all(_finite(value) for value in (price, sma20, sma50)):
            continue
        observations.append((symbol, float(price) > float(sma20), float(sma20) > float(sma50)))

    if not observations:
        return {"code": "unavailable", "label": "غير متاح", "riskMultiplier": 0.0, "evidence": []}

    evidence = [
        f"{symbol}: السعر {'فوق' if above20 else 'تحت'} SMA20 وSMA20 {'فوق' if trend else 'تحت'} SMA50"
        for symbol, above20, trend in observations
    ]
    if any(not above20 and not trend for _, above20, trend in observations):
        return {"code": "defensive", "label": "دفاعي", "riskMultiplier": 0.35, "evidence": evidence}
    if all(above20 and trend for _, above20, trend in observations):
        return {"code": "positive", "label": "إيجابي منضبط", "riskMultiplier": 1.0, "evidence": evidence}
    return {"code": "neutral", "label": "حيادي", "riskMultiplier": 0.65, "evidence": evidence}


def evaluate_symbol(symbol: str, snapshot: dict[str, Any], regime: dict[str, Any]) -> dict[str, Any]:
    price = snapshot.get("latestClose")
    sma20 = snapshot.get("sma20")
    sma50 = snapshot.get("sma50")
    rsi = snapshot.get("rsi14")
    volume = snapshot.get("volume")
    avg_volume = snapshot.get("avgVolume20")
    change_percent = snapshot.get("changePercent")
    quality = snapshot.get("quality", {}).get("score")
    stale_days = snapshot.get("quality", {}).get("staleDays")
    sessions = snapshot.get("sessions") if isinstance(snapshot.get("sessions"), list) else []

    required = (price, sma20, sma50, rsi, volume, avg_volume, quality, stale_days)
    if not all(_finite(value) for value in required) or len(sessions) < 20:
        return {
            "alertId": f"{symbol}:{snapshot.get('latestDate', 'unknown')}:blocked",
            "symbol": symbol,
            "signal": "blocked",
            "label": "القرار موقوف",
            "actionable": False,
            "score": 0,
            "price": _round(price, 4),
            "latestDate": snapshot.get("latestDate"),
            "dataQuality": _round(quality, 1),
            "marketRegime": regime["code"],
            "reasons": ["البيانات أو المؤشرات المطلوبة غير مكتملة"],
            "gates": {"data": False, "market": regime["code"] != "unavailable", "trend": False, "momentum": False, "liquidity": False},
            "metrics": {},
            "scenario": None,
        }

    price = float(price)
    sma20 = float(sma20)
    sma50 = float(sma50)
    rsi = float(rsi)
    volume = float(volume)
    avg_volume = float(avg_volume)
    quality = float(quality)
    stale_days = int(stale_days)
    change_percent = float(change_percent) if _finite(change_percent) else 0.0
    relative_volume = volume / avg_volume if avg_volume > 0 else 0.0

    prior_sessions = sessions[:-1]
    prior20 = prior_sessions[-20:]
    prior10 = prior_sessions[-10:]
    prior_high = max(float(row["high"]) for row in prior20 if _finite(row.get("high")))
    recent_low = min(float(row["low"]) for row in prior10 if _finite(row.get("low")))
    atr14 = _atr(sessions)
    breakout_distance = (price / prior_high - 1) * 100 if prior_high > 0 else None

    reasons: list[str] = []
    score = 35

    data_gate = quality >= 90 and stale_days <= 4
    if quality >= 97:
        score += 12
        reasons.append("جودة البيانات ممتازة")
    elif data_gate:
        score += 8
        reasons.append("جودة البيانات اجتازت البوابة")
    else:
        score -= 28
        reasons.append("جودة أو حداثة البيانات غير كافية")

    trend_gate = price > sma20 and sma20 > sma50
    if price > sma20:
        score += 14
        reasons.append("السعر فوق SMA20")
    else:
        score -= 14
        reasons.append("السعر تحت SMA20")
    if sma20 > sma50:
        score += 15
        reasons.append("الاتجاه المتوسط إيجابي")
    else:
        score -= 13
        reasons.append("SMA20 دون SMA50")

    momentum_gate = 45 <= rsi <= 72
    if 50 <= rsi <= 66:
        score += 12
        reasons.append("RSI في نطاق زخم صحي")
    elif momentum_gate:
        score += 6
        reasons.append("RSI مقبول")
    elif rsi > 76:
        score -= 16
        reasons.append("RSI مرتفع؛ خطر مطاردة")
    elif rsi < 35:
        score -= 12
        reasons.append("الزخم ضعيف")

    liquidity_gate = relative_volume >= 0.90
    if relative_volume >= 1.20:
        score += 12
        reasons.append("الحجم أعلى من متوسط 20 جلسة")
    elif liquidity_gate:
        score += 5
        reasons.append("الحجم قريب من المتوسط")
    else:
        score -= 7
        reasons.append("الحجم دون المستوى المطلوب")

    breakout_gate = -0.6 <= breakout_distance <= 6.0 if breakout_distance is not None else False
    if breakout_gate:
        score += 13
        reasons.append("السعر عند اختراق/إعادة اختبار قمة 20 جلسة")
    elif breakout_distance is not None and breakout_distance > 8:
        score -= 12
        reasons.append("السعر ممتد بعيدًا عن نقطة الاختراق")
    else:
        reasons.append("الاختراق لم يكتمل بعد")

    if 0 <= change_percent <= 7:
        score += 4
    elif change_percent > 10:
        score -= 12
        reasons.append("ارتفاع يومي حاد")
    elif change_percent < -6:
        score -= 9
        reasons.append("ضغط بيعي يومي قوي")

    market_gate = regime["code"] in {"positive", "neutral"}
    if regime["code"] == "positive":
        score += 10
        reasons.append("بوابة السوق إيجابية")
    elif regime["code"] == "neutral":
        score += 2
        reasons.append("السوق حيادي؛ حجم المركز يجب أن يكون أقل")
    elif regime["code"] == "defensive":
        score -= 25
        reasons.append("بوابة السوق دفاعية")
    else:
        score -= 20
        reasons.append("حالة السوق غير متاحة")

    score = max(0, min(100, round(score)))
    breakdown = data_gate and price < sma20 and sma20 < sma50 and rsi < 48
    golden_buy = (
        data_gate
        and market_gate
        and trend_gate
        and momentum_gate
        and liquidity_gate
        and breakout_gate
        and change_percent <= 9
        and score >= 80
        and symbol not in BENCHMARKS
    )

    if breakdown:
        signal = "risk_exit"
        label = "تنبيه تخفيف/خروج بحثي"
        actionable = True
    elif golden_buy:
        signal = "golden_buy"
        label = "Golden Alert · شراء مشروط"
        actionable = True
    elif score >= 65:
        signal = "watch"
        label = "مراقبة قريبة"
        actionable = False
    else:
        signal = "wait"
        label = "انتظار"
        actionable = False

    scenario = None
    if golden_buy and atr14 and atr14 > 0:
        entry_low = max(sma20, price - 0.35 * atr14)
        entry_high = price + 0.15 * atr14
        entry_mid = (entry_low + entry_high) / 2
        structural_stop = max(price - 1.5 * atr14, sma20 * 0.97, recent_low * 0.995)
        stop = min(entry_low * 0.99, structural_stop)
        risk = max(entry_mid - stop, price * 0.01)
        scenario = {
            "entryLow": _round(entry_low, 4),
            "entryHigh": _round(entry_high, 4),
            "stop": _round(stop, 4),
            "target1": _round(entry_mid + 2 * risk, 4),
            "target2": _round(entry_mid + 3 * risk, 4),
            "riskReward1": 2.0,
            "riskReward2": 3.0,
            "invalidation": f"إغلاق يومي تحت {stop:.4f} أو تحوّل حالة السوق إلى دفاعية",
        }

    return {
        "alertId": f"{symbol}:{snapshot.get('latestDate', 'unknown')}:{signal}",
        "symbol": symbol,
        "signal": signal,
        "label": label,
        "actionable": actionable,
        "score": score,
        "price": _round(price, 4),
        "latestDate": snapshot.get("latestDate"),
        "dataQuality": _round(quality, 1),
        "marketRegime": regime["code"],
        "reasons": reasons[:7],
        "gates": {
            "data": data_gate,
            "market": market_gate,
            "trend": trend_gate,
            "momentum": momentum_gate,
            "liquidity": liquidity_gate,
            "breakout": breakout_gate,
        },
        "metrics": {
            "sma20": _round(sma20, 4),
            "sma50": _round(sma50, 4),
            "rsi14": _round(rsi, 2),
            "relativeVolume": _round(relative_volume, 2),
            "prior20High": _round(prior_high, 4),
            "breakoutDistancePct": _round(breakout_distance, 2),
            "atr14": _round(atr14, 4),
            "changePercent": _round(change_percent, 2),
        },
        "scenario": scenario,
    }


def generate(market_data: dict[str, Any]) -> dict[str, Any]:
    symbols = market_data.get("symbols")
    if not isinstance(symbols, dict) or not symbols:
        raise ValueError("market-data symbols are missing")
    regime = _market_regime(symbols)
    alerts = [evaluate_symbol(symbol, snapshot, regime) for symbol, snapshot in symbols.items()]
    alerts.sort(key=lambda item: (not item["actionable"], -item["score"], item["symbol"]))
    actionable = [item for item in alerts if item["actionable"]]
    return {
        "schemaVersion": 1,
        "rulesVersion": RULES_VERSION,
        "generatedAt": market_data.get("generatedAt"),
        "marketRegime": regime,
        "summary": {
            "symbolsEvaluated": len(alerts),
            "actionable": len(actionable),
            "goldenBuy": sum(item["signal"] == "golden_buy" for item in alerts),
            "riskExit": sum(item["signal"] == "risk_exit" for item in alerts),
            "watch": sum(item["signal"] == "watch" for item in alerts),
            "blocked": sum(item["signal"] == "blocked" for item in alerts),
        },
        "alerts": alerts,
        "methodology": {
            "minimumDataQuality": 90,
            "maximumStaleDays": 4,
            "buyScoreThreshold": 80,
            "requiredRiskReward": 2.0,
            "note": "الثقة هي درجة اكتمال القواعد وليست احتمال ربح. الإشارة بحثية ومتأخرة محتملة ولا تنفذ أي صفقة.",
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Golden Alert research signals from verified market data.")
    parser.add_argument("--input", default="api-intelligence/market-data.json")
    parser.add_argument("--output", default="api-intelligence/golden-alerts.json")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    market_data = json.loads(Path(args.input).read_text(encoding="utf-8"))
    payload = generate(market_data)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"generatedAt": payload["generatedAt"], "summary": payload["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
