const state = {
  sport: 'mlb',
  sports: [],
  games: [],
  selectedEvent: null,
  selected: null, // { ticker, name, yesAsk, noAsk }
  side: 'yes',
  orderType: 'quick',
  configured: false,
};

const ICONS = {
  baseball: '⚾',
  football: '🏈',
  basketball: '🏀',
  hockey: '🏒',
  soccer: '⚽',
};

const $ = (id) => document.getElementById(id);

const fmtMoney = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};

const fmtVol = (n) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M vol`;
  if (v >= 1_000) return `$${Math.round(v).toLocaleString()} vol`;
  return `$${Math.round(v)} vol`;
};

const pct = (dollars) => (dollars == null ? '—' : `${Math.round(Number(dollars) * 100)}%`);

function askFor(side, market) {
  return side === 'yes' ? market.yesAsk : market.noAsk;
}

async function loadSports() {
  const res = await fetch('/api/sports');
  const data = await res.json();
  state.sports = data.sports;
  const nav = $('sports');
  nav.innerHTML = '';
  for (const s of state.sports) {
    const btn = document.createElement('button');
    btn.className = `sport${s.id === state.sport ? ' on' : ''}`;
    btn.textContent = s.label;
    btn.addEventListener('click', () => selectSport(s.id));
    nav.appendChild(btn);
  }
}

async function loadBalance() {
  const res = await fetch('/api/balance');
  const data = await res.json();
  state.configured = Boolean(data.configured);
  const wrap = $('cash');
  const amt = $('cash-amt');
  if (data.configured && data.balanceDollars != null) {
    wrap.classList.remove('off');
    amt.textContent = fmtMoney(data.balanceDollars);
  } else {
    wrap.classList.add('off');
    amt.textContent = 'Connect Kalshi';
  }
}

async function loadGames() {
  $('feed-meta').textContent = 'Loading…';
  const res = await fetch(`/api/games?sport=${encodeURIComponent(state.sport)}`);
  const data = await res.json();
  state.games = data.games || [];
  renderGames();
}

function selectSport(id) {
  state.sport = id;
  state.selectedEvent = null;
  state.selected = null;
  document.querySelectorAll('.sport').forEach((el, i) => {
    el.classList.toggle('on', state.sports[i]?.id === id);
  });
  $('order').classList.add('hidden');
  $('market-rows').innerHTML = '';
  $('ticket-event').textContent = 'Pick a price to trade';
  loadGames();
}

function renderGames() {
  const host = $('games');
  host.innerHTML = '';
  $('feed-empty').classList.toggle('hidden', state.games.length > 0);
  const sport = state.sports.find((s) => s.id === state.sport);
  $('feed-meta').textContent = sport ? sport.category : '';

  for (const game of state.games) {
    const card = document.createElement('article');
    card.className = `card${state.selectedEvent === game.eventTicker ? ' on' : ''}`;
    const rows = game.markets
      .map(
        (m) => `
        <div class="team">
          <div class="glove" style="color:${m.color}">${ICONS[game.icon] || '•'}</div>
          <div class="team-meta">
            <div class="team-name">${m.name}</div>
            <div class="underline" style="background:${m.color}"></div>
          </div>
          <div class="pills">
            <button class="pill yes${isOn(m.ticker, 'yes')}" data-ticker="${m.ticker}" data-side="yes">${pct(m.yesAsk)}</button>
          </div>
        </div>`,
      )
      .join('');

    card.innerHTML = `
      <div class="card-top">
        <div class="sport-ico">${ICONS[game.icon] || '•'}</div>
        <div>
          <div class="card-title">${game.title}</div>
          <div class="card-sub"><span>${game.category}</span></div>
        </div>
      </div>
      ${rows}
      <div class="card-foot"><span>${fmtVol(game.volume)}</span></div>`;

    card.querySelectorAll('.pill').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openMarket(game, btn.dataset.ticker, btn.dataset.side);
      });
    });
    card.addEventListener('click', () => openEvent(game));
    host.appendChild(card);
  }
}

function isOn(ticker, side) {
  return state.selected?.ticker === ticker && state.side === side ? ' on' : '';
}

function openEvent(game) {
  state.selectedEvent = game.eventTicker;
  $('ticket-event').textContent = game.title;
  renderMarketRows(game);
  renderGames();
}

function openMarket(game, ticker, side) {
  const market = game.markets.find((m) => m.ticker === ticker);
  if (!market) return;
  state.selectedEvent = game.eventTicker;
  state.selected = market;
  state.side = side;
  $('ticket-event').textContent = game.title;
  $('order').classList.remove('hidden');
  $('price').value = Math.round(askFor(side, market) * 100);
  renderMarketRows(game);
  renderGames();
  updateQuote();
  updatePlace();
}

function renderMarketRows(game) {
  const host = $('market-rows');
  host.innerHTML = '';
  for (const m of game.markets) {
    const row = document.createElement('div');
    row.className = 'mrow';
    row.innerHTML = `
      <div class="glove" style="color:${m.color}">${ICONS[game.icon] || '•'}</div>
      <div class="team-meta">
        <div class="team-name">${m.name}</div>
        <div class="underline" style="background:${m.color}"></div>
      </div>
      <div class="pills">
        <button class="pill yes${isOn(m.ticker, 'yes')}" data-side="yes">${pct(m.yesAsk)}</button>
        <button class="pill no${isOn(m.ticker, 'no')}" data-side="no">${pct(m.noAsk)}</button>
      </div>`;
    row.querySelectorAll('.pill').forEach((btn) => {
      btn.addEventListener('click', () => openMarket(game, m.ticker, btn.dataset.side));
    });
    host.appendChild(row);
  }
}

function updateQuote() {
  const count = Number($('contracts').value) || 0;
  const cents = Number($('price').value);
  const dollars = cents / 100;
  $('cost').textContent = fmtMoney(count * dollars);
  $('payout').textContent = fmtMoney(count);
  $('price').disabled = state.orderType === 'quick';
}

function updatePlace() {
  const btn = $('place');
  btn.classList.toggle('no-side', state.side === 'no');
  const label = state.orderType === 'quick' ? 'Quick' : 'Limit';
  btn.textContent = state.configured
    ? `${label} ${state.side === 'yes' ? 'Yes' : 'No'}`
    : 'Add Kalshi API keys';
  $('side-yes').classList.toggle('on', state.side === 'yes');
  $('side-no').classList.toggle('on', state.side === 'no');
  $('type-quick').classList.toggle('on', state.orderType === 'quick');
  $('type-limit').classList.toggle('on', state.orderType === 'limit');
}

function showMsg(text, ok) {
  const el = $('order-msg');
  el.textContent = text;
  el.className = `msg ${ok ? 'ok' : 'bad'}`;
}

async function placeOrder() {
  if (!state.selected) return;
  const count = Number($('contracts').value);
  const cents = Number($('price').value);
  showMsg('', true);
  $('place').disabled = true;
  try {
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker: state.selected.ticker,
        side: state.side,
        count,
        price: cents,
        orderType: state.orderType,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMsg(data.error || 'Order failed', false);
      return;
    }
    showMsg(`Order in · ${data.order?.order_id || 'submitted'}`, true);
    loadBalance();
  } catch (err) {
    showMsg(err.message, false);
  } finally {
    $('place').disabled = false;
  }
}

async function loadPositions() {
  const res = await fetch('/api/positions');
  const data = await res.json();
  const host = $('positions');
  const rows = data.positions || [];
  if (!rows.length) {
    host.innerHTML = `<p class="muted">${data.configured ? 'No open positions.' : 'Connect Kalshi to see positions.'}</p>`;
    return;
  }
  host.innerHTML = rows
    .map((p) => {
      const ticker = p.ticker || p.market_ticker || 'Position';
      const qty = p.position_fp || p.position || p.quantity || 0;
      return `<div class="pos"><b>${ticker}</b>${qty} contracts</div>`;
    })
    .join('');
}

$('side-yes').addEventListener('click', () => {
  if (!state.selected) return;
  state.side = 'yes';
  $('price').value = Math.round(askFor('yes', state.selected) * 100);
  updateQuote();
  updatePlace();
  const game = state.games.find((g) => g.eventTicker === state.selectedEvent);
  if (game) renderMarketRows(game);
});
$('side-no').addEventListener('click', () => {
  if (!state.selected) return;
  state.side = 'no';
  $('price').value = Math.round(askFor('no', state.selected) * 100);
  updateQuote();
  updatePlace();
  const game = state.games.find((g) => g.eventTicker === state.selectedEvent);
  if (game) renderMarketRows(game);
});
$('type-quick').addEventListener('click', () => {
  state.orderType = 'quick';
  if (state.selected) $('price').value = Math.round(askFor(state.side, state.selected) * 100);
  updateQuote();
  updatePlace();
});
$('type-limit').addEventListener('click', () => {
  state.orderType = 'limit';
  updateQuote();
  updatePlace();
});
$('contracts').addEventListener('input', updateQuote);
$('price').addEventListener('input', updateQuote);
$('place').addEventListener('click', placeOrder);

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === tab));
    const markets = tab.dataset.tab === 'markets';
    $('panel-markets').classList.toggle('hidden', !markets);
    $('panel-positions').classList.toggle('hidden', markets);
    if (!markets) loadPositions();
  });
});

await loadSports();
await loadBalance();
await loadGames();
