from __future__ import annotations

import os

import uvicorn


def main() -> None:
    port = int(os.environ.get("SPORTSDESK_PORT", "8765"))
    uvicorn.run("sportsdesk.web:app", host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    main()
