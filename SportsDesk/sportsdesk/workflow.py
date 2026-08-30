from __future__ import annotations

from datetime import datetime, timezone

from sportsdesk.catalog import resolve_sport
from sportsdesk.kalshi import KalshiClient
from sportsdesk.markets import Contract, dollars_to_american, format_american, load_sport_book


def _confidence(mid: float | None) -> float:
    if mid is None:
        return 1.0
    # Prefer contracts that are not 1¢ locks and not coin-flips with a wide book.
    edge = abs(mid - 0.5)
    if mid < 0.08 or mid > 0.92:
        return 10.0 + edge * 10
    return round(40.0 + (1.0 - abs(mid - 0.62)) * 50.0, 1)


def _action(contract: Contract) -> tuple[str, float | None, str]:
    """Pick YES or NO from the mid. Return side, cost, label."""
    mid = contract.mid
    if mid is None:
        return "yes", contract.take_yes, contract.selection
    if mid >= 0.5:
        return "yes", contract.take_yes, contract.selection
    return "no", contract.take_no, f"No · {contract.selection}"


def _leg(contract: Contract, extra_why: str = "") -> dict:
    side, cost, label = _action(contract)
    ticket = contract.as_ticket(side)
    ticket["confidence"] = _confidence(contract.mid)
    ticket["why"] = extra_why or (
        f"Kalshi {contract.market}: {label} at {ticket.get('odds_american') or 'n/a'} "
        f"(yes {contract.yes_bid}->{contract.yes_ask})."
    )
    ticket["cost"] = cost
    return ticket


def best_three(game_contracts: list[Contract]) -> list[dict]:
    scored = []
    used: set[str] = set()
    ranked = sorted(game_contracts, key=lambda c: _confidence(c.mid), reverse=True)
    for contract in ranked:
        if contract.game_key in used:
            continue
        if contract.mid is not None and (contract.mid < 0.08 or contract.mid > 0.95):
            continue
        used.add(contract.game_key)
        scored.append(contract)
        if len(scored) == 3:
            break
    return [
        {"rank": i + 1, **_leg(c, f"Best available {c.event_title} moneyline on Kalshi.")}
        for i, c in enumerate(scored)
    ]


def _closest_to_even(contracts: list[Contract]) -> Contract | None:
    playable = [c for c in contracts if c.mid is not None and 0.15 < c.mid < 0.85]
    if not playable:
        playable = [c for c in contracts if c.mid is not None]
    if not playable:
        return None
    return min(playable, key=lambda c: abs((c.mid or 0.5) - 0.5))


def _favorite(contracts: list[Contract]) -> Contract | None:
    playable = [c for c in contracts if c.mid is not None and 0.12 < c.mid < 0.93]
    if not playable:
        return None
    return max(playable, key=lambda c: c.mid or 0)


def same_game_stacks(book: dict[str, list[Contract]]) -> list[dict]:
    by_game: dict[str, dict[str, list[Contract]]] = {}
    for kind in ("game", "spread", "total", "half", "rfi"):
        for contract in book.get(kind) or []:
            by_game.setdefault(contract.game_key, {}).setdefault(kind, []).append(contract)

    def score_game(key: str) -> tuple[int, float]:
        row = by_game[key]
        depth = sum(1 for k in ("game", "spread", "total", "half", "rfi") if row.get(k))
        fav = _favorite(row.get("game") or [])
        return (depth, _confidence(fav.mid if fav else None))

    if not by_game:
        return []
    best_key = max(by_game, key=score_game)
    row = by_game[best_key]
    legs: list[dict] = []
    fav = _favorite(row.get("game") or [])
    if fav:
        legs.append(_leg(fav, "Same-game moneyline."))
    spread = _closest_to_even(row.get("spread") or [])
    if spread:
        legs.append(_leg(spread, "Same-game spread / run line."))
    total = _closest_to_even(row.get("total") or [])
    if total:
        legs.append(_leg(total, "Same-game total."))
    extra = _favorite(row.get("half") or []) or _closest_to_even(row.get("rfi") or [])
    if extra:
        legs.append(_leg(extra, "Same-game first-half / first-inning."))

    cards = []
    if len(legs) >= 3:
        cards.append(_parlay_card("3+ SGP stack", "sgp3", legs[:3], legs[0]["game"]))
    if len(legs) >= 4:
        cards.append(_parlay_card("4+ SGP stack", "sgp4", legs[:4], legs[0]["game"]))
    elif len(legs) >= 3:
        cards.append(_parlay_card("4+ SGP stack", "sgp4", legs[:3], legs[0]["game"]))
    return cards


