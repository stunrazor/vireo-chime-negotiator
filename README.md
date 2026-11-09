# Vireo — Chime Negotiator (PayPal AI Hackathon entry)

> Built October 1, 2026 (9:15 AM PT) – November 12, 2026 (12:00 PM PT) for the PayPal AI Hackathon.

Vireo is a B2B procurement platform — Smart from Request to Payment — guided
by **Chime**, its Workspace Agent. Chime prepares; people decide: it never
approves, awards, or initiates payment. This repo is the hackathon slice of
that product: agent-to-agent haggling inside human-set bounds, a human Approve
that initiates payment, and PayPal Sandbox settlement with a webhook ledger.

- Product site: `https://weneedvireo.online`
- License: MIT (`LICENSE`)

## Judges start here

Chime Negotiator: bounded AI agents haggle over a purchase inside human-set
guardrails, a human approves, and PayPal Sandbox settles via
authorize-then-capture with webhook reconciliation. No real money moves
(Sandbox only); all demo data is synthetic.

**Live demo (no install):**
`https://vireo-chime-negotiator.onrender.com/negotiator-demo`
(API: `https://vireo-chime-negotiator-api.onrender.com` — open it first to
wake the free tier, then load the demo.)

**Run it yourself (10–15 min, free tiers only):**

1. Prereqs: Node 24+ (verified on 26), pnpm, Git. Windows needs Git for
   Windows (the install uses `sh`). Free accounts: Supabase + PayPal Developer.
2. `git clone <this-repo> && cd <repo> && pnpm install --allow-build esbuild
   --allow-build @clerk/shared --allow-build @swc/core --allow-build msw
   --allow-build unrs-resolver`
3. Supabase: create a project, open its SQL Editor, run the whole file
   `supabase/migrations/202611060001_vireo_negotiator_paypal.sql`, confirm the
   two `vireo_negotiator_*` tables exist. (Use your own project — never
   production data; demo writes are synthetic and DEMO-marked.)
4. PayPal: developer.paypal.com → Sandbox app (type Merchant) → note Client ID
   + Secret and a buyer test account.
5. `cp artifacts/api-server/.env.example artifacts/api-server/.env` and fill
   the 5 values (PayPal pair + your Supabase URL/service_role key + PORT=5000).
6. Terminal A: `cd artifacts/api-server && PORT=5000 node
   --enable-source-maps ./dist/index.mjs` (build first:
   `pnpm --filter @workspace/api-server run build`). No Clerk keys needed —
   demo paths are public by design.
7. Terminal B: `cd artifacts/vireo-step1 &&
   PORT=5173 BASE_PATH=/ VITE_NEGOTIATOR_API=http://localhost:5000 pnpm run dev`
   (Windows PowerShell: `$env:` assignments instead of `VAR=` prefixes).
8. Open `http://localhost:5173/negotiator-demo` → Start negotiation (defaults
   reach a deal in round 2: USD 6,899.20 total, USD 700.80 saved) →
   Approve with any name → open the Sandbox approval link as the buyer →
   authorize → capture → settled. Ledger proof queries are in
   `docs/hackathon/demo-runbook.md`.
9. Optional AI check: with `META_MODEL_API_KEY` set (Meta Model API), the
   transcript dialogue is voiced by Muse Spark and the award memo drafted by
   Muse Wonder; without it, deterministic templates keep every number
   identical. Bounds are always enforced by code, never by the model.

**Verify it quickly:** `pnpm --filter @workspace/api-server run typecheck`,
`pnpm --filter @workspace/api-server run test:negotiator` (16 tests, no
network), `pnpm --filter @workspace/vireo-step1 run typecheck`.
Troubleshooting: `503 negotiator_not_configured` = `.env` missing/unread;
RPC `404` = migration applied to a different project than `.env` points at.

## What's in this repo

