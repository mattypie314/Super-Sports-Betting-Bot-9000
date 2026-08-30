import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SPORTS } from './sports.js';
import { getBalance, getGames, getPositions, isConfigured, placeOrder } from './kalshi.js';
import { orderCost, parsePriceDollars } from './odds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

function sendError(res, err) {
  const status = err.code === 'NOT_CONFIGURED' ? 503 : err.status || 400;
  res.status(status).json({
    error: err.message,
    configured: isConfigured(),
  });
}

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'super-sports-betting-bot-9000',
      kalshi: isConfigured() ? 'connected' : 'needs_credentials',
    });
  });

  app.get('/api/sports', (req, res) => {
    res.json({ sports: SPORTS.map(({ id, label, category, icon }) => ({ id, label, category, icon })) });
  });

  app.get('/api/games', async (req, res) => {
    try {
      const games = await getGames(req.query.sport || 'mlb');
      res.json({ games });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/balance', async (req, res) => {
    if (!isConfigured()) {
      res.json({ configured: false, balanceDollars: null });
      return;
    }
    try {
      const balance = await getBalance();
      res.json({ configured: true, ...balance });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/positions', async (req, res) => {
    if (!isConfigured()) {
      res.json({ configured: false, positions: [] });
      return;
    }
    try {
      const positions = await getPositions();
      res.json({ configured: true, positions });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/order', async (req, res) => {
    try {
      const { ticker, side, count, price, orderType } = req.body ?? {};
      const priceDollars = parsePriceDollars(price);
      const result = await placeOrder({
        ticker,
        side,
        count,
        priceDollars,
        orderType,
      });
      res.status(201).json({
        order: result,
        cost: orderCost(count, priceDollars),
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createApp();
  app.listen(PORT, HOST, () => {
    console.log(`Super-Sports-Betting-Bot-9000 listening on http://${HOST}:${PORT}`);
  });
}
