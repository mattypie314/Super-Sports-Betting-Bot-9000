import asyncio

from sportsdesk.catalog import CATALOG, CORE_SPORTS, add_sport, enabled_ids, public_catalog
from sportsdesk.markets import Contract, parse_market
from sportsdesk.orders import build_payload, contracts_for_budget, place_tickets
from sportsdesk.workflow import best_three, rfi_parlay, same_game_stacks


def _c(ticker, title, kind, mid, game_key="BOSNYY", event="BOS vs NYY"):
    bid = max(0.01, mid - 0.01)
    ask = min(0.99, mid + 0.01)
    return Contract(
        ticker=ticker,
        event_ticker=f"KX{kind}-{game_key}",
        event_title=event,
        market=kind,
        selection=title,
        series="KXTEST",
        yes_bid=bid,
        yes_ask=ask,
        game_key=game_key,
    )


def test_core_dropdown_sports():
    assert CORE_SPORTS == ("mlb", "nfl", "nba", "wnba")
    catalog = public_catalog()
    enabled = {row["id"] for row in catalog["enabled"]}
    for sid in CORE_SPORTS:
        assert sid in enabled
        assert CATALOG[sid].game.startswith("KX")


def test_add_sport(tmp_path, monkeypatch):
    monkeypatch.setattr("sportsdesk.catalog.CONFIG_PATH", tmp_path / "extra.json")
    assert "nhl" not in enabled_ids()
    assert any(s.id == "nhl" for s in add_sport("nhl"))
    assert "nhl" in enabled_ids()


def test_parse_kalshi_market():
    contract = parse_market(
        {"event_ticker": "KXMLBGAME-26AUG29BOSNYYG1", "title": "Boston vs New York Y"},
        {
            "ticker": "KXMLBGAME-26AUG29BOSNYYG1-BOS",
            "title": "Boston wins",
            "status": "active",
            "yes_bid_dollars": "0.5800",
            "yes_ask_dollars": "0.5900",
        },
        "game",
        "KXMLBGAME",
    )
    assert contract is not None
    assert contract.ticker.endswith("-BOS")
    assert contract.take_yes == 0.59
    ticket = contract.as_ticket("yes")
    assert ticket["contract_side"] == "yes"
    assert ticket["kalshi"] is True


def test_best_three_are_distinct_games():
    games = [
        _c("t1", "NYY wins", "game", 0.62, "BOSNYY"),
        _c("t2", "ATL wins", "game", 0.61, "COLATL"),
        _c("t3", "LAD wins", "game", 0.60, "LADDET"),
        _c("t4", "lock", "game", 0.98, "LOCKXX"),
        _c("t5", "NYY again", "game", 0.70, "BOSNYY"),
    ]
    picks = best_three(games)
    assert len(picks) == 3
    assert [p["rank"] for p in picks] == [1, 2, 3]
    assert len({p["ticker"] for p in picks}) == 3
    assert all(p["ticker"] for p in picks)


def test_sgp_stack_has_three_and_four_legs():
    book = {
        "game": [_c("g", "PHI wins", "game", 0.61, "ATLPHI")],
        "spread": [_c("s", "PHI -1.5", "spread", 0.48, "ATLPHI")],
        "total": [_c("t", "Over 8.5", "total", 0.52, "ATLPHI")],
        "half": [_c("h", "PHI F5", "half", 0.55, "ATLPHI")],
        "rfi": [],
    }
    cards = {c["kind"]: c for c in same_game_stacks(book)}
    assert cards["sgp3"]["leg_count"] >= 3
    assert cards["sgp4"]["leg_count"] >= 4
    assert all(leg["ticker"] for leg in cards["sgp4"]["legs"])


def test_yrfi_nrfi_uses_kalshi_rfi():
    contracts = [
        _c("r1", "1st inning over 0.5", "rfi", 0.41, "LADDET"),
        _c("r2", "1st inning over 0.5", "rfi", 0.43, "KCCLE"),
        _c("r3", "1st inning over 0.5", "rfi", 0.44, "BOSNYY"),
        _c("r4", "1st inning over 0.5", "rfi", 0.70, "COLAZ"),
    ]
    ticket = rfi_parlay(contracts)
    assert ticket is not None
    assert ticket["kind"] == "yrfi_nrfi"
    assert ticket["leg_count"] >= 3
    assert all(leg["ticker"] for leg in ticket["legs"])


def test_order_payload_yes_and_no():
    yes = build_payload("T-YES", "yes", 0.59, 2)
    assert yes["side"] == "bid"
    assert yes["ticker"] == "T-YES"
    assert yes["time_in_force"] == "immediate_or_cancel"
    no = build_payload("T-NO", "no", 0.41, 3)
    assert no["side"] == "ask"
    assert contracts_for_budget(2.0, 0.50) == 4


def test_paper_bet_does_not_call_kalshi():
    class Boom:
        can_trade = True
        live_allowed = True

        async def create_order(self, payload):
            raise AssertionError("paper must not order")

    result = asyncio.run(
        place_tickets(
            [{"ticker": "T1", "contract_side": "yes", "yes_price": 0.40}],
            stake_dollars=2,
            live=False,
            confirm_live=False,
            client=Boom(),
        )
    )
    assert result["mode"] == "PAPER"
    assert result["results"][0]["ok"] is True
    assert result["results"][0]["order_id"] is None


def test_live_requires_confirm_and_flag():
    class Dead:
        can_trade = False
        live_allowed = False

    try:
        asyncio.run(place_tickets([{"ticker": "T", "contract_side": "yes", "yes_price": 0.5}], 1, True, False, Dead()))
        raise AssertionError("should fail")
    except ValueError as exc:
        assert "confirm_live" in str(exc)
