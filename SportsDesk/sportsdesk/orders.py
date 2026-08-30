from __future__ import annotations

import uuid
from typing import Any

from sportsdesk.kalshi import KalshiClient


def contracts_for_budget(stake: float, cost: float) -> int:
    if cost <= 0 or stake <= 0:
        return 0
    return max(1, int(stake // cost))


def build_payload(ticker: str, contract_side: str, yes_price: float, count: int) -> dict[str, Any]:
    side = "bid" if contract_side == "yes" else "ask"
    return {
        "ticker": ticker,
        "side": side,
        "count": f"{count:.2f}",
        "price": f"{yes_price:.4f}",
        "time_in_force": "immediate_or_cancel",
        "self_trade_prevention_type": "taker_at_cross",
        "post_only": False,
        "client_order_id": str(uuid.uuid4()),
        "exchange_index": -1,
    }


async def place_tickets(
    tickets: list[dict[str, Any]],
    stake_dollars: float,
    live: bool,
    confirm_live: bool,
    client: KalshiClient,
) -> dict[str, Any]:
    if live and not confirm_live:
        raise ValueError("Live bets need confirm_live=true.")
    if live and not client.can_trade:
        raise ValueError("Kalshi API key and private key are not loaded.")
    if live and not client.live_allowed:
        raise ValueError("Set KALSHI_LIVE=1 to enable real-money orders.")
    if stake_dollars <= 0:
        raise ValueError("Stake must be greater than 0.")

    results = []
    mode = "LIVE" if live else "PAPER"
    for ticket in tickets:
        ticker = ticket["ticker"]
        contract_side = ticket["contract_side"]
        yes_price = float(ticket["yes_price"])
        cost = yes_price if contract_side == "yes" else (1.0 - yes_price)
        count = contracts_for_budget(stake_dollars, cost)
        if count <= 0:
            results.append({"ticker": ticker, "ok": False, "error": "stake too small for this price"})
            continue
        payload = build_payload(ticker, contract_side, yes_price, count)
        if not live:
            results.append(
                {
                    "ticker": ticker,
                    "ok": True,
                    "mode": mode,
                    "count": count,
                    "cost": round(count * cost, 4),
                    "order_id": None,
                    "fill_count": 0,
                    "payload": payload,
                }
            )
            continue
        try:
            resp = await client.create_order(payload)
        except Exception as exc:
            results.append({"ticker": ticker, "ok": False, "mode": mode, "error": str(exc)})
            continue
        fill = float(resp.get("fill_count") or 0)
        results.append(
            {
                "ticker": ticker,
                "ok": True,
                "mode": mode,
                "count": count,
                "cost": round(fill * cost if fill else count * cost, 4),
                "order_id": resp.get("order_id"),
                "fill_count": fill,
                "response": resp,
            }
        )
    return {"mode": mode, "results": results}
