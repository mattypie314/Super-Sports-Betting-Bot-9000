"""Load gitignored .env files. Existing process env wins. Never prints values."""

from __future__ import annotations

import os
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_LOCAL = Path(__file__).resolve().parents[1]


def load_env() -> None:
    for path in (_ROOT / ".env", _LOCAL / ".env"):
        if not path.is_file():
            continue
        for raw in path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip("'").strip('"').replace("\\n", "\n")
            os.environ.setdefault(key, val)
        key_path = os.environ.get("KALSHI_PRIVATE_KEY_PATH", "")
        if key_path and not Path(key_path).expanduser().is_file():
            candidate = (path.parent / key_path).resolve()
            if candidate.is_file():
                os.environ["KALSHI_PRIVATE_KEY_PATH"] = str(candidate)


load_env()
