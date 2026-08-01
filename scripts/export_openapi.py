"""Export the OpenAPI schema for the frontend handoff.

Usage: uv run python scripts/export_openapi.py
Writes openapi.json at the repo root. TypeScript types can then be generated
with:  npx openapi-typescript openapi.json -o packages/client_types/api.d.ts
"""

import json
from pathlib import Path

from credence.api.app import app

out = Path(__file__).resolve().parent.parent / "openapi.json"
out.write_text(json.dumps(app.openapi(), indent=2), encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size} bytes)")
