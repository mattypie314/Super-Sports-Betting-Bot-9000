from __future__ import annotations

import asyncio
import os
import random
import uuid
from pathlib import Path
from typing import Any

import httpx

from sportsdesk.auth import load_private_key, sign_path_from_url, signed_headers

DEFAULT_BASE = "https://api.elections.kalshi.com/trade-api/v2"


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


class KalshiClient:
    def __init__(
        self,
        base_url: str | None = None,
        client: httpx.AsyncClient | None = None,
        api_key_id: str | None = None,
        private_key_path: str | None = None,
        min_interval: float = 0.25,
    ) -> None:
        self.base_url = (base_url or _env("KALSHI_BASE_URL", DEFAULT_BASE)).rstrip("/")
        self.api_key_id = api_key_id if api_key_id is not None else (
            _env("KALSHI_API_KEY_ID") or _env("KALSHI_API_KEY") or _env("KALSHI_ACCESS_KEY")
        )
        key_path = private_key_path if private_key_path is not None else (
            _env("KALSHI_PRIVATE_KEY_PATH") or str(Path.home() / ".kalshi" / "kalshi_private_key.pem")
        )
        pem = _env("KALSHI_PRIVATE_KEY").replace("\\n", "\n")
        self._private_key = None
        if pem and "BEGIN" in pem:
            from cryptography.hazmat.primitives import serialization

            self._private_key = serialization.load_pem_private_key(pem.encode(), password=None)
        elif self.api_key_id and Path(key_path).expanduser().is_file():
            self._private_key = load_private_key(key_path)
        self._owns = client is None
        self._client = client or httpx.AsyncClient(timeout=20.0, headers={"User-Agent": "SportsDesk/0.2"})
        self._min_interval = min_interval
        self._gate = asyncio.Lock()
        self._next_ok = 0.0

    @property
    def can_trade(self) -> bool:
        return bool(self.api_key_id and self._private_key)

    @property
    def live_allowed(self) -> bool:
        return _env("KALSHI_LIVE", "0").lower() in {"1", "true", "yes", "on"}

    async def aclose(self) -> None:
        if self._owns:
            await self._client.aclose()

    def _auth_headers(self, method: str, path: str) -> dict[str, str]:
        if not self._private_key or not self.api_key_id:
            return {}
        return signed_headers(self.api_key_id, self._private_key, method, sign_path_from_url(self.base_url, path))

    async def _pace(self) -> None:
        async with self._gate:
            now = asyncio.get_running_loop().time()
            wait = self._next_ok - now
            if wait > 0:
                await asyncio.sleep(wait)
            self._next_ok = asyncio.get_running_loop().time() + self._min_interval

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        url = f"{self.base_url}{path}"
        headers = dict(kwargs.pop("headers", {}) or {})
        headers.update(self._auth_headers(method, path))
        last_error: Exception | None = None
        for attempt in range(5):
            await self._pace()
            response = await self._client.request(method, url, headers=headers, **kwargs)
            if response.status_code == 429:
                await asyncio.sleep(min(0.4 * (2**attempt), 8.0) + random.random() * 0.2)
                last_error = httpx.HTTPStatusError("429", request=response.request, response=response)
                continue
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                body = (response.text or "").strip().replace("\n", " ")[:400]
                last_error = httpx.HTTPStatusError(
                    f"{exc} Kalshi said: {body or '(empty body)'}",
                    request=response.request,
                    response=response,
                )
                if 500 <= response.status_code < 600:
                    await asyncio.sleep(0.3 * (2**attempt))
                    continue
                raise last_error from exc
            return response
        assert last_error is not None
        raise last_error

    async def get_json(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return (await self._request("GET", path, params=params)).json()

    async def post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self._request("POST", path, json=payload)
        if response.status_code == 204 or not response.content:
            return {}
        return response.json()

    async def open_events(self, series_ticker: str, limit: int = 40) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        cursor: str | None = None
        while len(events) < limit:
            params: dict[str, Any] = {
                "series_ticker": series_ticker,
                "status": "open",
                "with_nested_markets": "true",
                "limit": min(200, limit - len(events)),
            }
            if cursor:
                params["cursor"] = cursor
            data = await self.get_json("/events", params=params)
            batch = list(data.get("events") or [])
            events.extend(batch)
            cursor = data.get("cursor")
            if not batch or not cursor:
                break
        return events[:limit]

    async def create_order(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = dict(payload)
        body.setdefault("client_order_id", str(uuid.uuid4()))
        body["exchange_index"] = -1
        try:
            return await self.post_json("/portfolio/events/orders", body)
        except httpx.HTTPStatusError as exc:
            if exc.response is not None and exc.response.status_code == 404:
                body.pop("exchange_index", None)
                return await self.post_json("/portfolio/events/orders", body)
            raise

    async def get_balance(self) -> float | None:
        if not self.can_trade:
            return None
        data = await self.get_json("/portfolio/balance")
        if data.get("balance_dollars") not in (None, ""):
            return float(data["balance_dollars"])
        if data.get("balance") not in (None, ""):
            return float(data["balance"]) / 100.0
        return None
