const sportEl = document.getElementById("sport");
const addSportEl = document.getElementById("add-sport");
const addBtn = document.getElementById("add-btn");
const promptEl = document.getElementById("prompt");
const form = document.getElementById("desk");
const runBtn = document.getElementById("run");
const noteEl = document.getElementById("note");
const betNoteEl = document.getElementById("bet-note");
const picksEl = document.getElementById("picks");
const parlaysEl = document.getElementById("parlays");
const yrfiEl = document.getElementById("yrfi");
const slateBody = document.querySelector("#slate tbody");
const metaEl = document.getElementById("meta");
const disclaimerEl = document.getElementById("disclaimer");
const accountEl = document.getElementById("account");
const stakeEl = document.getElementById("stake");
const liveEl = document.getElementById("live");
const confirmEl = document.getElementById("confirm");

const DEFAULT_PROMPT =
  "best 3 overall Kalshi picks, a 3+ SGP stack, a 4+ SGP stack, and a YRFI/NRFI MLB stack";

function fillSelect(el, sports, selected) {
  el.innerHTML = "";
  for (const sport of sports) {
    const opt = document.createElement("option");
    opt.value = sport.id;
    opt.textContent = sport.label;
    if (sport.id === selected) opt.selected = true;
    el.appendChild(opt);
  }
}

async function loadSports(keep) {
  const data = await (await fetch("/api/sports")).json();
  const selected = keep || sportEl.value || "mlb";
  fillSelect(sportEl, data.enabled, selected);
  fillSelect(addSportEl, data.addable, data.addable[0]?.id);
  addBtn.disabled = data.addable.length === 0;
  if (!data.addable.length) {
    addSportEl.innerHTML = "";
    const opt = document.createElement("option");
    opt.textContent = "All added";
    addSportEl.appendChild(opt);
  }
}

async function loadAccount() {
  const data = await (await fetch("/api/account")).json();
  const bits = [];
  bits.push(data.can_trade ? "keys loaded" : "no Kalshi keys");
  bits.push(data.live_allowed ? "LIVE enabled" : "paper only until KALSHI_LIVE=1");
  if (data.balance != null) bits.push(`cash $${Number(data.balance).toFixed(2)}`);
  if (data.error) bits.push(data.error);
  accountEl.textContent = bits.join(" · ");
}

function empty(el, text) {
  el.innerHTML = `<p class="empty">${text}</p>`;
}

function ticketFromPick(pick) {
  return {
    ticker: pick.ticker,
    contract_side: pick.contract_side,
    yes_price: pick.yes_price,
  };
}

function placeButton(tickets, label) {
  const payload = encodeURIComponent(JSON.stringify(tickets));
  return `<button type="button" class="live-btn" data-tickets="${payload}">${label}</button>`;
}

function pickCard(pick) {
  return `<article class="card">
    <div class="rank">#${pick.rank} · ${pick.game} · ${pick.market}</div>
    <h3><span class="sel">${pick.selection}</span> <span class="odds">${pick.odds_american || ""}</span></h3>
    <p>${pick.ticker || ""}</p>
    <p>${pick.why}</p>
    ${placeButton([ticketFromPick(pick)], "Place this on Kalshi")}
  </article>`;
}

function parlayCard(ticket) {
  const legs = (ticket.legs || [])
    .map((leg) => `<li>${leg.game}: <strong>${leg.selection}</strong> ${leg.odds_american || ""} · ${leg.ticker || ""}</li>`)
    .join("");
  const tickets = ticket.tickets || (ticket.legs || []).map(ticketFromPick);
  return `<article class="card">
    <div class="rank">${ticket.name} · ${ticket.leg_count} legs · ${ticket.odds_american || "n/a"}</div>
    <h3>${ticket.name}</h3>
    <ul>${legs}</ul>
    <p>${ticket.why}</p>
    ${placeButton(tickets, "Place stack on Kalshi")}
  </article>`;
}

function renderBoard(data) {
  metaEl.textContent = `Kalshi · ${data.sport_label} · ${new Date(data.generated_at).toLocaleString()}`;
  disclaimerEl.textContent = data.disclaimer || "";
  if (data.note) {
    noteEl.hidden = false;
    noteEl.textContent = data.note;
  } else {
    noteEl.hidden = true;
  }

  if (!data.picks?.length) empty(picksEl, "No Kalshi moneylines on this slate.");
  else picksEl.innerHTML = data.picks.map(pickCard).join("");

  if (!data.parlays?.length) empty(parlaysEl, "No same-game Kalshi stack.");
  else parlaysEl.innerHTML = data.parlays.map(parlayCard).join("");

  if (!data.yrfi_nrfi) empty(yrfiEl, "Need open KXMLBRFI markets.");
  else yrfiEl.innerHTML = parlayCard(data.yrfi_nrfi);

  slateBody.innerHTML = (data.slate || [])
    .map(
      (g) => `<tr>
        <td>${g.name}</td>
        <td>${g.selection || ""}</td>
        <td>${g.yes_bid ?? "—"}</td>
        <td>${g.yes_ask ?? "—"}</td>
        <td>${g.american || "—"}</td>
      </tr>`
    )
    .join("");
}

async function place(tickets) {
  betNoteEl.hidden = false;
  betNoteEl.textContent = "Sending to Kalshi…";
  const res = await fetch("/api/bet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tickets,
      stake_dollars: Number(stakeEl.value || 1),
      live: liveEl.checked,
      confirm_live: confirmEl.checked,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    betNoteEl.textContent = data.detail || "Bet failed.";
    return;
  }
  const lines = (data.results || []).map((row) => {
    if (!row.ok) return `${row.ticker}: ${row.error}`;
    if (row.mode === "PAPER") return `${row.ticker}: PAPER ${row.count} @ $${row.cost}`;
    return `${row.ticker}: LIVE fill ${row.fill_count} order ${row.order_id || "?"}`;
  });
  betNoteEl.textContent = `${data.mode}: ${lines.join(" · ")}`;
  loadAccount();
}

document.body.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-tickets]");
  if (!btn) return;
  const tickets = JSON.parse(decodeURIComponent(btn.dataset.tickets));
  if (liveEl.checked && !confirmEl.checked) {
    betNoteEl.hidden = false;
    betNoteEl.textContent = "Check I confirm live before spending Kalshi cash.";
    return;
  }
  place(tickets);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  runBtn.disabled = true;
  try {
    const res = await fetch("/api/workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sport: sportEl.value,
        prompt: promptEl.value.trim() || DEFAULT_PROMPT,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    renderBoard(await res.json());
  } catch (err) {
    noteEl.hidden = false;
    noteEl.textContent = err.message || "Workflow failed.";
  } finally {
    runBtn.disabled = false;
  }
});

addBtn.addEventListener("click", async () => {
  const sport = addSportEl.value;
  if (!sport) return;
  const res = await fetch("/api/sports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sport }),
  });
  if (!res.ok) return;
  await loadSports(sportEl.value);
});

promptEl.value = DEFAULT_PROMPT;
loadSports("mlb");
loadAccount();
