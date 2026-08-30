from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from sportsdesk.catalog import add_sport, public_catalog, resolve_sport
from sportsdesk.kalshi import KalshiClient
from sportsdesk.orders import place_tickets
from sportsdesk.workflow import run_workflow

STATIC_DIR = Path(__file__).parent / "static"


class PromptBody(BaseModel):
    prompt: str = Field(default="best 3 picks, parlays, YRFI/NRFI")
    sport: str | None = "mlb"


class AddSportBody(BaseModel):
    sport: str


class BetBody(BaseModel):
    tickets: list[dict]
    stake_dollars: float = 1.0
    live: bool = False
    confirm_live: bool = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    kalshi = KalshiClient()
    app.state.kalshi = kalshi
    try:
        yield
    finally:
        await kalshi.aclose()


app = FastAPI(title="SportsDesk", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"ok": "sportsdesk", "venue": "kalshi"}


@app.get("/api/account")
async def account() -> dict:
    client: KalshiClient = app.state.kalshi
    balance = None
    error = None
    if client.can_trade:
        try:
            balance = await client.get_balance()
        except Exception as exc:
            error = str(exc)
    return {
        "can_trade": client.can_trade,
        "live_allowed": client.live_allowed,
        "balance": balance,
        "error": error,
    }


@app.get("/api/sports")
async def sports() -> dict:
    return public_catalog()


@app.post("/api/sports")
async def sports_add(body: AddSportBody) -> dict:
    try:
        add_sport(body.sport)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return public_catalog()


@app.post("/api/workflow")
async def workflow(body: PromptBody) -> dict:
    try:
        resolve_sport(body.sport)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await run_workflow(body.prompt, body.sport, kalshi=app.state.kalshi)


@app.post("/api/bet")
async def bet(body: BetBody) -> dict:
    try:
        return await place_tickets(
            body.tickets,
            body.stake_dollars,
            body.live,
            body.confirm_live,
            app.state.kalshi,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
