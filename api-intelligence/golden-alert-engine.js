(() => {
  'use strict';

  const PORTFOLIO_KEY = 'asiri-intelligence-os-v1-portfolio';
  const SEEN_KEY = 'asiri-golden-alert-seen-v1';
  const $ = (id) => document.getElementById(id);
  const state = { payload: null, loading: false };
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
  const money = (value) => finite(value)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(value)
    : '—';
  const number = (value, digits = 2) => finite(value)
    ? new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value)
    : '—';

  function readPositions() {
    try {
      const positions = JSON.parse(localStorage.getItem(PORTFOLIO_KEY) || '[]');
      return Array.isArray(positions) ? positions : [];
    } catch (_) {
      return [];
    }
  }

  function readSeen() {
    try {
      const values = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
      return new Set(Array.isArray(values) ? values : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveSeen(seen) {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen).slice(-100)));
  }

  function relevantAlerts() {
    const held = new Set(readPositions().map((position) => position.symbol));
    const alerts = Array.isArray(state.payload?.alerts) ? state.payload.alerts : [];
    const actionable = alerts.filter((alert) => {
      if (alert.signal === 'risk_exit') return held.has(alert.symbol);
      return alert.signal === 'golden_buy';
    });
    const watch = alerts
      .filter((alert) => alert.signal === 'watch' && !held.has(alert.symbol))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    return { actionable, watch, held };
  }

  function gate(label, value) {
    return `<span class="golden-gate ${value ? 'pass' : 'fail'}">${value ? '✓' : '×'} ${escapeHtml(label)}</span>`;
  }

  function scenarioHtml(alert) {
    const scenario = alert.scenario;
    if (!scenario) return '';
    return `<div class="golden-scenario">
      <div><span>منطقة الدخول</span><strong>${money(scenario.entryLow)} – ${money(scenario.entryHigh)}</strong></div>
      <div><span>وقف السيناريو</span><strong>${money(scenario.stop)}</strong></div>
      <div><span>الهدف الأول</span><strong>${money(scenario.target1)}</strong></div>
      <div><span>الهدف الثاني</span><strong>${money(scenario.target2)}</strong></div>
      <p>${escapeHtml(scenario.invalidation)}</p>
    </div>`;
  }

  function alertCard(alert, isWatch = false) {
    const tone = alert.signal === 'golden_buy' ? 'buy' : alert.signal === 'risk_exit' ? 'sell' : 'watch';
    const gates = alert.gates || {};
    return `<article class="golden-alert-card ${tone}">
      <div class="golden-alert-top">
        <div>
          <span class="golden-signal">${escapeHtml(alert.label)}</span>
          <h3>${escapeHtml(alert.symbol)}</h3>
          <p>${money(alert.price)} · جلسة ${escapeHtml(alert.latestDate || '—')}</p>
        </div>
        <div class="golden-score"><strong>${number(alert.score, 0)}</strong><span>/100</span></div>
      </div>
      <div class="golden-gates">
        ${gate('البيانات', gates.data)}${gate('السوق', gates.market)}${gate('الاتجاه', gates.trend)}${gate('الزخم', gates.momentum)}${gate('السيولة', gates.liquidity)}${gate('الاختراق', gates.breakout)}
      </div>
      ${scenarioHtml(alert)}
      <ul class="golden-reasons">${(alert.reasons || []).slice(0, 5).map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>
      <div class="golden-card-footer">
        <span>جودة البيانات: ${number(alert.dataQuality, 1)}/100</span>
        <button class="secondary-button golden-open-symbol" data-symbol="${escapeHtml(alert.symbol)}" type="button">فتح تحليل السهم</button>
      </div>
      ${isWatch ? '<small class="golden-watch-note">مرشح مراقبة فقط؛ لم تكتمل جميع بوابات التنبيه.</small>' : ''}
    </article>`;
  }

  function render() {
    if (!state.payload) return;
    const { actionable, watch } = relevantAlerts();
    const regime = state.payload.marketRegime || {};
    const buyCount = actionable.filter((item) => item.signal === 'golden_buy').length;
    const sellCount = actionable.filter((item) => item.signal === 'risk_exit').length;

    $('goldenMarketRegime').textContent = regime.label || 'غير متاح';
    $('goldenActionableCount').textContent = String(actionable.length);
    $('goldenBuyCount').textContent = String(buyCount);
    $('goldenSellCount').textContent = String(sellCount);
    $('goldenUpdatedAt').textContent = state.payload.generatedAt
      ? `آخر فحص: ${new Date(state.payload.generatedAt).toLocaleString('ar-SA')}`
      : 'لم يُنفذ الفحص الحي بعد';

    let html = '';
    if (actionable.length) {
      html += `<div class="golden-section-title"><strong>تنبيهات قابلة للتصرف</strong><span>${actionable.length}</span></div>`;
      html += actionable.map((alert) => alertCard(alert)).join('');
    } else {
      html += `<div class="golden-no-alert"><span>✓</span><div><strong>لا توجد إشارة شراء أو تخفيف مكتملة الآن</strong><p>هذا هو السلوك الصحيح للمحرك: لا يصدر تنبيهًا حتى تجتاز الإشارة بوابات البيانات والسوق والاتجاه والزخم والسيولة.</p></div></div>`;
    }
    if (watch.length) {
      html += `<div class="golden-section-title watch"><strong>الأقرب لاكتمال الشروط</strong><span>${watch.length}</span></div>`;
      html += watch.map((alert) => alertCard(alert, true)).join('');
    }
    $('goldenAlertList').innerHTML = html;

    document.querySelectorAll('.golden-open-symbol').forEach((button) => {
      button.addEventListener('click', () => {
        const symbolSelect = $('symbolSelect');
        const marketExplorer = $('marketExplorer');
        if (symbolSelect && Array.from(symbolSelect.options).some((option) => option.value === button.dataset.symbol)) {
          symbolSelect.value = button.dataset.symbol;
          symbolSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        marketExplorer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  async function showSystemNotification(alert) {
    const title = alert.signal === 'golden_buy'
      ? `Golden Alert: ${alert.symbol}`
      : `تنبيه حماية مركز: ${alert.symbol}`;
    const body = `${alert.label} · الدرجة ${alert.score}/100 · السعر ${money(alert.price)}`;
    const options = {
      body,
      icon: 'icon.svg',
      badge: 'icon.svg',
      tag: alert.alertId,
      renotify: false,
      data: { url: `./?alert=${encodeURIComponent(alert.symbol)}#goldenAlerts` },
    };
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
      return;
    }
    if ('Notification' in window) new Notification(title, options);
  }

  async function notifyNewAlerts() {
    if (!state.payload || !('Notification' in window) || Notification.permission !== 'granted') return;
    const { actionable } = relevantAlerts();
    const seen = readSeen();
    const fresh = actionable.filter((alert) => !seen.has(alert.alertId));
    if (!fresh.length) return;
    await showSystemNotification(fresh[0]);
    fresh.forEach((alert) => seen.add(alert.alertId));
    saveSeen(seen);
  }

  async function enableNotifications() {
    const status = $('goldenNotificationState');
    if (!('Notification' in window)) {
      status.textContent = 'هذا المتصفح لا يدعم إشعارات الويب. ثبّت التطبيق على الشاشة الرئيسية أو اعتمد تنبيه ChatGPT الخارجي.';
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      status.textContent = 'لم يتم منح الإذن؛ سيبقى مركز التنبيهات يعمل داخل المنصة.';
      return;
    }
    status.textContent = 'الإشعارات مفعلة. سيظهر التنبيه الجديد عند فتح التطبيق أو أثناء عمله.';
    await notifyNewAlerts();
  }

  async function loadAlerts({ quiet = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    if (!quiet) $('goldenEngineState').textContent = 'جارٍ تحميل نتائج المحرك…';
    try {
      const response = await fetch(`golden-alerts.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.schemaVersion !== 1 || !Array.isArray(payload.alerts)) throw new Error('بنية التنبيهات غير صالحة');
      state.payload = payload;
      $('goldenEngineState').textContent = payload.generatedAt
        ? `${payload.summary.symbolsEvaluated} سهمًا · قواعد ${payload.rulesVersion}`
        : 'بانتظار أول فحص حي';
      render();
      await notifyNewAlerts();
    } catch (error) {
      $('goldenEngineState').textContent = `تعذر تحميل التنبيهات: ${error.message}`;
      if (!state.payload) $('goldenAlertList').innerHTML = '<div class="golden-no-alert"><div><strong>المحرك غير متاح مؤقتًا</strong><p>لن يصدر النظام أي قرار عند تعذر البيانات.</p></div></div>';
    } finally {
      state.loading = false;
    }
  }

  $('goldenEnableNotifications')?.addEventListener('click', enableNotifications);
  $('goldenRefresh')?.addEventListener('click', () => loadAlerts());
  $('osPositionForm')?.addEventListener('submit', () => setTimeout(render, 100));
  $('osPortfolioBody')?.addEventListener('click', (event) => {
    if (event.target.closest('[data-remove]')) setTimeout(render, 100);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadAlerts({ quiet: true });
  });
  window.addEventListener('storage', (event) => {
    if (event.key === PORTFOLIO_KEY) render();
  });

  loadAlerts();
  window.setInterval(() => loadAlerts({ quiet: true }), 5 * 60 * 1000);
})();
