import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve('api-intelligence/execution-desk');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

test('execution desk is an isolated Saxo SIM surface', () => {
  assert.match(html, /Asiri Execution Desk/);
  assert.match(html, /Saxo SIM/);
  assert.match(html, /LIVE LOCKED/);
  assert.match(html, /لا ترسل هذه الصفحة أي أمر حقيقي/);
  assert.ok(html.includes('../market-data.json') === false, 'data URL belongs in JavaScript, not inline HTML');
});

test('confirmed order workflow includes risk and duplicate gates', () => {
  for (const required of [
    'MAX_MARKET_AGE_HOURS',
    'Kill Switch',
    'duplicateOrder',
    'maxRiskPercent',
    'maxOrderValue',
    'confirmPhrase',
    "liveSubmissionAllowed: false",
    "status: 'SIM_QUEUED'",
    "orderType !== 'Limit'"
  ]) assert.ok(app.includes(required), `missing safety gate: ${required}`);
});

test('Saxo secrets and live endpoints are not embedded', () => {
  const combined = `${html}\n${app}\n${css}`;
  assert.ok(!/AppSecret|access_token|refresh_token|client_secret/i.test(combined));
  assert.ok(!combined.includes('https://gateway.saxobank.com/openapi/trade'));
  assert.ok(app.includes('../market-data.json'));
});

test('mobile layout is supported', () => {
  assert.ok(css.includes('@media(max-width:680px)'));
  assert.ok(css.includes('grid-template-columns:1fr'));
});
