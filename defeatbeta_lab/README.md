# DefeatBeta Market Data Reliability Lab

مختبر مستقل لفحص جودة البيانات التاريخية القادمة من [`defeat-beta/defeatbeta-api`](https://github.com/defeat-beta/defeatbeta-api)، مع مقارنة اختيارية بمكتبة `yfinance`.

> هذا المشروع لا يرتبط بـ Asiri Capital، ولا يستخدم مفاتيحها أو بياناتها، ولا ينفذ أي تداول.

## ما الذي يفعله MVP 0.1؟

- يجلب OHLCV التاريخية دون API key عبر `defeatbeta-api`.
- يوحّد أسماء الأعمدة والتواريخ والأنواع الرقمية.
- يزيل التواريخ المكررة مع تسجيل عددها.
- يكشف القيم الفارغة، أسعار الإغلاق غير الموجبة، الحجم السالب، وصفوف OHLC غير المنطقية.
- يقيس حداثة آخر سجل والفجوات التقريبية بين أيام العمل.
- ينتج **Data Quality Score من 100** بقواعد واضحة.
- يقارن اختياريًا أسعار الإغلاق والحجم مع `yfinance`.
- يصدر CSV وJSON وتقرير HTML عربي RTL.

## التشغيل

يتطلب Python 3.11 أو أحدث.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r defeatbeta_lab/requirements.txt
python -m defeatbeta_lab.cli TSLA --compare-yfinance
```

في Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r defeatbeta_lab/requirements.txt
python -m defeatbeta_lab.cli TSLA --compare-yfinance
```

يمكن تحديد فترة زمنية ومجلد إخراج:

```bash
python -m defeatbeta_lab.cli AAPL \
  --start 2020-01-01 \
  --end 2026-07-21 \
  --compare-yfinance \
  --output-dir defeatbeta_lab/output/aapl
```

## المخرجات

```text
defeatbeta_lab/output/
├── TSLA_defeatbeta.csv
├── TSLA_yfinance.csv
├── TSLA_metrics.json
└── TSLA_report.html
```

## الاختبارات

```bash
pip install -r defeatbeta_lab/requirements-test.txt
python -m pytest tests/test_defeatbeta_core.py -q
```

## تفسير الدرجة

الدرجة تبدأ من 100 ثم تخصم عقوبات محدودة حسب:

- نسبة الخلايا الفارغة.
- صفوف OHLC غير المنطقية.
- التكرارات.
- أسعار الإغلاق غير الموجبة.
- أحجام التداول السالبة.
- الفجوات التقريبية.
- تقادم آخر تاريخ.

مقياس الفجوات في النسخة الحالية يستخدم أيام العمل الأسبوعية، لذلك قد يحتسب عطلات السوق الرسمية كفجوات. ستضاف رزنامة تداول أمريكية دقيقة في المرحلة التالية.

## حدود النسخة الحالية

- بيانات يومية تاريخية، وليست بثًا لحظيًا.
- ادعاء موثوقية أي مصدر لا يُعتمد قبل تشغيل المقارنة على عينة واسعة.
- لا توجد قرارات شراء أو بيع.
- لا يوجد ربط بوسيط أو قاعدة بيانات خارجية.
- استخدام بيانات Yahoo يخضع لشروط مصدر البيانات حتى عند الوصول إليها عبر مكتبات مفتوحة المصدر.
