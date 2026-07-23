import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = path.resolve('api-intelligence');
const source = fs.readFileSync(path.join(root, 'catalog.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const catalog = context.window.API_ATLAS_CATALOG;

test('catalog has valid metadata and a useful finance sample', () => {
  assert.equal(catalog.meta.source, 'public-apis/public-apis');
  assert.equal(catalog.meta.sourceLicense, 'MIT');
  assert.ok(catalog.items.length >= 15);
});

test('catalog ids are unique and required fields are present', () => {
  const ids = new Set();
  for (const item of catalog.items) {
    assert.match(item.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(item.id, `duplicate id: ${item.id}`));
    ids.add(item.id);
    assert.ok(item.name.length > 1);
    assert.ok(item.description.length > 10);
    assert.ok(['No', 'apiKey', 'OAuth'].includes(item.auth));
    assert.equal(item.https, true);
    assert.ok(['Yes', 'No', 'Unknown'].includes(item.cors));
    assert.match(item.docs, /^https:\/\//);
    assert.ok(Array.isArray(item.tags) && item.tags.length >= 2);
    assert.ok(item.notes.length > 10);
  }
});

test('PWA shell references live verification and guided-search assets', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const asset of ['manifest.webmanifest', 'styles.css', 'catalog.js', 'app.js', 'market-explorer.js', 'guided-search.css', 'search-router.js']) {
    assert.ok(html.includes(asset), `index is missing ${asset}`);
    assert.ok(fs.existsSync(path.join(root, asset)), `asset is missing: ${asset}`);
  }
  for (const id of ['refreshStatusButton', 'operationalCount', 'reachabilityRate', 'lastCheckedLabel', 'marketExplorer', 'symbolSelect', 'searchIntentPanel', 'searchIntentAction']) {
    assert.ok(html.includes(`id="${id}"`), `live UI is missing ${id}`);
  }
  assert.ok(html.includes('وليس رمز سهم'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.length >= 1);
});

test('ticker router distinguishes stock symbols from API searches', () => {
  const router = fs.readFileSync(path.join(root, 'search-router.js'), 'utf8');
  assert.ok(router.includes('/^[A-Z][A-Z0-9.-]{0,7}$/'));
  assert.ok(router.includes('symbolSelect.dispatchEvent'));
  assert.ok(router.includes('marketExplorer.scrollIntoView'));
  assert.ok(router.includes("event.key === 'Enter'"));
});

test('live-status is either an honest fallback or a complete verified snapshot', () => {
  const status = JSON.parse(fs.readFileSync(path.join(root, 'live-status.json'), 'utf8'));
  const validStatuses = new Set(['operational', 'restricted', 'degraded', 'unavailable']);

  assert.equal(status.schemaVersion, 1);
  assert.equal(status.summary.total, catalog.items.length);

  if (status.generatedAt === null) {
    assert.deepEqual(status.services, {});
    assert.equal(status.summary.operational, 0);
    assert.equal(status.summary.restricted, 0);
    assert.equal(status.summary.degraded, 0);
    assert.equal(status.summary.unavailable, 0);
    return;
  }

  assert.ok(Number.isFinite(Date.parse(status.generatedAt)), 'generatedAt must be a valid timestamp');
  assert.equal(Object.keys(status.services).length, catalog.items.length);

  for (const item of catalog.items) {
    const result = status.services[item.id];
    assert.ok(result, `missing live result for ${item.id}`);
    assert.equal(result.id, item.id);
    assert.ok(validStatuses.has(result.status), `invalid status for ${item.id}`);
    assert.ok(Number.isFinite(result.latencyMs) && result.latencyMs >= 0);
    assert.ok(Number.isFinite(Date.parse(result.checkedAt)), `invalid checkedAt for ${item.id}`);
  }

  const classifiedTotal = status.summary.operational
    + status.summary.restricted
    + status.summary.degraded
    + status.summary.unavailable;
  assert.equal(classifiedTotal, status.summary.total);
  assert.ok(status.summary.operationalRate >= 0 && status.summary.operationalRate <= 100);
  assert.ok(status.summary.reachabilityRate >= 0 && status.summary.reachabilityRate <= 100);
});

test('service worker uses network-first for live data and caches guided search', () => {
  const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  for (const asset of ['./index.html', './styles.css', './catalog.js', './app.js', './market-explorer.js', './guided-search.css', './search-router.js', './manifest.webmanifest', './live-status.json', './market-data.json']) {
    assert.ok(serviceWorker.includes(asset), `service worker is missing ${asset}`);
  }
  assert.ok(serviceWorker.includes("endsWith('/live-status.json')"));
  assert.ok(serviceWorker.includes("endsWith('/market-data.json')"));
  assert.ok(serviceWorker.includes('networkFirst'));
});
