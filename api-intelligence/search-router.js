(() => {
  'use strict';

  const searchInput = document.getElementById('searchInput');
  const panel = document.getElementById('searchIntentPanel');
  const message = document.getElementById('searchIntentMessage');
  const action = document.getElementById('searchIntentAction');
  const symbolSelect = document.getElementById('symbolSelect');
  const marketExplorer = document.getElementById('marketExplorer');

  if (!searchInput || !panel || !message || !action || !symbolSelect || !marketExplorer) return;

  function availableSymbols() {
    return [...symbolSelect.options].map((option) => option.value).filter(Boolean);
  }

  function detectTicker(value) {
    const candidate = value.trim().toUpperCase();
    return /^[A-Z][A-Z0-9.-]{0,7}$/.test(candidate) ? candidate : '';
  }

  function hidePanel() {
    panel.hidden = true;
    action.dataset.symbol = '';
  }

  function updatePanel() {
    const ticker = detectTicker(searchInput.value);
    if (!ticker) {
      hidePanel();
      return;
    }

    const symbols = availableSymbols();
    const supported = symbols.includes(ticker);
    panel.hidden = false;
    panel.dataset.tone = supported ? 'success' : 'info';
    action.dataset.symbol = supported ? ticker : '';
    action.textContent = supported ? `عرض بيانات ${ticker}` : 'الانتقال إلى مستكشف الأسهم';
    message.textContent = supported
      ? `${ticker} رمز سهم متوفر في مستكشف السوق، وليس اسم مزوّد API.`
      : `${ticker} يبدو كرمز سهم. بحث هذه المنطقة مخصص لمزوّدي API؛ جرّب اختيار سهم من مستكشف السوق.`;
  }

  function openMarketExplorer() {
    const ticker = action.dataset.symbol;
    if (ticker && availableSymbols().includes(ticker)) {
      symbolSelect.value = ticker;
      symbolSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    hidePanel();
    marketExplorer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  searchInput.addEventListener('input', updatePanel);
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !panel.hidden) {
      event.preventDefault();
      openMarketExplorer();
    }
  });
  action.addEventListener('click', openMarketExplorer);

  const observer = new MutationObserver(updatePanel);
  observer.observe(symbolSelect, { childList: true });
})();
