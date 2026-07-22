from __future__ import annotations

from html import escape
from pathlib import Path
from typing import Any

from .core import QualityMetrics


def _value(value: Any, suffix: str = "") -> str:
    if value is None:
        return "غير متاح"
    if isinstance(value, float):
        return f"{value:,.4f}{suffix}"
    return f"{value}{suffix}"


def build_html_report(
    *,
    symbol: str,
    primary: QualityMetrics,
    comparison: QualityMetrics | None,
    comparison_result: dict[str, Any] | None,
) -> str:
    comparison_cards = ""
    comparison_table = ""
    if comparison and comparison_result:
        comparison_cards = f"""
        <div class="card"><span>درجة المصدر المقارن</span><strong>{comparison.quality_score}/100</strong></div>
        <div class="card"><span>نسبة التغطية المشتركة</span><strong>{comparison_result['coverage_ratio'] * 100:.1f}%</strong></div>
        <div class="card"><span>متوسط فرق الإغلاق</span><strong>{_value(comparison_result['mean_close_diff_pct'], '%')}</strong></div>
        """
        comparison_table = f"""
        <section>
          <h2>مقارنة المصادر</h2>
          <table>
            <tr><th>المعيار</th><th>{escape(primary.source)}</th><th>{escape(comparison.source)}</th></tr>
            <tr><td>عدد الصفوف</td><td>{primary.rows}</td><td>{comparison.rows}</td></tr>
            <tr><td>آخر تاريخ</td><td>{primary.last_date}</td><td>{comparison.last_date}</td></tr>
            <tr><td>الأيام المفقودة التقريبية</td><td>{primary.missing_business_days}</td><td>{comparison.missing_business_days}</td></tr>
            <tr><td>صفوف OHLC غير الصالحة</td><td>{primary.invalid_ohlc_rows}</td><td>{comparison.invalid_ohlc_rows}</td></tr>
            <tr><td>الحكم</td><td colspan="2">{escape(str(comparison_result['verdict']))}</td></tr>
          </table>
        </section>
        """

    return f"""<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DefeatBeta Reliability Report — {escape(symbol.upper())}</title>
<style>
:root {{ color-scheme: dark; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }}
body {{ margin:0; background:#07111f; color:#eef5ff; }}
main {{ max-width:1100px; margin:auto; padding:32px 20px 60px; }}
header {{ padding:28px; border:1px solid #1f3852; border-radius:24px; background:linear-gradient(135deg,#102238,#0a1728); }}
.badge {{ display:inline-block; padding:7px 12px; border-radius:999px; background:#173f54; color:#8de8ff; }}
h1 {{ margin:16px 0 8px; font-size:clamp(28px,5vw,52px); }}
p {{ color:#a9bed2; line-height:1.8; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:14px; margin:20px 0; }}
.card {{ padding:18px; border:1px solid #1f3852; border-radius:18px; background:#0c1a2b; }}
.card span {{ display:block; color:#91a8bd; margin-bottom:9px; }}
.card strong {{ font-size:26px; }}
section {{ margin-top:28px; padding:22px; border:1px solid #1f3852; border-radius:20px; background:#0b1727; overflow:auto; }}
table {{ width:100%; border-collapse:collapse; min-width:620px; }}
th,td {{ text-align:right; padding:13px; border-bottom:1px solid #1d3348; }}
th {{ color:#8de8ff; }}
.notice {{ border-right:4px solid #ffbf69; padding:14px 16px; background:#261d12; color:#ffd9a1; border-radius:10px; }}
</style>
</head>
<body>
<main>
<header>
  <span class="badge">Market Data Reliability Lab — MVP 0.1</span>
  <h1>تقرير جودة بيانات {escape(symbol.upper())}</h1>
  <p>فحص مستقل لبيانات defeatbeta-api، مع مقارنة اختيارية بمصدر مرجعي. لا يتصل بأي منصة تداول ولا ينفذ أوامر.</p>
</header>
<div class="grid">
  <div class="card"><span>درجة defeatbeta-api</span><strong>{primary.quality_score}/100</strong></div>
  <div class="card"><span>عدد الصفوف</span><strong>{primary.rows:,}</strong></div>
  <div class="card"><span>آخر تاريخ</span><strong>{primary.last_date}</strong></div>
  <div class="card"><span>حداثة البيانات</span><strong>{primary.freshness_days} يوم</strong></div>
  {comparison_cards}
</div>
<section>
<h2>فحوص الجودة</h2>
<table>
<tr><th>المعيار</th><th>النتيجة</th></tr>
<tr><td>التواريخ المكررة التي أزيلت</td><td>{primary.duplicate_dates_removed}</td></tr>
<tr><td>الأيام التجارية المفقودة التقريبية</td><td>{primary.missing_business_days}</td></tr>
<tr><td>الخلايا الفارغة</td><td>{primary.null_cells}</td></tr>
<tr><td>صفوف OHLC غير المنطقية</td><td>{primary.invalid_ohlc_rows}</td></tr>
<tr><td>أسعار إغلاق غير موجبة</td><td>{primary.nonpositive_close_rows}</td></tr>
<tr><td>أحجام تداول سالبة</td><td>{primary.negative_volume_rows}</td></tr>
</table>
</section>
{comparison_table}
<section class="notice">
الأيام المفقودة تُقاس مبدئيًا مقابل أيام العمل الأسبوعية، وقد تشمل عطلات السوق الرسمية. هذه النسخة مختبر جودة بيانات وليست مصدر أسعار لحظي أو توصية استثمارية.
</section>
</main>
</body>
</html>"""


def write_html_report(path: Path, **kwargs: Any) -> None:
    path.write_text(build_html_report(**kwargs), encoding="utf-8")
