import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html=fs.readFileSync('api-intelligence/index.html','utf8');
const js=fs.readFileSync('api-intelligence/golden-alert.js','utf8');
const css=fs.readFileSync('api-intelligence/golden-alert.css','utf8');

test('Golden Alert Center is wired into the product',()=>{
  for(const id of ['goldenAlerts','enableAlerts','refreshAlerts','goldenBuyList','portfolioAlertList','alertFreshness']) assert.ok(html.includes(`id="${id}"`),`missing ${id}`);
  assert.ok(html.includes('golden-alert.css'));
  assert.ok(html.includes('golden-alert.js'));
});

test('Golden buy requires trend, volume, RSI, quality and fresh data',()=>{
  assert.ok(js.includes("s.quality.score<90"));
  assert.ok(js.includes("s.latestClose>s.sma20"));
  assert.ok(js.includes("s.sma20>s.sma50"));
  assert.ok(js.includes("rv>=1.15"));
  assert.ok(js.includes("s.rsi14<=68"));
  assert.ok(js.includes('dataAgeHours()<=freshWindowHours()'));
});

test('alerts are deduplicated locally and remain read-only',()=>{
  assert.ok(js.includes('ALERT_KEY'));
  assert.ok(js.includes('new Notification'));
  assert.ok(!js.includes('placeOrder'));
  assert.ok(!js.includes('broker'));
  assert.ok(css.includes('@media(max-width:620px)'));
});