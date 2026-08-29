from __future__ import annotations

from typing import Any

import httpx

from sportsdesk.catalog import Sport
from sportsdesk.models import Game, Odds, Pitcher, Side

SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard"
ODDS = (
    "https://sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}"
    "/events/{event_id}/competitions/{comp_id}/odds"
)


def _record(competitor: dict[str, Any]) -> tuple[int, int]:
    for rec in competitor.get("records") or []:
        if rec.get("type") == "total" or rec.get("name") == "overall":
            summary = str(rec.get("summary") or "")
            parts = summary.replace("–", "-").split("-")
            if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
                return int(parts[0]), int(parts[1])
    return 0, 0


def _pitcher(competitor: dict[str, Any]) -> Pitcher | None:
    for probable in competitor.get("probables") or []:
        athlete = probable.get("athlete") or {}
        name = athlete.get("displayName") or athlete.get("fullName")
        if not name:
            continue
        era = None
        for stat in probable.get("statistics") or []:
            if str(stat.get("abbreviation") or "").upper() == "ERA":
                try:
                    era = float(stat.get("displayValue"))
                except (TypeError, ValueError):
                    era = None
        return Pitcher(name=name, era=era, record=probable.get("record"))
    return None


def _side(competitor: dict[str, Any]) -> Side:
    team = competitor.get("team") or {}
    wins, losses = _record(competitor)
    score = competitor.get("score")
    try:
        score_i = int(score) if score not in (None, "") else None
    except (TypeError, ValueError):
        score_i = None
    return Side(
        name=team.get("displayName") or team.get("name") or "Unknown",
        abbr=team.get("abbreviation") or "UNK",
        home=competitor.get("homeAway") == "home",
        wins=wins,
        losses=losses,
        score=score_i,
        pitcher=_pitcher(competitor),
    )


def _american(block: dict[str, Any] | None, fallback: float | None = None) -> float | None:
    if not block:
        return fallback
    current = (block.get("current") or {}).get("moneyLine") or {}
    raw = current.get("alternateDisplayValue") or current.get("american")
    if raw is None and fallback is not None:
        return fallback
    if raw is None and "moneyLine" in block and not isinstance(block.get("moneyLine"), dict):
        return float(block["moneyLine"])
    if raw is None:
        return fallback
    try:
        return float(str(raw).replace("+", ""))
    except ValueError:
        return fallback


def _spread_bits(block: dict[str, Any] | None) -> tuple[float | None, float | None]:
    if not block:
        return None, None
    current = block.get("current") or {}
    line = (current.get("pointSpread") or {}).get("alternateDisplayValue") or (
        current.get("pointSpread") or {}
    ).get("american")
    price = (current.get("spread") or {}).get("alternateDisplayValue") or (
        current.get("spread") or {}
    ).get("american")
    try:
        line_f = float(str(line).replace("+", "")) if line is not None else None
    except ValueError:
        line_f = None
    try:
        price_f = float(str(price).replace("+", "")) if price is not None else None
    except ValueError:
        price_f = None
    return line_f, price_f


def parse_odds(payload: dict[str, Any] | None) -> Odds:
    if not payload:
        return Odds()
    items = payload.get("items") or []
    if not items:
        return Odds()
    item = min(items, key=lambda i: int((i.get("provider") or {}).get("priority") or 99))
    home = item.get("homeTeamOdds") or {}
    away = item.get("awayTeamOdds") or {}
    home_spread, home_spread_odds = _spread_bits(home)
    away_spread, away_spread_odds = _spread_bits(away)
    top_spread = item.get("spread")
    if home_spread is None and away_spread is None and top_spread is not None:
        try:
            spread_f = float(top_spread)
            # ESPN top-level spread is usually the favorite magnitude
            if home.get("favorite"):
                home_spread, away_spread = -abs(spread_f), abs(spread_f)
            else:
                away_spread, home_spread = -abs(spread_f), abs(spread_f)
        except (TypeError, ValueError):
            pass
    return Odds(
        provider=(item.get("provider") or {}).get("name"),
        home_ml=_american(home, home.get("moneyLine")),
        away_ml=_american(away, away.get("moneyLine")),
        spread=item.get("spread"),
        home_spread=home_spread,
        away_spread=away_spread,
        home_spread_odds=home_spread_odds,
        away_spread_odds=away_spread_odds,
        total=item.get("overUnder"),
        over_odds=item.get("overOdds"),
        under_odds=item.get("underOdds"),
    )


def parse_scoreboard(sport: Sport, payload: dict[str, Any]) -> list[Game]:
    games: list[Game] = []
    for event in payload.get("events") or []:
        comps = event.get("competitions") or []
        if not comps:
            continue
        comp = comps[0]
        sides = {c.get("homeAway"): _side(c) for c in comp.get("competitors") or []}
        home = sides.get("home")
        away = sides.get("away")
        if not home or not away:
            continue
        status = ((comp.get("status") or {}).get("type") or {})
        weather = event.get("weather") or {}
        weather_text = None
        if weather:
            bits = [weather.get("displayValue"), weather.get("temperature")]
            weather_text = " ".join(str(b) for b in bits if b not in (None, ""))
        games.append(
            Game(
                id=str(event.get("id") or comp.get("id")),
                sport=sport.id,
                name=event.get("name") or f"{away.name} at {home.name}",
                short_name=event.get("shortName") or f"{away.abbr} @ {home.abbr}",
                start=comp.get("startDate") or event.get("date"),
                status=status.get("detail") or status.get("description") or "",
                state=status.get("state") or status.get("name") or "",
                venue=(comp.get("venue") or {}).get("fullName"),
                home=home,
                away=away,
                weather=weather_text or None,
            )
        )
    return games


class EspnClient:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client
        self._owns = client is None

    async def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=12.0, headers={"User-Agent": "SportsDesk/0.1"})
        return self._client

    async def aclose(self) -> None:
        if self._owns and self._client is not None:
            await self._client.aclose()
            self._client = None

    async def scoreboard(self, sport: Sport) -> list[Game]:
        http = await self._http()
        url = SCOREBOARD.format(sport=sport.espn_sport, league=sport.espn_league)
        response = await http.get(url)
        response.raise_for_status()
        return parse_scoreboard(sport, response.json())

    async def attach_odds(self, sport: Sport, games: list[Game]) -> list[Game]:
        http = await self._http()
        for game in games:
            url = ODDS.format(
                sport=sport.espn_sport,
                league=sport.espn_league,
                event_id=game.id,
                comp_id=game.id,
            )
            try:
                response = await http.get(url)
                if response.status_code == 200:
                    game.odds = parse_odds(response.json())
            except httpx.HTTPError:
                continue
        return games

    async def slate(self, sport: Sport) -> list[Game]:
        games = await self.scoreboard(sport)
        return await self.attach_odds(sport, games)
