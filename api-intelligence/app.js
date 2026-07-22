(() => {
  'use strict';

  const catalog = window.API_ATLAS_CATALOG;
  const items = catalog.items.map((item) => ({ ...item, score: scoreItem(item) }));
  const FAVORITES_KEY = 'api-atlas-favorites-v1';
  const STATUS_LABELS = {
    operational: 'تعمل الآن',
    restricted: 'قابلة للوصول — مقيدة',
    degraded: 'استجابة متدهورة',
    unavailable: 'غير متاحة',
    unknown: 'بانتظار الفحص'
  };
  const STATUS_RANK = { operational: 0, restricted: 1, degraded: 2, unavailable: 3, unknown: 4 };
  const state = {
    query: '',
    type: 'all',
    quickFilter: 'all',
    sort: 'health',
    favorites: new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')),
    deferredPrompt: null,
    healthData: null,
    loadingHealth: false
  };

  const $ = (id) => document.getElementById(id);
  const cards = $('cards');
  const template = $('cardTemplate');
  const detailsDialog = $('detailsDialog');
  const installDialog = $('installDialog');

  function scoreItem(item) {
    let score = 35;
    if (item.https) score += 20;
    score += item.auth === 'No' ? 18 : item.auth === 'apiKey' ? 12 : 8;
    score += item.cors === 'Yes' ? 15 : item.cors === 'Unknown' ? 5 : 0;
    if (item.freeTier) score += 8;
    if (item.docs) score += 4;
    return Math.min(score, 100);
  }

  function healthFor(id) {
    return state.healthData?.services?.[id] || null;
  }

  function statusFor(id) {
    return healthFor(id)?.status || 'unknown';
  }

  function authRank(auth) {
    return auth === 'No' ? 0 : auth === 'apiKey' ? 1 : 2;
  }

  function currentItems() {
    const q = state.query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const health = healthFor(item.id);
      const searchable = [item.name, item.description, item.type, ...item.tags].join(' ').toLowerCase();
      const queryMatch = !q || searchable.includes(q);
      const typeMatch = state.type === 'all' || item.type === state.type;
      let quickMatch = true;
      if (state.quickFilter === 'operational') quickMatch = health?.status === 'operational';
      if (state.quickFilter === 'no-key') quickMatch = item.auth === 'No';
      if (state.quickFilter === 'cors') quickMatch = Boolean(health?.corsObserved);
      if (state.quickFilter === 'market') quickMatch = item.type.includes('Market Data') || item.type.includes('Broker');
      if (state.quickFilter === 'official') quickMatch = ['fred', 'sec-edgar'].includes(item.id);
      if (state.quickFilter === 'favorites') quickMatch = state.favorites.has(item.id);
      return queryMatch && typeMatch && quickMatch;
    });

    return filtered.sort((a, b) => {
      const healthA = healthFor(a.id);
      const healthB = healthFor(b.id);
      if (state.sort === 'health') {
        return STATUS_RANK[statusFor(a.id)] - STATUS_RANK[statusFor(b.id)]
          || (healthA?.latencyMs ?? Number.MAX_SAFE_INTEGER) - (healthB?.latencyMs ?? Number.MAX_SAFE_INTEGER)
          || a.name.localeCompare(b.name);
      }
      if (state.sort === 'latency') {
        return (healthA?.latencyMs ?? Number.MAX_SAFE_INTEGER) - (healthB?.latencyMs ?? Number.MAX_SAFE_INTEGER)
          || STATUS_RANK[statusFor(a.id)] - STATUS_RANK[statusFor(b.id)];
      }
      if (state.sort === 'name') return a.name.localeCompare(b.name);
      if (state.sort === 'auth') return authRank(a.auth) - authRank(b.auth) || b.score - a.score;
      return b.score - a.score || a.name.localeCompare(b.name);
    });
  }

  function badge(text, tone = '') {
    const span = document.createElement('span');
    span.className = `badge ${tone}`.trim();
    span.textContent = text;
    return span;
  }

  function healthTone(status) {
    if (status === 'operational') return 'good';
    if (status === 'restricted' || status === 'degraded') return 'warn';
    if (status === 'unavailable') return 'bad';
    return '';
  }

  function formatLatency(value) {
    return Number.isFinite(value) ? `${value.toLocaleString('ar-SA')} ms` : '—';
  }

  function formatDate(value) {
    if (!value) return 'بانتظار أول فحص';
    try {
      return new Intl.DateTimeFormat('ar-SA', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(value));
    } catch (_) {
      return value;
    }
  }

  function render() {
    const visible = currentItems();
    cards.replaceChildren();
    $('resultCount').textContent = `${visible.length} نتيجة`;
    $('emptyState').hidden = visible.length !== 0;

    visible.forEach((item) => {
      const health = healthFor(item.id);
      const status = health?.status || 'unknown';
      const node = template.content.cloneNode(true);
      const article = node.querySelector('.api-card');
      article.dataset.id = item.id;
      article.dataset.health = status;
      node.querySelector('.type-badge').textContent = item.type;
      node.querySelector('h3').textContent = item.name;
      node.querySelector('.description').textContent = item.description;
      const badges = node.querySelector('.badges');
      badges.append(
        badge(item.auth === 'No' ? 'بدون مفتاح' : item.auth, item.auth === 'No' ? 'good' : ''),
        badge('HTTPS', item.https ? 'good' : 'warn'),
        badge(`HTTP: ${health?.httpStatus ?? '—'}`, healthTone(status))
      );
      if (health?.corsObserved) badges.append(badge(`CORS: ${health.corsObserved}`, 'good'));

      const healthState = node.querySelector('.health-state');
      healthState.classList.add(status);
      healthState.querySelector('strong').textContent = STATUS_LABELS[status];
      node.querySelector('.latency-value').textContent = formatLatency(health?.latencyMs);
      node.querySelector('.score-value').textContent = `${item.score}/100`;
      node.querySelector('.score-bar i').style.width = `${item.score}%`;

      const favoriteButton = node.querySelector('.favorite-button');
      updateFavoriteButton(favoriteButton, item.id);
      favoriteButton.addEventListener('click', () => toggleFavorite(item.id));
      node.querySelector('.details-button').addEventListener('click', () => showDetails(item));
      const docsLink = node.querySelector('.docs-link');
      docsLink.href = item.docs;
      cards.append(node);
    });

    updateStats();
  }

  function updateStats() {
    const summary = state.healthData?.summary;
    $('totalCount').textContent = items.length;
    $('operationalCount').textContent = summary ? summary.operational : '—';
    $('reachabilityRate').textContent = summary ? `${summary.reachabilityRate}%` : '—';
    $('restrictedCount').textContent = summary ? summary.restricted : '—';
    $('noKeyCount').textContent = items.filter((item) => item.auth === 'No').length;
    $('favoriteCount').textContent = state.favorites.size;
  }

  function updateLiveBanner(errorMessage = '') {
    const generatedAt = state.healthData?.generatedAt;
    const summary = state.healthData?.summary;
    const banner = $('liveBanner');
    banner.classList.toggle('error', Boolean(errorMessage));
    banner.classList.toggle('ready', Boolean(generatedAt) && !errorMessage);

    if (state.loadingHealth) {
      $('liveBannerTitle').textContent = 'جارٍ تحميل آخر فحص حي…';
      $('lastCheckedLabel').textContent = '—';
      return;
    }
    if (errorMessage) {
      $('liveBannerTitle').textContent = 'تعذر تحميل ملف الحالة الحية';
      $('lastCheckedLabel').textContent = errorMessage;
      return;
    }
    if (!generatedAt) {
      $('liveBannerTitle').textContent = 'بانتظار أول تشغيل للفحص الحي';
      $('lastCheckedLabel').textContent = 'سيعمل تلقائيًا مع عملية النشر القادمة';
      return;
    }
    $('liveBannerTitle').textContent = `${summary.operational} تعمل · ${summary.restricted} مقيدة · ${summary.unavailable + summary.degraded} تحتاج مراجعة`;
    $('lastCheckedLabel').textContent = `آخر فحص: ${formatDate(generatedAt)}`;
  }

  async function loadLiveStatus(force = false) {
    if (state.loadingHealth) return;
    state.loadingHealth = true;
    $('refreshStatusButton').disabled = true;
    $('refreshStatusButton').textContent = 'جارٍ التحديث…';
    updateLiveBanner();

    try {
      const suffix = force ? `?t=${Date.now()}` : '';
      const response = await fetch(`live-status.json${suffix}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload?.summary || !payload?.services) throw new Error('ملف الحالة غير صالح');
      state.healthData = payload;
      updateLiveBanner();
    } catch (error) {
      updateLiveBanner(String(error?.message || error));
    } finally {
      state.loadingHealth = false;
      $('refreshStatusButton').disabled = false;
      $('refreshStatusButton').textContent = 'تحديث الحالة الحية';
      render();
    }
  }

  function updateFavoriteButton(button, id) {
    const active = state.favorites.has(id);
    button.classList.toggle('active', active);
    button.textContent = active ? '★' : '☆';
    button.setAttribute('aria-label', active ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة');
  }

  function toggleFavorite(id) {
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
    render();
  }

  function showDetails(item) {
    const health = healthFor(item.id);
    const status = health?.status || 'unknown';
    const tags = item.tags.map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`).join('');
    const probeLabel = health?.probeKind === 'data-endpoint' ? 'Endpoint بيانات' : 'صفحة التوثيق';
    $('dialogContent').innerHTML = `
      <p class="kicker">${escapeHtml(item.type)}</p>
      <h2>${escapeHtml(item.name)}</h2>
      <p>${escapeHtml(item.description)}</p>
      <div class="dialog-grid">
        <div><span>الحالة الحية</span><strong>${escapeHtml(STATUS_LABELS[status])}</strong></div>
        <div><span>زمن الاستجابة</span><strong>${formatLatency(health?.latencyMs)}</strong></div>
        <div><span>رمز HTTP</span><strong>${health?.httpStatus ?? '—'}</strong></div>
        <div><span>نوع الفحص</span><strong>${probeLabel}</strong></div>
        <div><span>المصادقة</span><strong>${escapeHtml(item.auth)}</strong></div>
        <div><span>CORS المكتشف</span><strong>${escapeHtml(health?.corsObserved || 'غير ظاهر')}</strong></div>
        <div><span>آخر فحص</span><strong>${escapeHtml(formatDate(health?.checkedAt))}</strong></div>
        <div><span>Catalog Score</span><strong>${item.score}/100</strong></div>
      </div>
      <div class="dialog-tags">${tags}</div>
      <p><strong>ملاحظة المزود:</strong> ${escapeHtml(item.notes)}</p>
      <p><strong>ملاحظة الفحص:</strong> ${escapeHtml(health?.note || 'لم يكتمل أول فحص حي بعد.')}</p>
      <p class="muted">هذا الفحص يثبت قابلية الوصول فقط. اعتماد دقة الأسعار والتغطية والحقوق التجارية يتطلب اختبارات بيانات منفصلة ومفتاحًا رسميًا عندما تفرضه الخدمة.</p>
      <a class="docs-link" href="${encodeURI(item.docs)}" target="_blank" rel="noopener noreferrer">فتح التوثيق الرسمي</a>
    `;
    detailsDialog.showModal();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function populateTypes() {
    [...new Set(items.map((item) => item.type))].sort().forEach((type) => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      $('typeFilter').append(option);
    });
  }

  function downloadCatalog() {
    const payload = {
      ...catalog.meta,
      downloadedAt: new Date().toISOString(),
      liveHealth: state.healthData,
      items: items.map(({ score, ...item }) => ({
        ...item,
        catalogScore: score,
        health: healthFor(item.id)
      }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'api-atlas-live-finance-report.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function shareApp() {
    const shareData = { title: document.title, text: 'دليل حي لحالة APIs المالية — API Atlas', url: location.href };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (_) { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(location.href);
      $('shareButton').textContent = 'تم نسخ الرابط';
      setTimeout(() => { $('shareButton').textContent = 'مشاركة التطبيق'; }, 1600);
    }
  }

  function updateNetwork() {
    const online = navigator.onLine;
    $('networkDot').classList.toggle('offline', !online);
    $('networkLabel').textContent = online ? 'متصل' : 'وضع دون اتصال';
  }

  function setupInstall() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      state.deferredPrompt = event;
    });
    $('installButton').addEventListener('click', async () => {
      if (state.deferredPrompt) {
        state.deferredPrompt.prompt();
        await state.deferredPrompt.userChoice;
        state.deferredPrompt = null;
      } else {
        installDialog.showModal();
      }
    });
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  $('searchInput').addEventListener('input', (event) => { state.query = event.target.value; render(); });
  $('typeFilter').addEventListener('change', (event) => { state.type = event.target.value; render(); });
  $('sortSelect').addEventListener('change', (event) => { state.sort = event.target.value; render(); });
  $('refreshStatusButton').addEventListener('click', () => loadLiveStatus(true));
  document.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach((item) => item.classList.remove('active'));
    chip.classList.add('active');
    state.quickFilter = chip.dataset.filter;
    render();
  }));
  $('downloadButton').addEventListener('click', downloadCatalog);
  $('shareButton').addEventListener('click', shareApp);
  window.addEventListener('online', () => { updateNetwork(); loadLiveStatus(true); });
  window.addEventListener('offline', updateNetwork);

  populateTypes();
  updateNetwork();
  setupInstall();
  registerServiceWorker();
  render();
  loadLiveStatus();
})();
