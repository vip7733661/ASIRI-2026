import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync('api-intelligence/index.html','utf8');
const client = fs.readFileSync('api-intelligence/asiri-os.js','utf8');
const worker = fs.readFileSync('api-intelligence/sw.js','utf8');

test('OS v1 exposes portfolio and decision modules', () => {
  for (const id of ['asiriOS','osPositionForm','osPortfolioBody','osOpportunities','osMarketRegime','osPnl']) {
    assert.ok(html.includes(`id="${id}"`), `missing ${id}`);
  }
  assert.ok(html.includes('asiri-os.css'));
  assert.ok(html.includes('asiri-os.js'));
});

test('decision center is read-only and data-gated', () => {
  assert.ok(client.includes("localStorage"));
  assert.ok(client.includes("quality.score < 80"));
  assert.ok(client.includes("market-data.json"));
  assert.ok(!client.includes('broker'));
  assert.ok(!client.includes('sendOrder'));
});

test('PWA caches OS assets', () => {
  assert.ok(worker.includes('./asiri-os.css'));
  assert.ok(worker.includes('./asiri-os.js'));
  assert.ok(worker.includes('asiri-intelligence-os-v1'));
});
