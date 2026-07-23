(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = { payload: null, symbol: '', loading: false };
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function formatPrice(value, currency = 'USD') {
    if (!finite(value)) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency, minimumFractionDigits: value < 10 ? 3 : 2, maximumFractionDigits: value < 10 ? 4 : 2
    }).format(value);
  }

  function formatNumber(value, digits = 2) {
    if (!finite(value)) return '—';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
  }

  function formatVolume(value) {
    if (!finite(value)) return '—';
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
  }

  function formatTimestamp(value) {
    if (!value) return 'بانتظار أول تحديث';
    try {
      return new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    } catch (_) {
      return value;
    }
  }

  function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value;
  }

  function currentSnapshot() {
    return state.payload?.symbols?.[state.symbol] || null;
  }

  function resetValues(message = 'بانتظار بيانات حقيقية') {
    setText('marketSymbol', '—');
    setText('marketDate', message);
    setText('marketPrice', '—');
    setText('marketChange', '—');
    setText('marketHigh20', '—');
    setText('marketLow20', '—');
    setText('marketSma20', '—');
    setText('marketSma50', '—');
    setText('marketRsi14', '—');
    setText('marketVolume', '—');
    setText('marketAvgVolume20', '—');
    setText('marketQuality', '—');
    setText('marketRows', '—');
    $('sessionsBody').innerHTML = `<tr><td colspan="6">${escapeHtml(message)}</td></tr>`;
    $('marketChart').replaceChildren();
    $('marketChartEmpty').hidden = false;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function updateBanner(error = '') {
    const banner = $('marketDataBanner');
    banner.classList.toggle('ready', Boolean(state.payload?.generatedAt) && !error);
    banner.classList.toggle('error', Boolean(error));

    if (state.loading) {
      setText('marketDataState', 'جارٍ تحميل بيانات السوق الحقيقية…');
      setText('marketDataUpdated', '—');
      return;
    }
    if (error) {
      setText('marketDataState', 'تعذر تحميل بيانات السوق');
      setText('marketDataUpdated', error);
      return;
    }
    if (!state.payload?.generatedAt) {
      setText('marketDataState', 'بانتظار أول تحديث ناجح من خادم GitHub');
      setText('marketDataUpdated', 'لا توجد أرقام تجريبية');
      return;
    }
    const count = Object.keys(state.payload.symbols || {}).length;
    setText('marketDataState', `${count} رموز ببيانات فعلية · ${Object.keys(state.payload.errors || {}).length} أخطاء معلنة`);
    setText('marketDataUpdated', `آخر توليد: ${formatTimestamp(state.payload.generatedAt)}`);
  }

  function populateSymbols() {
    const select = $('symbolSelect');
    const symbols = Object.keys(state.payload?.symbols || {});
    select.replaceChildren();
    if (!symbols.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'لا توجد بيانات منشورة';
      select.append(option);
      state.symbol = '';
      return;
    }
    symbols.sort().forEach((symbol) => {
      const option = document.createElement('option');
      option.value = symbol;
      option.textContent = symbol;
      select.append(option);
    });
    if (!symbols.includes(state.symbol)) state.symbol = symbols[0];
    select.value = state.symbol;
  }

  function makeSvg(name, attributes = {}) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }

  function renderChart(sessions) {
    const svg = $('marketChart');
    svg.replaceChildren();
    const points = sessions.filter((session) => finite(session.close));
    if (points.length < 2) {
      $('marketChartEmpty').hidden = false;
      return;
    }
    $('marketChartEmpty').hidden = true;

    const width = 720;
    const height = 260;
    const pad = { x: 42, y: 28 };
    const closes = points.map((item) => item.close);
    let min = Math.min(...closes);
    let max = Math.max(...closes);
    if (max === min) { max += 1; min -= 1; }
    const xFor = (index) => pad.x + (index / (points.length - 1)) * (width - pad.x * 2);
    const yFor = (value) => pad.y + ((max - value) / (max - min)) * (height - pad.y * 2);

    const defs = makeSvg('defs');
    const gradient = makeSvg('linearGradient', { id: 'marketAreaGradient', x1: '0', y1: '0', x2: '0', y2: '1' });
    gradient.append(makeSvg('stop', { offset: '0%', 'stop-color': '#46d9ff', 'stop-opacity': '.32' }));
    gradient.append(makeSvg('stop', { offset: '100%', 'stop-color': '#46d9ff', 'stop-opacity': '0' }));
    defs.append(gradient);
    svg.append(defs);

    for (let index = 0; index <= 4; index += 1) {
      const y = pad.y + index * ((height - pad.y * 2) / 4);
      svg.append(makeSvg('line', { x1: pad.x, y1: y, x2: width - pad.x, y2: y, class: 'grid-line' }));
    }

    const coordinates = points.map((item, index) => [xFor(index), yFor(item.close)]);
    const linePath = coordinates.map(([x, y], index) => `${index ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    const areaPath = `${linePath} L ${coordinates.at(-1)[0].toFixed(2)} ${height - pad.y} L ${coordinates[0][0].toFixed(2)} ${height - pad.y} Z`;
    svg.append(makeSvg('path', { d: areaPath, class: 'price-area' }));
    svg.append(makeSvg('path', { d: linePath, class: 'price-line' }));

    const maxLabel = makeSvg('text', { x: pad.x, y: 18, class: 'chart-label' });
    maxLabel.textContent = formatNumber(max, 3);
    const minLabel = makeSvg('text', { x: pad.x, y: height - 7, class: 'chart-label' });
    minLabel.textContent = formatNumber(min, 3);
    svg.append(maxLabel, minLabel);
  }

  function renderSessions(sessions) {
    const rows = sessions.slice(-10).reverse();
    $('sessionsBody').innerHTML = rows.map((session) => `
      <tr>
        <td>${escapeHtml(session.date)}</td>
        <td>${formatNumber(session.open, 4)}</td>
        <td>${formatNumber(session.high, 4)}</td>
        <td>${formatNumber(session.low, 4)}</td>
        <td>${formatNumber(session.close, 4)}</td>
        <td>${formatVolume(session.volume)}</td>
      </tr>`).join('');
  }

  function renderMarket() {
    const snapshot = currentSnapshot();
    if (!snapshot) {
      resetValues();
      return;
    }
    const currency = snapshot.currency || 'USD';
    const change = snapshot.changePercent;
    const changeNode = $('marketChange');
    const sign = finite(snapshot.change) && snapshot.change > 0 ? '+' : '';
    const percentSign = finite(change) && change > 0 ? '+' : '';

    setText('marketDataSource', `المصدر: ${state.payload.source?.name || 'غير معروف'} ${state.payload.source?.version || ''}`.trim());
    setText('marketSymbol', snapshot.symbol);
    setText('marketDate', `آخر جلسة: ${snapshot.latestDate}`);
    setText('marketPrice', formatPrice(snapshot.latestClose, currency));
    setText('marketChange', finite(change) ? `${sign}${formatNumber(snapshot.change, 4)} · ${percentSign}${formatNumber(change, 2)}%` : '—');
    changeNode.classList.toggle('positive', finite(change) && change >= 0);
    changeNode.classList.toggle('negative', finite(change) && change < 0);
    setText('marketHigh20', formatPrice(snapshot.high20, currency));
    setText('marketLow20', formatPrice(snapshot.low20, currency));
    setText('marketSma20', formatPrice(snapshot.sma20, currency));
    setText('marketSma50', formatPrice(snapshot.sma50, currency));
    setText('marketRsi14', formatNumber(snapshot.rsi14, 2));
    setText('marketVolume', formatVolume(snapshot.volume));
    setText('marketAvgVolume20', formatVolume(snapshot.avgVolume20));
    setText('marketQuality', finite(snapshot.quality?.score) ? `${snapshot.quality.score}/100` : '—');
    setText('marketRows', `${snapshot.quality?.rows || 0} صف تاريخي`);
    setText('marketDisclaimer', state.payload.disclaimer || 'بيانات بحثية وليست توصية استثمارية.');
    renderChart(snapshot.sessions || []);
    renderSessions(snapshot.sessions || []);
  }

  async function loadMarketData(force = false) {
    if (state.loading) return;
    state.loading = true;
    $('refreshMarketDataButton').disabled = true;
    $('refreshMarketDataButton').textContent = 'جارٍ التحميل…';
    updateBanner();
    try {
      const suffix = force ? `?t=${Date.now()}` : '';
      const response = await fetch(`market-data.json${suffix}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (payload?.schemaVersion !== 1 || !payload?.symbols || !payload?.source) throw new Error('ملف بيانات السوق غير صالح');
      state.payload = payload;
      populateSymbols();
      updateBanner();
      renderMarket();
    } catch (error) {
      state.payload = null;
      populateSymbols();
      resetValues('تعذر تحميل ملف بيانات السوق');
      updateBanner(String(error?.message || error));
    } finally {
      state.loading = false;
      $('refreshMarketDataButton').disabled = false;
      $('refreshMarketDataButton').textContent = 'تحديث الملف';
      updateBanner();
    }
  }

  $('symbolSelect').addEventListener('change', (event) => {
    state.symbol = event.target.value;
    renderMarket();
  });
  $('refreshMarketDataButton').addEventListener('click', () => loadMarketData(true));
  window.addEventListener('online', () => loadMarketData(true));
  loadMarketData();
})();
