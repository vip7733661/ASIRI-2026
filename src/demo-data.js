const candles = (base, direction = 1) => Array.from({ length: 34 }, (_, index) => {
  const wave = Math.sin(index / 2.5) * 0.12;
  const drift = direction * index * 0.018;
  const open = base + drift + wave;
  const close = open + Math.sin(index * 1.7) * 0.07 + direction * 0.025;
  const high = Math.max(open, close) + 0.08 + (index % 3) * 0.012;
  const low = Math.min(open, close) - 0.07 - (index % 4) * 0.01;
  return {
    time: `10:${String(index * 2).padStart(2, '0')}`,
    open: Number(open.toFixed(2)),
    high: Number(high.toFixed(2)),
    low: Number(low.toFixed(2)),
    close: Number(close.toFixed(2)),
    volume: Math.round(120000 + index * 13000 + Math.abs(Math.sin(index)) * 180000),
  };
});

export const marketPulse = {
  regime: 'زخم انتقائي',
  breadth: 61,
  volatility: 47,
  smallCaps: 68,
  liquidity: 72,
  note: 'بيانات محاكاة لتجربة واجهة القرار — ليست أسعارًا أو توصيات حقيقية.',
};

export const demoSignals = [
  {
    symbol: 'ASR-A',
    company: 'Aurora Systems Lab',
    price: 4.82,
    changePercent: 8.4,
    entry: 4.76,
    stop: 4.43,
    target1: 5.38,
    target2: 5.92,
    resistance: 4.72,
    relativeVolume: 3.4,
    riskReward: 2.6,
    spreadPercent: 0.42,
    chaseRisk: 24,
    breakoutConfirmed: true,
    catalystRisk: 'low',
    shariaStatus: 'approved',
    setup: 'اختراق قاعدة سعرية مع توسع واضح في الحجم وثبات أعلى VWAP.',
    factors: { technical: 94, volume: 96, momentum: 91, catalyst: 86, liquidity: 83, risk: 78, strategy: 95 },
    evidence: [
      ['اختراق المقاومة', 'مؤكد أعلى 4.72'],
      ['الحجم النسبي', '3.4x — قوي'],
      ['VWAP', 'السعر أعلى المتوسط'],
      ['السبريد', '0.42% — مقبول'],
      ['المحفز', 'إيجابي منخفض المخاطر'],
    ],
    candles: candles(4.18, 1),
  },
  {
    symbol: 'ASR-B',
    company: 'Beacon Mobility Lab',
    price: 7.16,
    changePercent: 3.1,
    entry: 7.24,
    stop: 6.91,
    target1: 7.88,
    target2: 8.34,
    resistance: 7.22,
    relativeVolume: 2.1,
    riskReward: 2.2,
    spreadPercent: 0.66,
    chaseRisk: 18,
    breakoutConfirmed: false,
    catalystRisk: 'low',
    shariaStatus: 'approved',
    setup: 'ضغط سعري أسفل مقاومة واضحة؛ يحتاج إغلاقًا وحجمًا إضافيًا.',
    factors: { technical: 82, volume: 74, momentum: 80, catalyst: 78, liquidity: 88, risk: 84, strategy: 86 },
    evidence: [
      ['اختراق المقاومة', 'غير مؤكد'],
      ['الحجم النسبي', '2.1x — يحتاج توسعًا'],
      ['VWAP', 'إيجابي'],
      ['السبريد', '0.66% — مقبول'],
      ['المحفز', 'مستقر'],
    ],
    candles: candles(6.71, 0.65),
  },
  {
    symbol: 'ASR-C',
    company: 'Cobalt Health Lab',
    price: 2.34,
    changePercent: 14.8,
    entry: 2.18,
    stop: 2.02,
    target1: 2.58,
    target2: 2.82,
    resistance: 2.21,
    relativeVolume: 4.7,
    riskReward: 1.5,
    spreadPercent: 2.05,
    chaseRisk: 82,
    breakoutConfirmed: true,
    catalystRisk: 'high',
    shariaStatus: 'pending',
    setup: 'حركة قوية لكنها ممتدة، بسبريد مرتفع ومخاطر خبرية غير محسومة.',
    factors: { technical: 86, volume: 98, momentum: 92, catalyst: 45, liquidity: 48, risk: 34, strategy: 52 },
    evidence: [
      ['الامتداد السعري', 'مرتفع جدًا'],
      ['الحجم النسبي', '4.7x — استثنائي'],
      ['السبريد', '2.05% — خطر'],
      ['العائد/المخاطرة', '1.5 — غير كافٍ'],
      ['البوابة الشرعية', 'بانتظار التحقق'],
    ],
    candles: candles(1.94, 1.25),
  },
];
