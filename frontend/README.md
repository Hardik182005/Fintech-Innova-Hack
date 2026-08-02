# CredenceAI — web

The public landing page and the operator control centre for **CredenceAI**,
task-backed credit infrastructure for autonomous agents.

**Sandbox. Test credits only. Not a licensed lender; no real money moves.**

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** (theme tokens in `app/globals.css`)
- **lucide-react** icons
- **TanStack Query** for product-surface data
- Fonts via `next/font`: **Newsreader** (display), **Inter** (body),
  **JetBrains Mono** (code)

## Getting started

```bash
npm install
npm run dev
```

Open the URL printed in the terminal. The product routes read through a
server-side proxy (`app/api/credence/[...path]/route.ts`) which attaches the
backend bearer token inside the Node process — the browser never holds one.

```bash
npm run build && npm start   # production build
npm run typecheck            # tsc --noEmit
npm test                     # vitest
```

## Project structure

```
app/
  layout.tsx        # fonts, metadata
  globals.css       # Tailwind v4 theme: colors, fonts, animations
  page.tsx          # public landing page
  (product)/        # the operator control centre (dashboard, vaults, audit…)
  api/credence/     # server-side proxy to the FastAPI backend
components/
  primitives.tsx      # Container, Button, Eyebrow, SectionHeading, Pill
  logo.tsx            # CredenceAI logo + mark
  navbar.tsx          # sticky nav with mobile menu (client)
  hero.tsx            # headline + control-centre still
  dashboard-mock.tsx  # the still itself
  products.tsx        # the five primitives, tabbed (client)
  governing-rule.tsx  # advise / decide / enforce, split three ways
  developers.tsx      # real /v1 API snippets (client)
  stats.tsx           # structural facts about the build
  safety.tsx          # safety posture — no certification claims
  deployment.tsx      # the actual architecture
  sandbox-notice.tsx  # the sandbox disclosure
  cta.tsx             # final call-to-action
  footer.tsx          # multi-column footer
  shell/ ui/ data/    # the product control centre's own components
lib/
  server/           # server-only backend access; never imported by a client
```

## Rules this surface is held to

Copy on the landing page is not marketing latitude. It is bound by the same
rules as the rest of the system:

- **No fabricated customers, logos, testimonials, metrics, prices, SLAs or
  certifications.** If a claim cannot be verified against the source tree, it
  does not go on the page.
- **No performance numbers invented for effect.** Measured figures are computed
  from real runs and shown on `/system-intelligence`, which reports "not enough
  evaluated cases" rather than a comforting zero.
- **No dead controls.** Every link and button resolves to a section that exists
  or a route that exists. `href="#"` is banned.
- **No credential is ever rendered.** Tokens live in server-side environment and
  are attached by the proxy; nothing reaches browser-visible markup.
