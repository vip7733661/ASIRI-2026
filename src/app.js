import { demoSignals, marketPulse } from './demo-data.js';
import { RISK_PROFILES, calculatePositionSize, deriveDecision } from './scoring-engine.js';

const state = {
  selectedIndex: 0,
  profile: 'balanced',
  replayIndex: 12,
  replayTimer: null,
  capital: 5000,
  paperTrades: [],
};

const $ = (selector) => document.querySelector(selector);
const formatMoney = (value) => new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
const formatNumber = (value, digits = 1) => new Intl.NumberFormat('ar-SA', { maximumFractionDigits: digits }).format(value);
const currentSignal = () => demoSignals[state.selectedIndex];
const currentDecision = () => deriveDecision(currentSignal(), state.profile);

function renderMarketPulse() {
  $('#market-regime').textContent = marketPulse.regime;
  $('#market-note').textContent = marketPulse.note;
  const metrics = [
    ['اتساع السوق', marketPulse.breadth],
    ['التذبذب', marketPulse.volatility],
    ['الأسهم الصغيرة', marketPulse.smallCaps],
    ['السيولة', marketPulse.liquidity],
  ];
  $('#pulse-metrics').innerHTML = metrics.map(([label, value]) => `
    <div class="metric-card">
      <div class="metric-head"><span>${label}</span><strong>${value}</strong></div>
      <div class="metric-track"><span style="width:${value}%"></span></div>
    </div>`).join('');
}

function renderProfiles() {
  $('#risk-profiles').innerHTML = Object.entries(RISK_PROFILES).map(([key, profile]) => `
    <button class="profile-btn ${state.profile === key ? 'active' : ''}" data-profile="${key}">
      ${profile.label}<small>حد النتيجة ${profile.scoreFloor}</small>
    </button>`).join('');
  document.querySelectorAll('[data-profile]').forEach((button) => {
    button.addEventListener('click', () => {
      state.profile = button.dataset.profile;
      render();
    });
  });
}

function renderSignalList() {
  $('#signal-list').innerHTML = demoSignals.map((signal, index) => {
    const decision = deriveDecision(signal, state.profile);
    return `
      <button class="signal-row ${state.selectedIndex === index ? 'active' : ''}" data-index="${index}">
        <div><strong>${signal.symbol}</strong><span>${signal.company}</span></div>
        <div class="signal-price"><strong>${formatMoney(signal.price)}</strong><span class="positive">+${formatNumber(signal.changePercent)}%</span></div>
        <div class="score-pill tone-${decision.tone}">${decision.score}</div>
      </button>`;
  }).join('');
  document.querySelectorAll('[data-index]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedIndex = Number(button.dataset.index);
      state.replayIndex = 12;
      stopReplay();
      render();
    });
  });
}

function renderHero() {
  const signal = currentSignal();
  const decision = currentDecision();
  const scoreRing = $('#score-ring');
  scoreRing.style.setProperty('--score', `${decision.score * 3.6}deg`);
  scoreRing.dataset.tone = decision.tone;
  $('#score-value').textContent = decision.score;
  $('#selected-symbol').textContent = signal.symbol;
  $('#selected-company').textContent = signal.company;
  $('#selected-price').textContent = formatMoney(signal.price);
  $('#selected-change').textContent = `+${formatNumber(signal.changePercent)}%`;
  $('#decision-badge').className = `decision-badge tone-${decision.tone}`;
  $('#decision-badge').textContent = decision.label;
  $('#decision-reason').textContent = decision.reason;
  $('#setup-copy').textContent = signal.setup;
  $('#entry').textContent = formatMoney(signal.entry);
  $('#stop').textContent = formatMoney(signal.stop);
  $('#target1').textContent = formatMoney(signal.target1);
  $('#target2').textContent = formatMoney(signal.target2);
  $('#rr').textContent = `${formatNumber(signal.riskReward)} : 1`;
  $('#rvol').textContent = `${formatNumber(signal.relativeVolume)}x`;
}

function renderGoldenGate() {
  const decision = currentDecision();
  $('#golden-state').textContent = decision.golden.active ? 'مكتمل' : 'غير مكتمل';
  $('#golden-state').className = decision.golden.active ? 'golden-active' : 'golden-inactive';
  $('#golden-checks').innerHTML = decision.golden.checks.map((check) => `
    <li class="${check.passed ? 'passed' : 'failed'}"><span>${check.passed ? '✓' : '×'}</span>${check.label}</li>`).join('');
}

function renderEvidence() {
  const signal = currentSignal();
  $('#evidence-list').innerHTML = signal.evidence.map(([label, value]) => `
    <div class="evidence-row"><span>${label}</span><strong>${value}</strong></div>`).join('');
  const labels = {
    technical: 'الفني', volume: 'الحجم', momentum: 'الزخم', catalyst: 'المحفز', liquidity: 'السيولة', risk: 'إدارة المخاطر', strategy: 'ملاءمة الاستراتيجية',
  };
  $('#factor-bars').innerHTML = Object.entries(signal.factors).map(([key, value]) => `
    <div class="factor-row"><span>${labels[key]}</span><div class="factor-track"><i style="width:${value}%"></i></div><strong>${value}</strong></div>`).join('');
}

