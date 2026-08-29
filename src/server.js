import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { calculateParlay } from './odds.js';
import { listPicks, suggestParlay } from './picks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'super-sports-betting-bot-9000' });
  });

  app.get('/api/picks', (req, res) => {
    res.json({ picks: listPicks() });
  });

  app.get('/api/suggested-parlay', (req, res) => {
    const size = Number(req.query.size) || 3;
    const legs = suggestParlay(size);
    try {
      const parlay = calculateParlay(legs, Number(req.query.stake) || 10);
      res.json({ legs, parlay });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/parlay', (req, res) => {
    const { legs, stake } = req.body ?? {};
    try {
      const parlay = calculateParlay(legs, stake);
      res.json({ parlay });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));

  return app;
}

// Only start listening when run directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createApp();
  app.listen(PORT, HOST, () => {
    console.log(`Super-Sports-Betting-Bot-9000 listening on http://${HOST}:${PORT}`);
  });
}
