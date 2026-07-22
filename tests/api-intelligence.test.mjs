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
    assert.ok(!ids.has(item.id), `duplicate id: ${item.id}`);
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

test('PWA shell references live verification assets', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const asset of ['manifest.webmanifest', 'styles.css', 'catalog.js', 'app.js']) {
    assert.ok(html.includes(asset), `index is missing ${asset}`);
    assert.ok(fs.existsSync(path.join(root, asset)), `asset is missing: ${asset}`);
  }
  for (const id of ['refreshStatusButton', 'operationalCount', 'reachabilityRate', 'lastCheckedLabel']) {
    assert.ok(html.includes(`id="${id}"`), `live UI is missing ${id}`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.length >= 1);
});

test('fallback live-status file never invents provider results', () => {
  const status = JSON.parse(fs.readFileSync(path.join(root, 'live-status.json'), 'utf8'));
  assert.equal(status.schemaVersion, 1);
  assert.equal(status.generatedAt, null);
  assert.deepEqual(status.services, {});
  assert.equal(status.summary.total, catalog.items.length);
});

test('service worker uses network-first for live status', () => {
  const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  for (const asset of ['./index.html', './styles.css', './catalog.js', './app.js', './manifest.webmanifest', './live-status.json']) {
    assert.ok(serviceWorker.includes(asset), `service worker is missing ${asset}`);
  }
  assert.ok(serviceWorker.includes("endsWith('/live-status.json')"));
  assert.ok(serviceWorker.includes('networkFirst'));
});
