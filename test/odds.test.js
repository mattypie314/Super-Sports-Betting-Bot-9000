import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dollarsToAmerican,
  dollarsToPercentLabel,
  parsePriceDollars,
  buildBuyOrder,
  orderCost,
} from '../src/odds.js';

test('dollarsToPercentLabel matches Kalshi pills', () => {
  assert.equal(dollarsToPercentLabel(0.32), '32%');
  assert.equal(dollarsToPercentLabel(0.69), '69%');
});

test('parsePriceDollars accepts cents or dollars', () => {
  assert.equal(parsePriceDollars(32), 0.32);
  assert.equal(parsePriceDollars('47%'), 0.47);
  assert.equal(parsePriceDollars('0.53'), 0.53);
});

test('dollarsToAmerican converts a 63¢ favorite', () => {
  assert.equal(dollarsToAmerican(0.63), -170);
});

test('buildBuyOrder yes quick is an IOC bid', () => {
  const order = buildBuyOrder({
    ticker: 'KXMLBGAME-MIA',
    side: 'yes',
    count: 10,
    priceDollars: 0.32,
    orderType: 'quick',
  });
  assert.deepEqual(order, {
    ticker: 'KXMLBGAME-MIA',
    side: 'bid',
    count: '10.00',
    price: '0.3200',
    time_in_force: 'immediate_or_cancel',
    self_trade_prevention_type: 'taker_at_cross',
  });
});

test('buildBuyOrder no limit is a GTC ask at 1-price', () => {
  const order = buildBuyOrder({
    ticker: 'KXMLBGAME-MIA',
    side: 'no',
    count: 5,
    priceDollars: 0.68,
    orderType: 'limit',
  });
  assert.equal(order.side, 'ask');
  assert.equal(order.price, '0.3200');
  assert.equal(order.time_in_force, 'good_till_canceled');
});

test('orderCost is contracts times price', () => {
  assert.equal(orderCost(10, 0.32), 3.2);
});

test('buildBuyOrder rejects a bad price', () => {
  assert.throws(() =>
    buildBuyOrder({ ticker: 'X', side: 'yes', count: 1, priceDollars: 1, orderType: 'limit' }),
  );
});
