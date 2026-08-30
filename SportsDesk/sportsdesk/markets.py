from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from sportsdesk.catalog import Sport
from sportsdesk.kalshi import KalshiClient


def _f(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def dollars_to_american(price: float | None) -> int | None:
    if price is None or price <= 0 or price >= 1:
        return None
    implied = price
    if implied >= 0.5:
        return int(round(-100 * implied / (1 - implied)))
    return int(round(100 * (1 - implied) / implied))


def format_american(odds: int | None) -> str | None:
    if odds is None:
        return None
    return f"+{odds}" if odds > 0 else str(odds)


def event_suffix(event_ticker: str, series: str) -> str:
    prefix = f"{series}-"
    return event_ticker[len(prefix):] if event_ticker.startswith(prefix) else event_ticker


def team_key(suffix: str) -> str:
    cleaned = suffix.replace("G1", "").replace("G2", "").replace("G3", "")
    return cleaned[-8:] if len(cleaned) >= 8 else cleaned


@dataclass
class Contract:
    ticker: str
    event_ticker: str
    event_title: str
    market: str
    selection: str
    series: str
    yes_bid: float | None
    yes_ask: float | None
    game_key: str

    @property
    def mid(self) -> float | None:
        if self.yes_bid is None or self.yes_ask is None:
            return self.yes_ask or self.yes_bid
        return (self.yes_bid + self.yes_ask) / 2.0

    @property
    def take_yes(self) -> float | None:
        return self.yes_ask

    @property
    def take_no(self) -> float | None:
        if self.yes_bid is None:
            return None
        return 1.0 - self.yes_bid

    def as_ticket(self, side: str) -> dict[str, Any]:
        side = side.lower()
        if side == "yes":
            price = self.take_yes
            cost = self.take_yes
        else:
            price = self.yes_bid
            cost = self.take_no
        american = dollars_to_american(cost)
        return {
            "ticker": self.ticker,
            "event_ticker": self.event_ticker,
            "game": self.event_title,
            "market": self.market,
            "selection": self.selection if side == "yes" else f"No · {self.selection}",
            "contract_side": side,
            "yes_price": price,
            "cost": cost,
            "odds_american": format_american(american),
            "kalshi": True,
        }


def parse_market(event: dict[str, Any], market: dict[str, Any], kind: str, series: str) -> Contract | None:
    if (market.get("status") or "") not in {"active", "open", ""}:
        if market.get("status") not in {None, "active", "initialized"}:
            return None
    ticker = market.get("ticker")
    if not ticker:
        return None
    event_ticker = event.get("event_ticker") or event.get("ticker") or ""
    title = market.get("title") or market.get("yes_sub_title") or ticker
    return Contract(
        ticker=ticker,
        event_ticker=event_ticker,
        event_title=event.get("title") or event.get("sub_title") or event_ticker,
        market=kind,
        selection=title,
        series=series,
        yes_bid=_f(market.get("yes_bid_dollars") or market.get("yes_bid")),
        yes_ask=_f(market.get("yes_ask_dollars") or market.get("yes_ask")),
        game_key=team_key(event_suffix(event_ticker, series)),
    )


def contracts_from_events(events: list[dict[str, Any]], kind: str, series: str) -> list[Contract]:
    out: list[Contract] = []
    for event in events:
        for market in event.get("markets") or []:
            parsed = parse_market(event, market, kind, series)
            if parsed:
                out.append(parsed)
    return out


async def load_sport_book(sport: Sport, client: KalshiClient, limit: int = 40) -> dict[str, list[Contract]]:
    book: dict[str, list[Contract]] = {"game": [], "spread": [], "total": [], "rfi": [], "half": []}
    mapping = [
        ("game", sport.game),
        ("spread", sport.spread),
        ("total", sport.total),
        ("rfi", sport.first_inning),
        ("half", sport.first_half),
    ]
    for kind, series in mapping:
        if not series:
            continue
        events = await client.open_events(series, limit=limit)
        book[kind] = contracts_from_events(events, kind, series)
    return book
