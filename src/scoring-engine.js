export const WEIGHTS = Object.freeze({
  technical: 0.20,
  volume: 0.20,
  momentum: 0.15,
  catalyst: 0.15,
  liquidity: 0.10,
  risk: 0.10,
  strategy: 0.10,
});

export const RISK_PROFILES = Object.freeze({
  conservative: { label: 'محافظ', scoreFloor: 82, maxPositionRisk: 0.5, chaseLimit: 25 },
  balanced: { label: 'متوازن', scoreFloor: 75, maxPositionRisk: 0.75, chaseLimit: 40 },
  aggressive: { label: 'مضاربي', scoreFloor: 68, maxPositionRisk: 1.0, chaseLimit: 55 },
});

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));

export function calculateSignalScore(signal) {
  const factors = signal.factors ?? {};
  const weighted = Object.entries(WEIGHTS).reduce((total, [key, weight]) => {
    return total + clamp(factors[key]) * weight;
  }, 0);

  let penalty = 0;
  const flags = [];

  if ((signal.chaseRisk ?? 0) > 70) {
    penalty += 8;
    flags.push('مطاردة سعرية مرتفعة');
  }

  if ((signal.spreadPercent ?? 0) > 1.5) {
    penalty += 5;
    flags.push('سبريد مرتفع');
  }

  if (signal.catalystRisk === 'high') {
    penalty += 7;
    flags.push('مخاطر خبرية مرتفعة');
  }

  if (signal.shariaStatus === 'rejected') {
    penalty += 100;
    flags.push('غير مجتاز للبوابة الشرعية');
  }

  const rawScore = Math.round(weighted - penalty);
  const score = signal.shariaStatus === 'pending' ? Math.min(rawScore, 89) : rawScore;

  return {
    score: clamp(score),
    penalty,
    flags,
  };
}

export function evaluateGoldenAlert(signal, scoreResult) {
  const checks = [
    { key: 'score', label: 'النتيجة 90 أو أكثر', passed: scoreResult.score >= 90 },
    { key: 'breakout', label: 'اختراق مؤكد', passed: Boolean(signal.breakoutConfirmed) },
    { key: 'volume', label: 'Relative Volume ≥ 2.5', passed: (signal.relativeVolume ?? 0) >= 2.5 },
    { key: 'rr', label: 'العائد للمخاطرة ≥ 2.0', passed: (signal.riskReward ?? 0) >= 2 },
    { key: 'news', label: 'لا توجد مخاطرة خبرية مرتفعة', passed: signal.catalystRisk !== 'high' },
    { key: 'chase', label: 'لا توجد مطاردة سعرية', passed: (signal.chaseRisk ?? 100) <= 40 },
    { key: 'sharia', label: 'البوابة الشرعية مكتملة', passed: signal.shariaStatus === 'approved' },
  ];

  return {
    active: checks.every((check) => check.passed),
    checks,
    missing: checks.filter((check) => !check.passed).map((check) => check.label),
  };
}

export function deriveDecision(signal, profileName = 'balanced') {
  const profile = RISK_PROFILES[profileName] ?? RISK_PROFILES.balanced;
  const scoreResult = calculateSignalScore(signal);
  const golden = evaluateGoldenAlert(signal, scoreResult);

  if (signal.shariaStatus === 'rejected') {
    return { ...scoreResult, golden, code: 'avoid', label: 'تجنب', tone: 'danger', reason: 'لم يجتز بوابة التحقق الشرعي.' };
  }

  if (golden.active) {
    return { ...scoreResult, golden, code: 'golden', label: 'Golden Alert', tone: 'gold', reason: 'اكتملت شروط الإشارة التجريبية عالية الجودة.' };
  }

  if (scoreResult.score >= profile.scoreFloor && signal.breakoutConfirmed) {
    return { ...scoreResult, golden, code: 'entry', label: 'دخول تجريبي منضبط', tone: 'success', reason: 'الإشارة تجاوزت حد الملف المختار مع اختراق مؤكد.' };
  }

  if (scoreResult.score >= profile.scoreFloor - 8) {
    return { ...scoreResult, golden, code: 'wait', label: 'انتظار التأكيد', tone: 'warning', reason: golden.missing[0] ?? 'تحتاج الإشارة تأكيدًا إضافيًا.' };
  }

  if (scoreResult.score >= 55) {
    return { ...scoreResult, golden, code: 'watch', label: 'مراقبة فقط', tone: 'neutral', reason: 'الجودة الحالية لا تبرر المخاطرة.' };
  }

  return { ...scoreResult, golden, code: 'avoid', label: 'تجنب حاليًا', tone: 'danger', reason: 'الزخم أو السيولة أو جودة الإعداد غير كافية.' };
}

export function calculatePositionSize({ capital, entry, stop, riskPercent }) {
  const safeCapital = Math.max(0, Number(capital) || 0);
  const safeEntry = Math.max(0, Number(entry) || 0);
  const safeStop = Math.max(0, Number(stop) || 0);
  const riskPerShare = Math.max(0, safeEntry - safeStop);
  const riskBudget = safeCapital * (Math.max(0, Number(riskPercent) || 0) / 100);

  if (!safeEntry || !riskPerShare || !riskBudget) {
    return { quantity: 0, positionValue: 0, riskBudget, riskPerShare };
  }

  const quantity = Math.floor(riskBudget / riskPerShare);
  return {
    quantity,
    positionValue: Number((quantity * safeEntry).toFixed(2)),
    riskBudget: Number(riskBudget.toFixed(2)),
    riskPerShare: Number(riskPerShare.toFixed(2)),
  };
}
