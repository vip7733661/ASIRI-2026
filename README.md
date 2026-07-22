# Asiri Signal Lab — Decision Cockpit

مختبر مستقل لتجربة قرارات الأسهم الأمريكية قبل نقل أي ميزة إلى منصة Asiri Capital الأساسية.

> النسخة الحالية **MVP 0.1** تستخدم بيانات محاكاة فقط. لا تعرض أسعارًا حية، ولا تنفذ أوامر، ولا تمثل توصية استثمارية.

## المعاينة المباشرة

[افتح Asiri Signal Lab — Decision Cockpit](https://raw.githack.com/vip7733661/ASIRI-2026/main/index.html)

هذا الرابط يعرض HTML وCSS وJavaScript بصيغ المحتوى الصحيحة بدل إظهار ملف HTML كنص خام.

## ما الذي يعمل الآن؟

- واجهة عربية RTL احترافية ومتجاوبة.
- نبض تجريبي لحالة السوق.
- رادار لثلاث فرص محاكاة.
- Asiri Signal Score موزون من سبعة عوامل.
- قرارات: Golden Alert، دخول تجريبي، انتظار، مراقبة، تجنب.
- بوابة Golden Alert مع شروط قابلة للتدقيق.
- Market Replay برسوم شموع Canvas دون مكتبات خارجية.
- صندوق أدلة يشرح سبب القرار.
- محرك حجم صفقة حسب رأس المال ووقف الخسارة ونسبة المخاطرة.
- Paper Trading Journal داخل الجلسة.
- اختبارات آلية لمحرك التقييم والمخاطر.

## DefeatBeta Market Data Reliability Lab

أضيف مختبر Python مستقل لفحص بيانات `defeatbeta-api` وقياس جودتها قبل استخدامها في أي تجربة تحليلية.

- يجلب بيانات OHLCV التاريخية دون API key.
- يوحد الأعمدة والتواريخ ويزيل التكرارات.
- يكشف الفجوات والقيم الفارغة وصفوف OHLC غير المنطقية.
- ينتج Data Quality Score من 100.
- يقارن اختياريًا النتائج مع `yfinance`.
- يصدر CSV وJSON وتقرير HTML عربي RTL.

[تعليمات تشغيل DefeatBeta Lab](defeatbeta_lab/README.md)

## التشغيل

لا توجد تبعيات خارجية للواجهة.

```bash
npm start
```

ثم افتح:

```text
http://localhost:4173
```

يمكن أيضًا فتح `index.html` عبر أي خادم ملفات محلي.

## الفحص والاختبارات

```bash
npm run check
```

لاختبارات DefeatBeta Lab:

```bash
pip install -r defeatbeta_lab/requirements-test.txt
python -m pytest tests/test_defeatbeta_core.py -q
```

## هيكل المشروع

```text
ASIRI-2026/
├── index.html
├── styles.css
├── package.json
├── defeatbeta_lab/
│   ├── cli.py
│   ├── core.py
│   ├── providers.py
│   ├── report.py
│   └── README.md
├── src/
│   ├── app.js
│   ├── demo-data.js
│   └── scoring-engine.js
└── tests/
    ├── scoring-engine.test.mjs
    └── test_defeatbeta_core.py
```

## منطق Asiri Signal Score

| العامل | الوزن |
|---|---:|
| الاتجاه الفني | 20% |
| حجم التداول | 20% |
| الزخم | 15% |
| المحفز | 15% |
| السيولة | 10% |
| إدارة المخاطر | 10% |
| ملاءمة الاستراتيجية | 10% |

تطبق عقوبات على المطاردة السعرية، السبريد المرتفع، والمخاطر الخبرية. كما تمنع البوابة الشرعية غير المكتملة تفعيل Golden Alert.

## الاستقلال عن Asiri Capital

- مستودع مستقل.
- لا يستخدم Supabase الخاص بالمنصة السابقة.
- لا يستخدم مفاتيح Saxo أو بيانات وسيط.
- لا ينفذ تداولًا حقيقيًا.
- لا ينسخ ملفات من `asiri-bot`.

## المرحلة التالية المقترحة

1. تشغيل DefeatBeta Lab على عينة أسهم متنوعة وقياس اكتمال البيانات.
2. إضافة رزنامة تداول أمريكية دقيقة بدل أيام العمل العامة.
3. تخزين Paper Trades محليًا ثم في قاعدة مستقلة.
4. إضافة RSI وEMA وVWAP وATR من بيانات OHLCV.
5. بناء Backtesting Report لقياس Win Rate وProfit Factor وMax Drawdown.
