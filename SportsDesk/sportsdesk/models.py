from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


def american_to_implied(odds: float | None) -> float | None:
    if odds is None:
        return None
    if odds < 0:
        return abs(odds) / (abs(odds) + 100.0)
    return 100.0 / (odds + 100.0)


def american_to_decimal(odds: float) -> float:
    if odds < 0:
        return 1.0 + 100.0 / abs(odds)
    return 1.0 + odds / 100.0


def decimal_to_american(decimal_odds: float) -> int:
    if decimal_odds <= 1.0:
        return 0
    if decimal_odds >= 2.0:
        return int(round((decimal_odds - 1.0) * 100))
    return int(round(-100.0 / (decimal_odds - 1.0)))


def combine_american(odds: list[float]) -> int | None:
    usable = [o for o in odds if o is not None]
    if not usable:
        return None
    decimal = 1.0
    for o in usable:
        decimal *= american_to_decimal(float(o))
    return decimal_to_american(decimal)


def format_american(odds: float | int | None) -> str | None:
    if odds is None:
        return None
    value = int(round(float(odds)))
    return f"+{value}" if value > 0 else str(value)


@dataclass
class Pitcher:
    name: str
    era: float | None = None
    record: str | None = None


@dataclass
class Side:
    name: str
    abbr: str
    home: bool
    wins: int = 0
    losses: int = 0
    score: int | None = None
    pitcher: Pitcher | None = None

    @property
    def win_pct(self) -> float:
        games = self.wins + self.losses
        if games <= 0:
            return 0.5
        return self.wins / games


@dataclass
class Odds:
    provider: str | None = None
    home_ml: float | None = None
    away_ml: float | None = None
    spread: float | None = None
    home_spread: float | None = None
    away_spread: float | None = None
    home_spread_odds: float | None = None
    away_spread_odds: float | None = None
    total: float | None = None
    over_odds: float | None = None
    under_odds: float | None = None


@dataclass
class Game:
    id: str
    sport: str
    name: str
    short_name: str
    start: str | None
    status: str
    state: str
    venue: str | None
    home: Side
    away: Side
    odds: Odds = field(default_factory=Odds)
    weather: str | None = None

    @property
    def is_final(self) -> bool:
        return self.state in {"post", "final"} or "final" in (self.status or "").lower()


@dataclass
class Leg:
    game_id: str
    game: str
    market: str
    selection: str
    odds: float | None
    confidence: float
    why: str

    def as_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["odds_american"] = format_american(self.odds)
        return data


@dataclass
class PickCard:
    rank: int
    leg: Leg

    def as_dict(self) -> dict[str, Any]:
        return {"rank": self.rank, **self.leg.as_dict()}


@dataclass
class ParlayCard:
    name: str
    kind: str
    legs: list[Leg]
    why: str

    def as_dict(self) -> dict[str, Any]:
        odds = combine_american([leg.odds for leg in self.legs if leg.odds is not None])
        return {
            "name": self.name,
            "kind": self.kind,
            "legs": [leg.as_dict() for leg in self.legs],
            "leg_count": len(self.legs),
            "odds": odds,
            "odds_american": format_american(odds),
            "why": self.why,
        }
