from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
import json

CONFIG_PATH = Path.home() / ".sportsdesk" / "extra-sports.json"

CORE_SPORTS = ("mlb", "nfl", "nba", "wnba")


@dataclass(frozen=True)
class Sport:
    id: str
    label: str
    game: str
    spread: str | None = None
    total: str | None = None
    first_inning: str | None = None
    first_half: str | None = None
    addable: bool = False


CATALOG: dict[str, Sport] = {
    "mlb": Sport("mlb", "MLB", "KXMLBGAME", "KXMLBSPREAD", "KXMLBTOTAL", "KXMLBRFI", "KXMLBF5"),
    "nfl": Sport("nfl", "NFL", "KXNFLGAME", "KXNFLSPREAD", "KXNFLTOTAL", None, "KXNFL1HWINNER"),
    "nba": Sport("nba", "NBA", "KXNBAGAME", "KXNBASPREAD", "KXNBATOTAL", None, "KXNBA1HWINNER"),
    "wnba": Sport("wnba", "WNBA", "KXWNBAGAME", "KXWNBASPREAD", "KXWNBATOTAL", None, "KXWNBA1HWINNER"),
    "nhl": Sport("nhl", "NHL", "KXNHLGAME", "KXNHLSPREAD", "KXNHLTOTAL", addable=True),
    "ncaaf": Sport("ncaaf", "NCAAF", "KXNCAAFGAME", "KXNCAAFSPREAD", "KXNCAAFTOTAL", None, "KXNCAAF1HWINNER", True),
    "ncaab": Sport("ncaab", "NCAAB", "KXNCAAMBGAME", "KXNCAAMBSPREAD", "KXNCAAMBTOTAL", None, "KXNCAAMB1HWINNER", True),
    "mls": Sport("mls", "MLS", "KXMLSGAME", addable=True),
    "epl": Sport("epl", "EPL", "KXEPLGAME", addable=True),
}


def _read_extra() -> list[str]:
    if not CONFIG_PATH.exists():
        return []
    try:
        data = json.loads(CONFIG_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return []
    ids = data if isinstance(data, list) else data.get("sports") or []
    return [str(s).lower() for s in ids if str(s).lower() in CATALOG]


def _write_extra(ids: list[str]) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(sorted(set(ids)), indent=2) + "\n")


def enabled_ids() -> list[str]:
    extras = [s for s in _read_extra() if CATALOG[s].addable]
    return list(CORE_SPORTS) + extras


def enabled_sports() -> list[Sport]:
    return [CATALOG[sid] for sid in enabled_ids()]


def addable_sports() -> list[Sport]:
    enabled = set(enabled_ids())
    return [s for s in CATALOG.values() if s.addable and s.id not in enabled]


def add_sport(sport_id: str) -> list[Sport]:
    sport = CATALOG.get(sport_id.lower())
    if sport is None:
        raise ValueError(f"Unknown sport: {sport_id}")
    if not sport.addable:
        return enabled_sports()
    extras = _read_extra()
    if sport.id not in extras:
        extras.append(sport.id)
        _write_extra(extras)
    return enabled_sports()


def resolve_sport(sport_id: str | None) -> Sport:
    if not sport_id:
        return CATALOG["mlb"]
    sport = CATALOG.get(sport_id.lower())
    if sport is None:
        raise ValueError(f"Unknown sport: {sport_id}")
    return sport


def sport_from_prompt(prompt: str, fallback: str | None = None) -> Sport:
    text = (prompt or "").lower()
    for sport in CATALOG.values():
        tokens = {sport.id, sport.label.lower()}
        if any(token in text.split() or token in text for token in tokens):
            # Prefer explicit whole-word / label hits
            if sport.id in text.split() or sport.label.lower() in text:
                return sport
    return resolve_sport(fallback)


def public_catalog() -> dict:
    return {
        "enabled": [asdict(s) for s in enabled_sports()],
        "addable": [asdict(s) for s in addable_sports()],
        "core": list(CORE_SPORTS),
    }