def _parlay_card(name: str, kind: str, legs: list[dict], game: str) -> dict:
    costs = [float(leg["cost"]) for leg in legs if leg.get("cost")]
    combined = 1.0
    for cost in costs:
        if 0 < cost < 1:
            combined *= cost
    return {
        "name": name,
        "kind": kind,
        "game": game,
        "legs": legs,
        "leg_count": len(legs),
        "combined_cost": round(combined, 4) if costs else None,
        "odds_american": format_american(dollars_to_american(combined)) if costs and 0 < combined < 1 else None,
        "why": (
            "Kalshi lists these as separate contracts, not one parlay ticket. "
            "Placing the stack buys every leg. All must hit for the combo thesis."
        ),
        "tickets": [
            {
                "ticker": leg["ticker"],
                "contract_side": leg["contract_side"],
                "yes_price": leg["yes_price"],
            }
            for leg in legs
        ],
    }


def rfi_parlay(rfi_contracts: list[Contract], prefer: str | None = None) -> dict | None:
    rows: list[tuple[Contract, str]] = []
    for contract in rfi_contracts:
        mid = contract.mid
        if mid is None:
            continue
        if prefer == "yrfi":
            side = "yes"
        elif prefer == "nrfi":
            side = "no"
        else:
            side = "yes" if mid >= 0.5 else "no"
        rows.append((contract, side))
    if prefer is None:
        nrfi_n = sum(1 for _, side in rows if side == "no")
        majority = "no" if nrfi_n >= len(rows) / 2 else "yes"
        cluster = [row for row in rows if row[1] == majority]
        if len(cluster) >= 3:
            rows = cluster
    rows.sort(key=lambda row: abs((row[0].mid or 0.5) - 0.5))
    picked = rows[:4] if len(rows) >= 4 else rows[:3]
    if len(picked) < 2:
        return None
    legs = []
    for contract, side in picked:
        ticket = contract.as_ticket(side)
        ticket["confidence"] = _confidence(contract.mid)
        ticket["why"] = "Kalshi first-inning over 0.5 (YES=YRFI, NO=NRFI)."
        legs.append(ticket)
    label = "YRFI" if picked[0][1] == "yes" else "NRFI"
    mixed = any(side != picked[0][1] for _, side in picked)
    name = "Mixed YRFI/NRFI MLB stack" if mixed else f"{label} MLB stack ({len(legs)} legs)"
    card = _parlay_card(name, "yrfi_nrfi", legs, "MLB first inning")
    card["why"] = (
        "Kalshi KXMLBRFI: YES is YRFI (over 0.5 first-inning runs), NO is NRFI. "
        "Placing this stack buys each game as its own contract."
    )
    return card


def prompt_bias(prompt: str) -> str | None:
    text = (prompt or "").lower()
    if "nrfi" in text and "yrfi" not in text:
        return "nrfi"
    if "yrfi" in text and "nrfi" not in text:
        return "yrfi"
    return None


async def run_workflow(prompt: str, sport_id: str | None, kalshi: KalshiClient | None = None) -> dict:
    sport = resolve_sport(sport_id)
    client = kalshi or KalshiClient()
    owns = kalshi is None
    try:
        book = await load_sport_book(sport, client)
        mlb_rfi = book["rfi"] if sport.id == "mlb" else (
            await load_sport_book(resolve_sport("mlb"), client)
        )["rfi"]
        picks = best_three(book["game"])
        parlays = same_game_stacks(book)
        yrfi = rfi_parlay(mlb_rfi, prefer=prompt_bias(prompt))
        slate = []
        seen: set[str] = set()
        for contract in book["game"]:
            if contract.event_ticker in seen:
                continue
            seen.add(contract.event_ticker)
            slate.append(
                {
                    "name": contract.event_title,
                    "ticker": contract.event_ticker,
                    "selection": contract.selection,
                    "yes_ask": contract.yes_ask,
                    "yes_bid": contract.yes_bid,
                    "american": format_american(dollars_to_american(contract.take_yes)),
                }
            )
        note = None
        if not book["game"]:
            note = f"No open Kalshi {sport.label} game markets right now."
        return {
            "venue": "kalshi",
            "sport": sport.id,
            "sport_label": sport.label,
            "prompt": prompt,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "can_trade": client.can_trade,
            "live_allowed": client.live_allowed,
            "balance": await client.get_balance() if client.can_trade else None,
            "slate": slate,
            "picks": picks,
            "parlays": parlays,
            "yrfi_nrfi": yrfi,
            "note": note,
            "disclaimer": (
                "Kalshi contracts only. SGPs and YRFI/NRFI stacks are separate tickets, not one parlay. "
                "Live orders spend real Kalshi cash. Not a lock."
            ),
        }
    finally:
        if owns:
            await client.aclose()
