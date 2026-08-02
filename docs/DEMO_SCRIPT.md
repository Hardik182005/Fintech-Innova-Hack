# Five-Minute Demo Script (sandbox — test credits only)

## Setup (before judging)

```powershell
docker compose up -d postgres opa          # Postgres :5440, OPA :8181
uv run uvicorn credence.api.app:app --port 8001
cd frontend; npm run start                 # console at http://localhost:3000/console
```

Warm the local model once: the first Ollama call loads qwen3:1.7b into memory.
Demo token (from `.env` `CREDENCE_DEMO_RESET_TOKEN`) is prefilled in the console.

## Script

1. **Open `http://localhost:3000/console`** (0:00–0:30)
   - Point out: sandbox banner ("Test credits only"), API health tile,
     language selector (en/hi/bn/ta/te/kn from the localization API).

2. **Scenario A — Happy path** (0:30–2:00). Click "A · Happy path".
   - Walk the JSON narrative: passport issued → task + evidence + revenue
     mandate → credit evaluated (deterministic caps in `caps`, receipt hash)
     → first-credit human review → vault created → two vendor payments
     (₹600 compute + ₹400 image) → ₹1,800 revenue → waterfall: principal
     ₹1,000 → fee ₹50 → owner ₹750 → vault CLOSED.
   - Tiles flip to "Ledger balanced ✓ / Audit chain intact ✓".

3. **Scenario B — Overspend blocked** (2:00–2:40). ₹2,000 vs ₹1,000 limit →
   DENIED with reason codes from BOTH engines (deterministic rules + policy).

4. **Scenario C — Unknown vendor** (2:40–3:10). Personal wallet → DENIED,
   `VENDOR_NOT_ALLOWED`.

5. **Scenario D — Split payments** (3:10–3:50). Five rapid ₹250 payments →
   `SPLIT_PATTERN_DETECTED`, vault FROZEN. Show risk events table.

6. **Scenario E — Kill switch** (3:50–4:20). Owner revokes mid-task; pending
   execution blocked; show measured `kill_switch_latency_ms`.

7. **Scenario F — Task failure** (4:20–5:00). Bounded recovery: sweep ₹400
   unspent + capped ₹250 reserve, explicit simulated loss ₹350, vault
   DEFAULTED, ledger still balanced. Downside is bounded and priced.

## Fallbacks

- If Ollama is slow/off: set `CREDENCE_MODEL_PROVIDER=fixture` and restart
  the API — every scenario still works (deterministic analysis; auto-approval
  stays disabled without AI checks, review path covers it).
- Full reset: `POST /v1/demo/reset` with the demo token header, or
  `docker compose down -v && docker compose up -d postgres opa`.
- API docs live at `http://localhost:8001/docs`.

## Smart-contract enforcement (optional add-on)

```powershell
docker run --rm -v "${PWD}\contracts:/app" -w /app ghcr.io/foundry-rs/foundry:stable "forge test -vv"
```
15 Foundry tests incl. fuzzing: over-limit, non-allowlisted, expired, frozen,
revoked-agent rejection and the on-chain waterfall (principal → fee → owner).
