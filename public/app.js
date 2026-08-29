const state = {
  picks: [],
  slip: [], // array of pick ids
};

const fmtOdds = (n) => (n > 0 ? `+${n}` : `${n}`);
const fmtPct = (p) => `${(p * 100).toFixed(1)}%`;
const fmtMoney = (n) => `$${n.toFixed(2)}`;

async function loadPicks() {
  const res = await fetch('/api/picks');
  const data = await res.json();
  state.picks = data.picks;
  renderPicks();
}

function renderPicks() {
  const el = document.getElementById('picks');
  el.innerHTML = '';
  for (const p of state.picks) {
    const added = state.slip.includes(p.id);
    const div = document.createElement('div');
    div.className = `pick${added ? ' added' : ''}`;
    div.dataset.id = p.id;
    const edgeClass = p.edge > 0 ? 'edge pos' : 'edge';
    div.innerHTML = `
      <div>
        <div class="league">${p.league}</div>
        <div class="sel">${p.selection}</div>
        <div class="matchup">${p.matchup}</div>
      </div>
      <div style="text-align:right">
        <div class="odds">${fmtOdds(p.american)}</div>
        <div class="${edgeClass}">edge ${(p.edge * 100).toFixed(1)}%</div>
      </div>`;
    div.addEventListener('click', () => toggleLeg(p.id));
    el.appendChild(div);
  }
}

function toggleLeg(id) {
  if (state.slip.includes(id)) return; // added picks stay until removed from slip
  state.slip.push(id);
  renderPicks();
  renderSlip();
  calculate();
}

function removeLeg(id) {
  state.slip = state.slip.filter((x) => x !== id);
  renderPicks();
  renderSlip();
  calculate();
}

function renderSlip() {
  const el = document.getElementById('slip');
  if (state.slip.length === 0) {
    el.innerHTML = '<p class="empty">No legs yet — add picks from the left.</p>';
    return;
  }
  el.innerHTML = '';
  for (const id of state.slip) {
    const p = state.picks.find((x) => x.id === id);
    const div = document.createElement('div');
    div.className = 'leg';
    div.innerHTML = `<span>${p.selection} <b>${fmtOdds(p.american)}</b></span>
      <button class="rm" title="remove">✕</button>`;
    div.querySelector('.rm').addEventListener('click', () => removeLeg(id));
    el.appendChild(div);
  }
}

async function calculate() {
  const resultEl = document.getElementById('result');
  const errorEl = document.getElementById('error');
  errorEl.classList.add('hidden');

  if (state.slip.length === 0) {
    resultEl.classList.add('hidden');
    return;
  }

  const legs = state.slip.map((id) => {
    const p = state.picks.find((x) => x.id === id);
    return { american: p.american };
  });
  const stake = Number(document.getElementById('stake').value) || 10;

  const res = await fetch('/api/parlay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ legs, stake }),
  });
  const data = await res.json();
  if (!res.ok) {
    errorEl.textContent = data.error || 'Something went wrong.';
    errorEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    return;
  }

  const r = data.parlay;
  document.getElementById('r-legs').textContent = r.legs;
  document.getElementById('r-american').textContent = fmtOdds(r.american);
  document.getElementById('r-decimal').textContent = r.decimal.toFixed(3);
  document.getElementById('r-prob').textContent = fmtPct(r.impliedProbability);
  document.getElementById('r-payout').textContent = fmtMoney(r.payout);
  document.getElementById('r-profit').textContent = fmtMoney(r.profit);
  resultEl.classList.remove('hidden');
}

async function suggest() {
  const res = await fetch('/api/suggested-parlay?size=3');
  const data = await res.json();
  state.slip = data.legs.map((l) => l.id);
  renderPicks();
  renderSlip();
  calculate();
}

document.getElementById('stake').addEventListener('input', calculate);
document.getElementById('suggest-btn').addEventListener('click', suggest);

loadPicks();
