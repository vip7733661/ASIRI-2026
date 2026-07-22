import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyStatus, parseArgs, summarize } from '../scripts/check-api-health.mjs';

test('classifyStatus distinguishes healthy, restricted and failed services', () => {
  assert.equal(classifyStatus(200), 'operational');
  assert.equal(classifyStatus(302), 'operational');
  assert.equal(classifyStatus(401), 'restricted');
  assert.equal(classifyStatus(403), 'restricted');
  assert.equal(classifyStatus(429), 'restricted');
  assert.equal(classifyStatus(503), 'degraded');
  assert.equal(classifyStatus(0, 'timeout'), 'degraded');
  assert.equal(classifyStatus(0, 'network'), 'unavailable');
  assert.equal(classifyStatus(404), 'unavailable');
});

test('summarize calculates transparent live rates', () => {
  const summary = summarize([
    { status: 'operational' },
    { status: 'operational' },
    { status: 'restricted' },
    { status: 'degraded' }
  ]);
  assert.deepEqual(summary, {
    total: 4,
    operational: 2,
    restricted: 1,
    degraded: 1,
    unavailable: 0,
    operationalRate: 50,
    reachabilityRate: 75
  });
});

test('parseArgs accepts workflow overrides', () => {
  const args = parseArgs([
    '--catalog', 'x/catalog.js',
    '--output', 'x/status.json',
    '--timeout-ms', '9000',
    '--concurrency', '2'
  ]);
  assert.equal(args.catalog, 'x/catalog.js');
  assert.equal(args.output, 'x/status.json');
  assert.equal(args.timeoutMs, 9000);
  assert.equal(args.concurrency, 2);
});
