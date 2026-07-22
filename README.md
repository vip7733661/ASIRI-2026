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

## API Atlas — Finance Edition

تطبيق PWA مستقل مبني فوق عينة من قسم التمويل في `public-apis/public-apis`:

- 16 خدمة مالية منظمة.
- بحث وفلاتر وترتيب.
- مفضلة محفوظة على الجهاز.
- تنزيل الدليل بصيغة JSON.
- تثبيت على الشاشة الرئيسية.
- عمل دون اتصال بعد أول زيارة.
- تنبيه واضح بأن الإدراج لا يعني التحقق التشغيلي.

[فتح API Atlas الرسمي](https://vip7733661.github.io/ASIRI-2026/)

[تعليمات API Atlas](api-intelligence/README.md)

## التشغيل

لا توجد تبعيات خارجية للواجهة.

```bash
npm start
```

ثم افتح:

```text
http://localhost:4173
```

لتشغيل API Atlas منفردًا:

```bash
python3 -m http.server 4174 --directory api-intelligence
```

يمكن أيضًا فتح `index.html` عبر أي خادم ملفات محلي.

## الفحص والاختبارات

```bash
npm run check
node --test tests/api-intelligence.test.mjs
```

## هيكل المشروع

```text
ASIRI-2026/
├── index.html
├── styles.css
├── package.json
├── api-intelligence/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── catalog.js
│   ├── manifest.webmanifest
│   └── sw.js
├── src/
│   ├── app.js
│   ├── demo-data.js
│   └── scoring-engine.js
└── tests/
    ├── api-intelligence.test.mjs
    └── scoring-engine.test.mjs
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

1. إضافة مدقق حي مستقل لخدمات API Atlas.
2. إضافة Market Data Adapter حقيقي مع تأخير واضح ومصدر موثق.
3. تخزين Paper Trades محليًا ثم في قاعدة مستقلة.
4. إضافة RSI وEMA وVWAP وATR من بيانات OHLCV.
5. بناء Backtesting Report لقياس Win Rate وProfit Factor وMax Drawdown.
