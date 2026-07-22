import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePositionSize, calculateSignalScore, deriveDecision, evaluateGoldenAlert } from '../src/scoring-engine.js';

const strongSignal = {
  factors: { technical: 96, volume: 98, momentum: 94, catalyst: 92, liquidity: 90, risk: 88, strategy: 97 },
  chaseRisk: 20,
  spreadPercent: 0.4,
  catalystRisk: 'low',
  shariaStatus: 'approved',
  breakoutConfirmed: true,
  relativeVolume: 3.2,
  riskReward: 2.7,
};

test('high quality setup activates Golden Alert', () => {
  const score = calculateSignalScore(strongSignal);
  const golden = evaluateGoldenAlert(strongSignal, score);
  assert.ok(score.score >= 90);
  assert.equal(golden.active, true);
  assert.equal(deriveDecision(strongSignal).code, 'golden');
});

test('pending sharia verification caps score and blocks Golden Alert', () => {
  const signal = { ...strongSignal, shariaStatus: 'pending' };
  const score = calculateSignalScore(signal);
  assert.equal(score.score, 89);
  assert.equal(evaluateGoldenAlert(signal, score).active, false);
});

test('position sizing respects risk budget', () => {
  const result = calculatePositionSize({ capital: 5000, entry: 5, stop: 4.75, riskPercent: 1 });
  assert.equal(result.riskBudget, 50);
  assert.equal(result.riskPerShare, 0.25);
  assert.equal(result.quantity, 200);
  assert.equal(result.positionValue, 1000);
});
