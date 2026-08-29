import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  americanToDecimal,
  decimalToAmerican,
  impliedProbability,
  calculateParlay,
} from '../src/odds.js';

test('americanToDecimal handles favorites and underdogs', () => {
  assert.equal(americanToDecimal(100), 2);
  assert.equal(americanToDecimal(-200), 1.5);
  assert.equal(americanToDecimal(150), 2.5);
});

test('decimalToAmerican is the inverse of americanToDecimal', () => {
  for (const odds of [-250, -110, 100, 120, 300]) {
    assert.equal(decimalToAmerican(americanToDecimal(odds)), odds);
  }
});

test('impliedProbability is between 0 and 1', () => {
  const p = impliedProbability(-110);
  assert.ok(p > 0 && p < 1);
  assert.ok(Math.abs(p - 0.5238) < 0.001);
});

test('calculateParlay multiplies decimal odds and computes payout', () => {
  const parlay = calculateParlay(
    [{ american: 100 }, { american: 100 }],
    10,
  );
  // 2.0 * 2.0 = 4.0 decimal -> +300 american
  assert.equal(parlay.decimal, 4);
  assert.equal(parlay.american, 300);
  assert.equal(parlay.payout, 40);
  assert.equal(parlay.profit, 30);
  assert.equal(parlay.legs, 2);
});

test('calculateParlay rejects empty legs and bad stake', () => {
  assert.throws(() => calculateParlay([], 10));
  assert.throws(() => calculateParlay([{ american: 100 }], -5));
  assert.throws(() => calculateParlay([{ american: 0 }], 10));
});
