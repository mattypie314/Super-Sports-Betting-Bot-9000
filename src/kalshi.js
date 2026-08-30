import crypto from 'node:crypto';
import { findSport, toGame } from './sports.js';
import { buildBuyOrder } from './odds.js';

const PROD_HOST = 'https://external-api.kalshi.com';
const DEMO_HOST = 'https://external-api.demo.kalshi.co';

function host() {
  const env = (process.env.KALSHI_ENV || 'prod').toLowerCase();
  return env === 'demo' ? DEMO_HOST : PROD_HOST;
}

export function isConfigured() {
  return Boolean(process.env.KALSHI_API_KEY_ID && process.env.KALSHI_PRIVATE_KEY);
}

function privateKeyPem() {
  const raw = process.env.KALSHI_PRIVATE_KEY || '';
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

export function signRequest(pem, timestamp, method, path) {
  const pathWithoutQuery = path.split('?')[0];
  const message = `${timestamp}${method.toUpperCase()}${pathWithoutQuery}`;
  const key = crypto.createPrivateKey(pem);
  const signature = crypto.sign('sha256', Buffer.from(message), {
    key,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
  return signature.toString('base64');
}

async function kalshiFetch(method, path, { body, auth = false } = {}) {
  const url = `${host()}${path}`;
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';

  if (auth) {
    if (!isConfigured()) {
      const err = new Error('Kalshi API credentials are not configured.');
      err.code = 'NOT_CONFIGURED';
      throw err;
    }
    const timestamp = String(Date.now());
    const signPath = new URL(url).pathname;
    headers['KALSHI-ACCESS-KEY'] = process.env.KALSHI_API_KEY_ID;
    headers['KALSHI-ACCESS-TIMESTAMP'] = timestamp;
    headers['KALSHI-ACCESS-SIGNATURE'] = signRequest(
      privateKeyPem(),
      timestamp,
      method,
      signPath,
    );
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    const err = new Error(data.message || data.error || `Kalshi ${res.status}`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export async function getBalance() {
  const data = await kalshiFetch('GET', '/trade-api/v2/portfolio/balance', { auth: true });
  const cents = Number(data.balance);
  return {
    balanceCents: cents,
    balanceDollars: data.balance_dollars ?? (Number.isFinite(cents) ? (cents / 100).toFixed(2) : null),
    portfolioValueCents: data.portfolio_value ?? null,
  };
}

export async function getPositions() {
  const data = await kalshiFetch('GET', '/trade-api/v2/portfolio/positions?limit=50', {
    auth: true,
  });
  return data.market_positions ?? data.positions ?? [];
}

const cache = new Map();

export async function getGames(sportId) {
  const sport = findSport(sportId);
  const key = sport.seriesTicker;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < 15_000) return hit.games;

  const path = `/trade-api/v2/events?series_ticker=${encodeURIComponent(sport.seriesTicker)}&status=open&limit=40&with_nested_markets=true`;
  const data = await kalshiFetch('GET', path);
  const games = (data.events ?? []).map((event) => toGame(event, sport));
  cache.set(key, { at: now, games });
  return games;
}

export async function placeOrder({ ticker, side, count, priceDollars, orderType }) {
  const payload = buildBuyOrder({ ticker, side, count, priceDollars, orderType });
  return kalshiFetch('POST', '/trade-api/v2/portfolio/events/orders', {
    auth: true,
    body: payload,
  });
}
