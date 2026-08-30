import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { signRequest, isConfigured } from '../src/kalshi.js';
import { teamColor, toGame, findSport } from '../src/sports.js';

test('isConfigured is false without env secrets', () => {
  assert.equal(isConfigured(), false);
});

test('signRequest produces a verifiable RSA-PSS signature', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const timestamp = '1703123456789';
  const method = 'GET';
  const path = '/trade-api/v2/portfolio/balance?foo=1';
  const sig = signRequest(pem, timestamp, method, path);
  const ok = crypto.verify(
    'sha256',
    Buffer.from(`${timestamp}${method}/trade-api/v2/portfolio/balance`),
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    },
    Buffer.from(sig, 'base64'),
  );
  assert.equal(ok, true);
});

test('toGame maps Kalshi event markets into Yes/No rows', () => {
  const sport = findSport('mlb');
  const game = toGame(
    {
      event_ticker: 'KXMLBGAME-MIAWSH',
      title: 'Miami vs Washington',
      markets: [
        {
          ticker: 'KXMLBGAME-MIAWSH-MIA',
          yes_sub_title: 'Miami',
          title: 'Miami wins',
          status: 'active',
          yes_ask_dollars: '0.3200',
          no_ask_dollars: '0.6800',
          volume_fp: '1809',
        },
        {
          ticker: 'KXMLBGAME-MIAWSH-WSH',
          yes_sub_title: 'Washington',
          title: 'Washington wins',
          status: 'active',
          yes_ask_dollars: '0.6900',
          no_ask_dollars: '0.3100',
          volume_fp: '100',
        },
      ],
    },
    sport,
  );
  assert.equal(game.title, 'Miami vs Washington');
  assert.equal(game.markets[0].name, 'Miami');
  assert.equal(game.markets[0].yesAsk, 0.32);
  assert.equal(game.markets[1].noAsk, 0.31);
  assert.equal(game.volume, 1909);
  assert.ok(teamColor('Miami').startsWith('#'));
});
