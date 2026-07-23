(() => {
  'use strict';

  const KEYS = {
    orders: 'asiri-execution-desk-sim-orders-v1',
    risk: 'asiri-execution-desk-risk-v1',
    audit: 'asiri-execution-desk-audit-v1'
  };
  const MAX_MARKET_AGE_HOURS = 36;
  const $ = (id) => document.getElementById(id);
  const state = { market: null, orders: [], audit: [], risk: {}, pendingDraft: null };
  const finite = (value) => Number.isFinite(Number(value));
  const num = (value, digits = 2) => finite(value) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(Number(value)) : '—';
  const money = (value) => finite(value) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value)) : '—';
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const nowIso = () => new Date().toISOString();
  const requestId = () => globalThis.crypto?.randomUUID?.() || `sim-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function loadJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function save() {
    localStorage.setItem(KEYS.orders, JSON.stringify(state.orders));
    localStorage.setItem(KEYS.risk, JSON.stringify(state.risk));
    localStorage.setItem(KEYS.audit, JSON.stringify(state.audit.slice(0, 100)));
  }

  function addAudit(action, details) {
    state.audit.unshift({ id: requestId(), at: nowIso(), action, details });
    state.audit = state.audit.slice(0, 100);
    save();
    renderAudit();
  }

  function getRisk() {
    return {
      portfolioValue: Number($('portfolioValue').value),
      maxRiskPercent: Number($('maxRiskPercent').value),
      maxOrderValue: Number($('maxOrderValue').value),
      dailyLossLimit: Number($('dailyLossLimit').value),
      killSwitch: $('killSwitch').checked
    };
  }

  function applyRisk(risk) {
    $('portfolioValue').value = risk.portfolioValue ?? 5000;
    $('maxRiskPercent').value = risk.maxRiskPercent ?? 1;
    $('maxOrderValue').value = risk.maxOrderValue ?? 1500;
    $('dailyLossLimit').value = risk.dailyLossLimit ?? 3;
    $('killSwitch').checked = Boolean(risk.killSwitch);
  }

  function snapshot() {
    return state.market?.symbols?.[$('symbol').value] || null;
  }

  function marketAgeHours() {
    const generated = Date.parse(state.market?.generatedAt || '');
    return Number.isFinite(generated) ? (Date.now() - generated) / 3_600_000 : Infinity;
  }

  function latestPrice() {
    return Number(snapshot()?.latestClose);
  }

  function readDraft() {
    const side = $('side').value;
    const amount = Number($('amount').value);
    const limitPrice = Number($('limitPrice').value);
    const stopPrice = Number($('stopPrice').value);
    const targetOne = Number($('targetOne').value);
    const targetTwo = Number($('targetTwo').value);
    const notional = amount * limitPrice;
    const riskPerShare = side === 'Buy' ? limitPrice - stopPrice : stopPrice - limitPrice;
    const maxLoss = amount * riskPerShare;
    const rewardOne = side === 'Buy' ? targetOne - limitPrice : limitPrice - targetOne;
    const rewardTwo = side === 'Buy' ? targetTwo - limitPrice : limitPrice - targetTwo;
    const risk = getRisk();
    return {
      symbol: $('symbol').value,
      side,
      orderType: $('orderType').value,
      duration: $('duration').value,
      amount,
      limitPrice,
      stopPrice,
      targetOne,
      targetTwo,
      thesis: $('thesis').value.trim(),
      notional,
      maxLoss,
      riskPercent: risk.portfolioValue > 0 ? maxLoss / risk.portfolioValue * 100 : NaN,
      rrOne: riskPerShare > 0 ? rewardOne / riskPerShare : NaN,
      rrTwo: riskPerShare > 0 ? rewardTwo / riskPerShare : NaN,
      marketPrice: latestPrice(),
      marketDate: snapshot()?.latestDate || null,
      quality: Number(snapshot()?.quality?.score),
      generatedAt: state.market?.generatedAt || null,
      environment: 'SIM',
      broker: 'Saxo OpenAPI',
      assetType: 'Stock',
      uic: null
    };
  }

  function duplicateOrder(draft) {
    return state.orders.some((order) =>
      ['SIM_QUEUED', 'SIM_FILLED'].includes(order.status)
      && order.symbol === draft.symbol
      && order.side === draft.side
      && order.amount === draft.amount
      && Math.abs(order.limitPrice - draft.limitPrice) < 0.00001
    );
  }

  function validateDraft(draft) {
    const errors = [];
    const warnings = [];
    const risk = getRisk();
    const age = marketAgeHours();

    if (!draft.symbol || !snapshot()) errors.push('السهم غير متوفر في Snapshot السوق.');
    if (!finite(draft.amount) || draft.amount <= 0 || !Number.isInteger(draft.amount)) errors.push('الكمية يجب أن تكون عددًا صحيحًا موجبًا.');
    for (const [label, value] of [['سعر Limit', draft.limitPrice], ['وقف الخسارة', draft.stopPrice], ['الهدف الأول', draft.targetOne], ['الهدف الثاني', draft.targetTwo]]) {
      if (!finite(value) || value <= 0) errors.push(`${label} غير صالح.`);
    }
    if (draft.side === 'Buy') {
      if (!(draft.stopPrice < draft.limitPrice)) errors.push('في أمر الشراء يجب أن يكون الوقف أدنى من سعر الدخول.');
      if (!(draft.targetOne > draft.limitPrice && draft.targetTwo > draft.targetOne)) errors.push('أهداف الشراء يجب أن تكون أعلى من الدخول وبترتيب تصاعدي.');
    } else {
      if (!(draft.stopPrice > draft.limitPrice)) errors.push('في أمر البيع يجب أن يكون الوقف أعلى من سعر الدخول.');
      if (!(draft.targetOne < draft.limitPrice && draft.targetTwo < draft.targetOne)) errors.push('أهداف البيع يجب أن تكون أدنى من الدخول وبترتيب تنازلي.');
    }
    if (!draft.thesis) errors.push('سبب التوصية إلزامي لسجل التدقيق.');
    if (!finite(draft.quality) || draft.quality < 90) errors.push('جودة بيانات السوق أقل من 90/100.');
    if (age > MAX_MARKET_AGE_HOURS) errors.push(`بيانات السوق أقدم من ${MAX_MARKET_AGE_HOURS} ساعة؛ إنشاء الأوامر متوقف.`);
    if (!finite(risk.portfolioValue) || risk.portfolioValue <= 0) errors.push('قيمة المحفظة التجريبية غير صالحة.');
    if (draft.notional > risk.maxOrderValue) errors.push(`قيمة الأمر تتجاوز الحد الأعلى ${money(risk.maxOrderValue)}.`);
    if (draft.riskPercent > risk.maxRiskPercent) errors.push(`مخاطرة الصفقة ${num(draft.riskPercent)}% تتجاوز الحد ${num(risk.maxRiskPercent)}%.`);
    if (!finite(draft.rrOne) || draft.rrOne < 1.5) errors.push('نسبة العائد/المخاطرة للهدف الأول أقل من 1.5.');
    if (risk.killSwitch) errors.push('Kill Switch مفعل؛ جميع الأوامر الجديدة متوقفة.');
    if (duplicateOrder(draft)) errors.push('أمر مماثل موجود بالفعل؛ تم منع التكرار.');

    if (finite(draft.marketPrice) && draft.marketPrice > 0) {
      const deviation = Math.abs(draft.limitPrice - draft.marketPrice) / draft.marketPrice * 100;
      if (deviation > 10) errors.push('سعر Limit يبتعد أكثر من 10% عن آخر سعر منشور.');
      else if (deviation > 5) warnings.push(`سعر Limit يبتعد ${num(deviation)}% عن آخر سعر منشور.`);
    }
    if (draft.rrTwo < 2) warnings.push('العائد/المخاطرة للهدف الثاني أقل من 2.0.');
    if (draft.orderType !== 'Limit') errors.push('النسخة الأولى تسمح بأوامر Limit فقط.');

    return { valid: errors.length === 0, errors, warnings };
  }

  function renderTicketMetrics() {
    const draft = readDraft();
    $('notional').textContent = money(draft.notional);
    $('maxLoss').textContent = money(draft.maxLoss);
    $('riskPercent').textContent = finite(draft.riskPercent) ? `${num(draft.riskPercent)}%` : '—';
    $('rrOne').textContent = finite(draft.rrOne) ? `${num(draft.rrOne)}R` : '—';
    $('rrTwo').textContent = finite(draft.rrTwo) ? `${num(draft.rrTwo)}R` : '—';

    const result = validateDraft(draft);
    const box = $('validationBox');
    if (result.valid) {
      box.dataset.tone = result.warnings.length ? 'warn' : 'good';
      box.innerHTML = result.warnings.length
        ? `<strong>الأمر اجتاز الضوابط مع تنبيه:</strong> ${escapeHtml(result.warnings.join(' · '))}`
        : '<strong>الأمر اجتاز ضوابط المخاطر.</strong> جاهز للمراجعة والتأكيد اليدوي.';
    } else {
      box.dataset.tone = 'bad';
      box.innerHTML = `<strong>الأمر غير جاهز:</strong><br>${result.errors.map(escapeHtml).join('<br>')}`;
    }
    return result;
  }

  function updateQuote() {
    const data = snapshot();
    $('lastPrice').textContent = money(data?.latestClose);
    $('rsi').textContent = finite(data?.rsi14) ? num(data.rsi14, 1) : '—';
    $('quality').textContent = finite(data?.quality?.score) ? `${num(data.quality.score, 0)}/100` : '—';
    $('marketDate').textContent = data?.latestDate || '—';
    if (data && !$('limitPrice').value) {
      $('limitPrice').value = Number(data.latestClose).toFixed(2);
    }
    renderTicketMetrics();
  }

  function prefillRiskPrices() {
    const price = latestPrice();
    if (!finite(price) || price <= 0) return;
    const side = $('side').value;
    $('limitPrice').value = Number(price).toFixed(2);
    if (side === 'Buy') {
      $('stopPrice').value = (price * 0.94).toFixed(2);
      $('targetOne').value = (price * 1.10).toFixed(2);
      $('targetTwo').value = (price * 1.18).toFixed(2);
    } else {
      $('stopPrice').value = (price * 1.06).toFixed(2);
      $('targetOne').value = (price * 0.90).toFixed(2);
      $('targetTwo').value = (price * 0.82).toFixed(2);
    }
    renderTicketMetrics();
  }

  function renderOrders() {
    $('orderCount').textContent = String(state.orders.length);
    $('filledCount').textContent = `${state.orders.filter((order) => order.status === 'SIM_FILLED').length} منفذ`;
    const container = $('orders');
    if (!state.orders.length) {
      container.innerHTML = '<div class="empty">لا توجد أوامر مؤكدة بعد.</div>';
      return;
    }
    container.innerHTML = state.orders.map((order) => {
      const statusClass = order.status === 'SIM_FILLED' ? 'filled' : order.status === 'SIM_CANCELLED' ? 'cancelled' : 'queued';
      const statusLabel = order.status === 'SIM_FILLED' ? 'SIM FILLED' : order.status === 'SIM_CANCELLED' ? 'ملغي' : 'SIM QUEUED';
      return `<article class="order-card">
        <div class="order-card-head"><div><h3>${escapeHtml(order.symbol)} · ${order.side === 'Buy' ? 'شراء' : 'بيع'}</h3><small>${escapeHtml(order.requestId)}</small></div><span class="order-status ${statusClass}">${statusLabel}</span></div>
        <div class="order-grid">
          <div><span>الكمية</span><strong>${num(order.amount, 0)}</strong></div><div><span>Limit</span><strong>${money(order.limitPrice)}</strong></div>
          <div><span>الوقف</span><strong>${money(order.stopPrice)}</strong></div><div><span>الهدف 1 / 2</span><strong>${money(order.targetOne)} / ${money(order.targetTwo)}</strong></div>
          <div><span>قيمة الأمر</span><strong>${money(order.notional)}</strong></div><div><span>الخسارة القصوى</span><strong>${money(order.maxLoss)}</strong></div>
          <div><span>المخاطرة</span><strong>${num(order.riskPercent)}%</strong></div><div><span>البيئة</span><strong>LOCAL SIM</strong></div>
        </div>
        <p class="muted">${escapeHtml(order.thesis)}</p>
        <div class="order-actions">
          ${order.status === 'SIM_QUEUED' ? `<button class="button secondary" data-fill="${escapeHtml(order.id)}">محاكاة قبول Saxo SIM</button><button class="button danger-ghost" data-cancel="${escapeHtml(order.id)}">إلغاء</button>` : ''}
        </div>
      </article>`;
    }).join('');

    container.querySelectorAll('[data-fill]').forEach((button) => button.addEventListener('click', () => updateOrderStatus(button.dataset.fill, 'SIM_FILLED')));
    container.querySelectorAll('[data-cancel]').forEach((button) => button.addEventListener('click', () => updateOrderStatus(button.dataset.cancel, 'SIM_CANCELLED')));
  }

  function updateOrderStatus(id, status) {
    const order = state.orders.find((item) => item.id === id);
    if (!order || order.status !== 'SIM_QUEUED') return;
    order.status = status;
    order.updatedAt = nowIso();
    addAudit(status === 'SIM_FILLED' ? 'SIM_FILL' : 'SIM_CANCEL', `${order.symbol} · ${order.side} · ${order.amount} @ ${order.limitPrice}`);
    save();
    renderOrders();
  }

  function renderAudit() {
    const container = $('auditLog');
    if (!state.audit.length) {
      container.innerHTML = '<div class="empty">لا توجد أحداث.</div>';
      return;
    }
    container.innerHTML = state.audit.slice(0, 12).map((item) => `<div class="audit-item"><strong>${escapeHtml(item.action)}</strong>${escapeHtml(item.details)}<br><time>${new Date(item.at).toLocaleString('ar-SA')}</time></div>`).join('');
  }

  function showConfirmation(draft) {
    state.pendingDraft = draft;
    $('confirmPhrase').value = '';
    $('confirmSummary').innerHTML = [
      ['البيئة', 'Saxo SIM — Local rehearsal'],
      ['السهم', draft.symbol],
      ['العملية', draft.side === 'Buy' ? 'شراء' : 'بيع'],
      ['الكمية', num(draft.amount, 0)],
      ['Limit', money(draft.limitPrice)],
      ['الوقف', money(draft.stopPrice)],
      ['الخسارة القصوى', `${money(draft.maxLoss)} · ${num(draft.riskPercent)}%`],
      ['الحالة', 'لن يُرسل إلى وسيط']
    ].map(([label, value]) => `<div class="confirm-row"><span>${label}</span><strong>${value}</strong></div>`).join('');
    $('confirmDialog').showModal();
    $('confirmPhrase').focus();
  }

  function confirmOrder() {
    if ($('confirmPhrase').value.trim() !== 'تأكيد') {
      $('confirmPhrase').setCustomValidity('اكتب كلمة تأكيد تمامًا.');
      $('confirmPhrase').reportValidity();
      return;
    }
    $('confirmPhrase').setCustomValidity('');
    const draft = state.pendingDraft;
    if (!draft) return;
    const validation = validateDraft(draft);
    if (!validation.valid) {
      $('confirmDialog').close();
      renderTicketMetrics();
      return;
    }
    const order = {
      ...draft,
      id: requestId(),
      requestId: requestId(),
      status: 'SIM_QUEUED',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      executionMode: 'CONFIRMED_LOCAL_SIM',
      liveSubmissionAllowed: false
    };
    state.orders.unshift(order);
    state.pendingDraft = null;
    save();
    addAudit('ORDER_CONFIRMED', `${order.symbol} · ${order.side} · ${order.amount} @ ${order.limitPrice}`);
    renderOrders();
    $('confirmDialog').close();
  }

  function clearTicket() {
    $('orderForm').reset();
    $('side').value = 'Buy';
    $('orderType').value = 'Limit';
    $('duration').value = 'DayOrder';
    updateQuote();
    prefillRiskPrices();
  }

  function updateSummary() {
    const age = marketAgeHours();
    $('marketAge').textContent = Number.isFinite(age) ? `العمر: ${num(age, 1)} ساعة` : 'غير متاح';
    $('marketStatus').textContent = age <= MAX_MARKET_AGE_HOURS ? 'حديثة' : 'قديمة';
    $('marketStatus').style.color = age <= MAX_MARKET_AGE_HOURS ? 'var(--green)' : 'var(--danger)';
    const risk = getRisk();
    $('dailyLossLimitLabel').textContent = `الحد: ${money(risk.portfolioValue * risk.dailyLossLimit / 100)}`;
    $('dailyLoss').textContent = '$0.00';
  }

  async function loadMarket() {
    try {
      const response = await fetch(`../market-data.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const market = await response.json();
      if (!market?.generatedAt || !market?.symbols) throw new Error('market-data schema invalid');
      state.market = market;
      const symbols = Object.keys(market.symbols).sort();
      $('symbol').innerHTML = symbols.map((symbol) => `<option value="${escapeHtml(symbol)}">${escapeHtml(symbol)}</option>`).join('');
      const params = new URLSearchParams(location.search);
      if (params.get('symbol') && symbols.includes(params.get('symbol').toUpperCase())) $('symbol').value = params.get('symbol').toUpperCase();
      updateQuote();
      prefillRiskPrices();
      updateSummary();
      addAudit('MARKET_DATA_LOADED', `${symbols.length} symbols · ${market.generatedAt}`);
    } catch (error) {
      $('marketStatus').textContent = 'فشل التحميل';
      $('marketAge').textContent = error.message;
      $('validationBox').dataset.tone = 'bad';
      $('validationBox').textContent = 'تعذر تحميل بيانات السوق؛ إنشاء الأوامر متوقف.';
      addAudit('MARKET_DATA_ERROR', error.message);
    }
  }

  function init() {
    state.orders = loadJson(KEYS.orders, []);
    state.audit = loadJson(KEYS.audit, []);
    state.risk = loadJson(KEYS.risk, { portfolioValue: 5000, maxRiskPercent: 1, maxOrderValue: 1500, dailyLossLimit: 3, killSwitch: false });
    if (!Array.isArray(state.orders)) state.orders = [];
    if (!Array.isArray(state.audit)) state.audit = [];
    applyRisk(state.risk);
    renderOrders();
    renderAudit();
    updateSummary();

    $('orderForm').addEventListener('input', renderTicketMetrics);
    $('orderForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const draft = readDraft();
      const result = validateDraft(draft);
      renderTicketMetrics();
      if (result.valid) showConfirmation(draft);
    });
    $('symbol').addEventListener('change', () => { updateQuote(); prefillRiskPrices(); });
    $('side').addEventListener('change', prefillRiskPrices);
    $('clearTicket').addEventListener('click', clearTicket);
    $('confirmForm').addEventListener('submit', (event) => event.preventDefault());
    $('confirmSubmit').addEventListener('click', (event) => { event.preventDefault(); confirmOrder(); });
    $('saveRisk').addEventListener('click', () => {
      state.risk = getRisk();
      save();
      updateSummary();
      renderTicketMetrics();
      addAudit('RISK_CONTROLS_UPDATED', `risk ${state.risk.maxRiskPercent}% · max order ${state.risk.maxOrderValue} · kill ${state.risk.killSwitch}`);
    });
    $('killSwitch').addEventListener('change', renderTicketMetrics);
    $('clearOrders').addEventListener('click', () => {
      if (!confirm('مسح جميع الأوامر والسجل التجريبي المحلي؟')) return;
      state.orders = [];
      state.audit = [];
      save();
      renderOrders();
      renderAudit();
    });
    $('readinessCheck').addEventListener('click', () => {
      const checks = [window.isSecureContext, Boolean(globalThis.crypto), Boolean(localStorage), Boolean(state.market)];
      const passed = checks.filter(Boolean).length;
      $('readinessResult').textContent = `${passed}/4 من متطلبات واجهة SIM المحلية جاهزة. الربط الفعلي ما زال يحتاج Backend + OAuth + Saxo AppKey.`;
      addAudit('READINESS_CHECK', `${passed}/4 local checks passed`);
    });

    setInterval(() => { $('clock').textContent = new Date().toLocaleString('ar-SA'); }, 1000);
    $('clock').textContent = new Date().toLocaleString('ar-SA');
    loadMarket();
  }

  init();
})();
