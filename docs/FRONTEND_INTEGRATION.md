# Frontend Integration Guide

The delivered Next.js 16 design (`frontend/`, from website-2.zip) is wired to
the backend without constraining it: the marketing pages keep their design;
the working console lives at `/console`.

## Contract

- **OpenAPI 3.1**: `openapi.json` at the repo root (regenerate with
  `uv run python scripts/export_openapi.py`).
- **TypeScript types**: `npx openapi-typescript openapi.json -o
  packages/client_types/api.d.ts` (optional; `frontend/lib/api.ts` contains
  hand-written types for the endpoints the console uses).
- **Base URL**: `NEXT_PUBLIC_API_BASE` in `frontend/.env.local`
  (default `http://localhost:8001` — 8000 is occupied by another local app).
- **Auth**: sandbox bearer tokens. `POST /v1/organizations` returns
  `owner_api_token` once; send as `Authorization: Bearer <token>`. Demo
  endpoints instead use the `X-Demo-Token` header.
- **Amounts**: every `*_minor` field is integer minor units (paise).
  Format with `fmtINR` from `frontend/lib/api.ts`; never do float math.
- **Errors**: handled errors return
  `{"error": {"code": "<REASON_CODE>", "detail": "..."}}` with 409/422.
  Reason codes are canonical (never translated); catalog in
  `credence/errors.py`.
- **Localization**: `GET /v1/localization/locales`,
  `GET /v1/localization/catalog/{locale}` (en/hi/bn/ta/te/kn; each entry has
  `review_pending`), `POST /v1/localization/translate-explanation` (verifies
  numeric parity; falls back to canonical text).
- **CORS**: backend allows `http://localhost:3000` and `127.0.0.1:3000`.

## Pages

- `/` — rebranded marketing page (CredenceAI hero, console CTA).
- `/console` — live sandbox console: health/metrics tiles, six judge
  scenarios, risk events, audit chain view, language selector.

## Run

```powershell
docker compose up -d postgres opa
uv run uvicorn credence.api.app:app --port 8001
cd frontend && npm run build && npm run start   # or npm run dev
```
