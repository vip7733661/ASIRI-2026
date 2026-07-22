(() => {
  'use strict';

  const catalog = window.API_ATLAS_CATALOG;
  const items = catalog.items.map((item) => ({ ...item, score: scoreItem(item) }));
  const FAVORITES_KEY = 'api-atlas-favorites-v1';
  const state = {
    query: '',
    type: 'all',
    quickFilter: 'all',
    sort: 'score',
    favorites: new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')),
    deferredPrompt: null,
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

  function authRank(auth) {
    return auth === 'No' ? 0 : auth === 'apiKey' ? 1 : 2;
  }

  function currentItems() {
    const q = state.query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const searchable = [item.name, item.description, item.type, ...item.tags].join(' ').toLowerCase();
      const queryMatch = !q || searchable.includes(q);
      const typeMatch = state.type === 'all' || item.type === state.type;
      let quickMatch = true;
      if (state.quickFilter === 'no-key') quickMatch = item.auth === 'No';
      if (state.quickFilter === 'cors') quickMatch = item.cors === 'Yes';
      if (state.quickFilter === 'market') quickMatch = item.type.includes('Market Data') || item.type.includes('Broker');
      if (state.quickFilter === 'official') quickMatch = ['fred', 'sec-edgar'].includes(item.id);
      if (state.quickFilter === 'favorites') quickMatch = state.favorites.has(item.id);
      return queryMatch && typeMatch && quickMatch;
    });

    return filtered.sort((a, b) => {
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

  function render() {
    const visible = currentItems();
    cards.replaceChildren();
    $('resultCount').textContent = `${visible.length} نتيجة`;
    $('emptyState').hidden = visible.length !== 0;

    visible.forEach((item) => {
      const node = template.content.cloneNode(true);
      const article = node.querySelector('.api-card');
      article.dataset.id = item.id;
      node.querySelector('.type-badge').textContent = item.type;
      node.querySelector('h3').textContent = item.name;
      node.querySelector('.description').textContent = item.description;
      const badges = node.querySelector('.badges');
      badges.append(
        badge(item.auth === 'No' ? 'بدون مفتاح' : item.auth, item.auth === 'No' ? 'good' : ''),
        badge('HTTPS', item.https ? 'good' : 'warn'),
        badge(`CORS: ${item.cors}`, item.cors === 'Yes' ? 'good' : 'warn')
      );
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
    $('totalCount').textContent = items.length;
    $('noKeyCount').textContent = items.filter((item) => item.auth === 'No').length;
    $('httpsCount').textContent = items.filter((item) => item.https).length;
    $('favoriteCount').textContent = state.favorites.size;
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
    const tags = item.tags.map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`).join('');
    $('dialogContent').innerHTML = `
      <p class="kicker">${escapeHtml(item.type)}</p>
      <h2>${escapeHtml(item.name)}</h2>
      <p>${escapeHtml(item.description)}</p>
      <div class="dialog-grid">
        <div><span>المصادقة</span><strong>${escapeHtml(item.auth)}</strong></div>
        <div><span>HTTPS</span><strong>${item.https ? 'نعم' : 'لا'}</strong></div>
        <div><span>CORS</span><strong>${escapeHtml(item.cors)}</strong></div>
        <div><span>Catalog Score</span><strong>${item.score}/100</strong></div>
      </div>
      <div class="dialog-tags">${tags}</div>
      <p><strong>ملاحظة:</strong> ${escapeHtml(item.notes)}</p>
      <p class="muted">حالة التحقق: مدرج في الدليل، ولم يخضع لاختبار تشغيلي مستقل داخل التطبيق بعد.</p>
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
      generatedAt: new Date().toISOString(),
      items: items.map(({ score, ...item }) => ({ ...item, catalogScore: score })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'api-atlas-finance-catalog.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function shareApp() {
    const shareData = { title: document.title, text: 'دليل APIs المالية — API Atlas', url: location.href };
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
  document.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach((item) => item.classList.remove('active'));
    chip.classList.add('active');
    state.quickFilter = chip.dataset.filter;
    render();
  }));
  $('downloadButton').addEventListener('click', downloadCatalog);
  $('shareButton').addEventListener('click', shareApp);
  window.addEventListener('online', updateNetwork);
  window.addEventListener('offline', updateNetwork);

  populateTypes();
  updateNetwork();
  setupInstall();
  registerServiceWorker();
  render();
})();
