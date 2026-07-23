import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve('api-intelligence');

test('market explorer UI exposes verified-data controls', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const id of [
    'marketExplorer', 'symbolSelect', 'refreshMarketDataButton', 'marketDataState',
    'marketPrice', 'marketChange', 'marketChart', 'marketQuality', 'sessionsBody'
  ]) {
    assert.ok(html.includes(`id="${id}"`), `missing market explorer id: ${id}`);
  }
  assert.ok(html.includes('market-explorer.css'));
  assert.ok(html.includes('market-explorer.js'));
});

test('market data is either an honest fallback or a complete verified snapshot', () => {
  const payload = JSON.parse(fs.readFileSync(path.join(root, 'market-data.json'), 'utf8'));
  assert.equal(payload.schemaVersion, 1);
  assert.ok(payload.source && typeof payload.source.name === 'string');

  if (payload.generatedAt === null) {
    assert.deepEqual(payload.symbols, {});
    assert.ok(payload.disclaimer.includes('لا تظهر'));
    return;
  }

  assert.ok(Number.isFinite(Date.parse(payload.generatedAt)), 'generatedAt must be valid');
  const symbols = Object.entries(payload.symbols || {});
  assert.ok(symbols.length >= 5, 'verified snapshot must contain at least five symbols');

  for (const [symbol, data] of symbols) {
    assert.equal(data.symbol, symbol);
    assert.ok(Number.isFinite(data.latestClose) && data.latestClose > 0, `invalid close for ${symbol}`);
    assert.ok(Number.isFinite(data.previousClose) && data.previousClose > 0, `invalid previous close for ${symbol}`);
    assert.ok(Number.isFinite(Date.parse(`${data.latestDate}T00:00:00Z`)), `invalid latest date for ${symbol}`);
    assert.ok(Array.isArray(data.sessions) && data.sessions.length >= 20, `insufficient sessions for ${symbol}`);
    assert.ok(Number.isFinite(data.quality?.score) && data.quality.score >= 0 && data.quality.score <= 100);
  }
});

test('service worker refreshes market payload network-first', () => {
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.ok(worker.includes('./market-data.json'));
  assert.ok(worker.includes("endsWith('/market-data.json')"));
  assert.ok(worker.includes('networkFirst'));
});

test('market explorer client does not contain static quote values', () => {
  const client = fs.readFileSync(path.join(root, 'market-explorer.js'), 'utf8');
  assert.ok(client.includes('fetch(`market-data.json'));
  assert.ok(client.includes('لا توجد أرقام تجريبية'));
  assert.ok(!client.includes('ASR-A'));
});