function drawChart() {
  const canvas = $('#replay-chart');
  const context = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const bounds = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
  canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  const width = bounds.width;
  const height = bounds.height;
  const padding = { top: 18, right: 16, bottom: 30, left: 48 };
  const data = currentSignal().candles.slice(0, state.replayIndex);
  const min = Math.min(...data.map((item) => item.low)) * 0.995;
  const max = Math.max(...data.map((item) => item.high)) * 1.005;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const candleWidth = Math.max(4, chartWidth / Math.max(data.length, 18) * 0.6);
  const xStep = chartWidth / Math.max(data.length, 1);
  const y = (price) => padding.top + ((max - price) / (max - min || 1)) * chartHeight;

  context.clearRect(0, 0, width, height);
  context.strokeStyle = 'rgba(148, 163, 184, 0.13)';
  context.lineWidth = 1;
  context.font = '11px system-ui';
  context.fillStyle = '#7f8fa6';
  for (let line = 0; line <= 4; line += 1) {
    const yy = padding.top + (chartHeight / 4) * line;
    context.beginPath();
    context.moveTo(padding.left, yy);
    context.lineTo(width - padding.right, yy);
    context.stroke();
    context.fillText((max - ((max - min) / 4) * line).toFixed(2), 6, yy + 4);
  }
  data.forEach((item, index) => {
    const x = padding.left + xStep * index + xStep / 2;
    const rising = item.close >= item.open;
    const color = rising ? '#2dd4a7' : '#fb7185';
    context.strokeStyle = color;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(x, y(item.high));
    context.lineTo(x, y(item.low));
    context.stroke();
    const top = Math.min(y(item.open), y(item.close));
    context.fillRect(x - candleWidth / 2, top, candleWidth, Math.max(2, Math.abs(y(item.open) - y(item.close))));
  });
  const last = data.at(-1);
  if (last) {
    context.fillStyle = '#d8b45b';
    context.fillText(`${last.time} • ${last.close.toFixed(2)}`, width - 105, height - 9);
  }
}

function startReplay() {
  if (state.replayTimer) return;
  $('#replay-button').textContent = 'إيقاف الإعادة';
  state.replayTimer = window.setInterval(() => {
    const total = currentSignal().candles.length;
    state.replayIndex = state.replayIndex >= total ? 8 : state.replayIndex + 1;
    drawChart();
  }, 650);
}

function stopReplay() {
  if (state.replayTimer) {
    window.clearInterval(state.replayTimer);
    state.replayTimer = null;
  }
  const button = $('#replay-button');
  if (button) button.textContent = 'تشغيل إعادة السوق';
}

function renderPositionSizer() {
  const signal = currentSignal();
  const profile = RISK_PROFILES[state.profile];
  const size = calculatePositionSize({ capital: state.capital, entry: signal.entry, stop: signal.stop, riskPercent: profile.maxPositionRisk });
  $('#capital-input').value = state.capital;
  $('#risk-percent').textContent = `${profile.maxPositionRisk}%`;
  $('#position-qty').textContent = `${formatNumber(size.quantity, 0)} سهم`;
  $('#position-value').textContent = formatMoney(size.positionValue);
  $('#risk-budget').textContent = formatMoney(size.riskBudget);
}

function renderPaperTrades() {
  const totalValue = state.paperTrades.reduce((sum, trade) => sum + trade.value, 0);
  $('#paper-count').textContent = state.paperTrades.length;
  $('#paper-value').textContent = formatMoney(totalValue);
  $('#paper-log').innerHTML = state.paperTrades.length
    ? state.paperTrades.slice().reverse().map((trade) => `<li><strong>${trade.symbol}</strong><span>${trade.quantity} سهم • ${formatMoney(trade.value)}</span></li>`).join('')
    : '<li class="empty-state">لا توجد صفقات تجريبية بعد.</li>';
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function placePaperTrade() {
  const signal = currentSignal();
  const decision = currentDecision();
  const profile = RISK_PROFILES[state.profile];
  const size = calculatePositionSize({ capital: state.capital, entry: signal.entry, stop: signal.stop, riskPercent: profile.maxPositionRisk });
  if (!['golden', 'entry'].includes(decision.code)) {
    showToast(`تم رفض الصفقة: ${decision.label}`);
    return;
  }
  if (!size.quantity) {
    showToast('تعذر احتساب حجم الصفقة.');
    return;
  }
  state.paperTrades.push({ symbol: signal.symbol, quantity: size.quantity, value: size.positionValue, score: decision.score });
  renderPaperTrades();
  showToast(`تم تسجيل صفقة تجريبية على ${signal.symbol}`);
}

function bindStaticEvents() {
  $('#replay-button').addEventListener('click', () => state.replayTimer ? stopReplay() : startReplay());
  $('#paper-trade-button').addEventListener('click', placePaperTrade);
  $('#capital-input').addEventListener('input', (event) => {
    state.capital = Math.max(0, Number(event.target.value) || 0);
    renderPositionSizer();
  });
  window.addEventListener('resize', drawChart);
}

function render() {
  renderMarketPulse();
  renderProfiles();
  renderSignalList();
  renderHero();
  renderGoldenGate();
  renderEvidence();
  renderPositionSizer();
  renderPaperTrades();
  requestAnimationFrame(drawChart);
}

bindStaticEvents();
render();