```text
artifacts/api-server/      Express API: negotiator engine, PayPal adapter,
                           Muse Spark/Wonder clients, staging client
artifacts/vireo-step1/     Demo app — the /negotiator-demo page judges use
artifacts/vireo-design-system/  UI kit the demo page builds on (dependency)
lib/db, lib/api-zod,       Shared TS packages the API/app need to build
lib/api-client-react
supabase/migrations/       The ONE migration: staging ledger tables + RPCs
docs/hackathon/            Story, runbook, video script, checklists, criteria
```

Everything here exists to run the demo above. The wider Vireo product
(Flask backend, workspace app, investor materials) stays private.

## How the money moves

1. **Haggle (no money):** the deterministic engine negotiates price, delivery,
   and warranty inside the human's ceiling/date/warranty bounds — Muse Spark
   voices the dialogue, code enforces the numbers. Walk-away on any breach.
2. **Approve (human click):** the payment-initiation event. It creates the
   PayPal Sandbox order (`AUTHORIZE` intent) and the staging transfer row
   together — the code cannot reach PayPal without a recorded approval.
3. **Buyer approval + authorize:** the buyer approves in PayPal; the API
   authorizes and the funds are held.
4. **Capture on receipt:** capture fires only on receipt; every step lands in
   the staging ledger as an event.
5. **Webhook reconciliation:** PayPal events verify server-side, dedupe by
   provider key, and never regress a transfer's state.

The acceptance rule, enforced by code:

$$\text{accept} \iff P \le P_{\max} \;\land\; D \le D_{\max} \;\land\; W \supseteq W_{\min}$$

## Key docs

| Document | Purpose |
|----------|---------|
| `docs/hackathon/paypal-devpost-story.md` | Devpost story: inspiration → what → how → challenges |
| `docs/hackathon/demo-runbook.md` | Minute-by-minute demo + ledger proof queries |
| `docs/hackathon/video-script.md` | 3-minute video shot plan |
| `docs/hackathon/submission-checklist.md` | Submit-day checklist (deadline Nov 12, 2026) |
| `docs/hackathon/judging-criteria.md` | Where we stand on the 5 criteria, with evidence |
| `docs/hackathon/PUBLISH.md` | How this public slice is rebuilt (repeatable) |

## Data safety

- PayPal Sandbox only; Supabase staging project only — never production.
- All demo data synthetic and DEMO-marked. Never copy Demo rows to real data.
- Never commit `.env` files or secret values. Copy `.env.example` and fill
  locally; the server logs key lengths, never values.
- Never send live procurement data to an external model. Benchmarks stay
  synthetic.

## PayPal AI Hackathon — target categories

> Note: this hackathon has **no tracks or problem statements** — only prize
> categories. The Chime Negotiator prototype (`agent-to-agent negotiation →
> human Approve → PayPal Sandbox authorize/capture`) targets:

| Priority | Category | Prize | Why we fit |
|----------|----------|-------|------------|
| Primary | Best Use of Agentic Commerce | $5,000 | Buyer vs. supplier agents negotiating inside human-set bounds, settling on PayPal rails |
| Stretch | Best Overall (1st/2nd/3rd) | $12k/$8k/$5k | Real B2B workflow + live Sandbox money, not a toy demo |
| Secondary | Best Use of PayPal + AI | $5,000 | Meaningful use of both: AI negotiates, PayPal authorizes/captures + webhooks reconcile |
| Secondary | Most Impactful | $5,000 | Procurement pain for mid-market teams; Net-0 supplier payouts |
| Secondary | Best Demo Delivery | $5,000 | Live haggle transcript → one-click Approve → Sandbox capture |
| Sponsor | Best Use of APIMatic | 3 × $1,000 | Context Plugin gives the agent native PayPal API context |
| Sponsor | Best Use of Channel3 | $1,500 | Live product catalog data for sourcing (no scraping) |

Prototype lives on an isolated hackathon branch, staging Supabase project
only, synthetic Demo data. Never Main. Submissions close **Nov 12, 2026**.

## License

MIT — see `LICENSE`.
