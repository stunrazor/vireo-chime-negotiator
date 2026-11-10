# Vireo — Chime Negotiator (PayPal AI Hackathon entry)

> Built during October 1, 2026 (9:15 AM PT) – November 12, 2026 (12:00 PM PT) for the PayPal AI Hackathon.

Vireo is a B2B procurement platform — Smart from Request to Payment — guided
by **Chime**, its Workspace Agent. Chime prepares; people decide: it never
approves, awards, or initiates payment. This repo is the hackathon slice of
that product: agent-to-agent haggling inside human-set bounds, a human Approve
that initiates payment, and PayPal Sandbox settlement with a webhook ledger.

- Product site: `https://weneedvireo.online`
- License: AGPL-3.0 (`LICENSE`); commercial licensing: `stunrazor@gmail.com`

## Judges start here

Chime Negotiator: bounded AI agents haggle over a purchase inside human-set
guardrails, a human approves, and PayPal Sandbox settles via
authorize-then-capture with webhook reconciliation. No real money moves
(Sandbox only); all demo data is synthetic.

**Live demo (no install):**
`https://vireo-chime-negotiator.onrender.com/negotiator-demo`

**IMPORTANT: OPEN THE API FIRST TO WAKE IT UP —
`https://vireo-chime-negotiator-api.onrender.com` — WAIT FOR IT TO
RESPOND, THEN LOAD THE DEMO. THE FREE TIER SLEEPS WHEN IDLE AND THE
DEMO FAILS UNTIL THE API IS AWAKE.**

**Judges — try the money flow (Sandbox buyer login included):**

- Buyer email: `sb-0f3yu53823617@personal.example.com`
- Buyer password: `s.RF"I44`
- Fake-money Sandbox account, safe to share. Flow: Start negotiation →
  Approve with any name → open the Sandbox approval link → log in as the
  buyer → Review Order / Agree → PayPal returns you to a FRESH demo page
  (empty state — expected) → go back to your ORIGINAL demo tab (the one
  holding the deal) → click "Mark buyer-approved & authorize" → the auth
  reference appears beside the button → click "Capture on receipt" → the
  capture reference appears with "Settled in Sandbox. Transfer
  DEMO-NEG-XXXXXXXX reconciled in the staging ledger — agents talked,
  humans paid." (Your transfer ref differs per run — that's correct.)
- Complete each run start-to-finish in one pass: demo sessions live in
  server memory, and approval links can't be reused across runs. If the
  PayPal page stalls on "Getting your Wallet", retry in another browser —
  that's a known Sandbox glitch, not the demo.
- Prefer API tools? Import `docs/hackathon/chime-negotiator.postman_collection.json`
  into Postman and run the requests top to bottom. The settled ledger is
  also visible in-demo as an AG Grid — no Supabase access needed.
- Full click-by-click walkthrough: `docs/hackathon/user-flow.md`.

**Run it yourself (10–15 min, free tiers only):**

1. Prereqs: Node 24+ (verified on 26), pnpm, Git. Windows needs Git for
   Windows (the install uses `sh`). Free accounts: Supabase + PayPal Developer.
2. `git clone <this-repo> && cd <repo> && pnpm install --allow-build esbuild
   --allow-build @clerk/shared --allow-build @swc/core --allow-build msw
   --allow-build unrs-resolver`
3. Supabase: create a project, open its SQL Editor, run both files in
   `supabase/migrations/` in name order (ledger tables + write RPCs, then
   the ledger-read RPC), confirm the two `vireo_negotiator_*` tables exist.
   (Use your own project — never production data; demo writes are synthetic
   and DEMO-marked.)
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
   authorize → capture → settled. The ledger grid in step 4 shows the
   trail (proof queries also in `docs/hackathon/demo-runbook.md`).
9. Optional AI check: with `META_MODEL_API_KEY` set (Meta Model API), the
   dialogue, memo, and mic go live (see "AI in this project"); without
   it, deterministic templates keep every number identical.

**Verify it quickly:** `pnpm --filter @workspace/api-server run typecheck`,
`pnpm --filter @workspace/api-server run test:negotiator` (21 tests, no
network), `pnpm --filter @workspace/vireo-step1 run typecheck`.
Troubleshooting: `503 negotiator_not_configured` = `.env` missing/unread;
RPC `404` = migration applied to a different project than `.env` points at.

## AI in this project

Three Meta models, each inside the demo flow — and each bounded by code:

- **Muse Spark** (`muse-spark-1.3`) voices the haggle transcript. It rewrites
  lines only; prices, rounds, delivery, warranty, and the accept/walk-away
  outcome stay deterministic (`artifacts/api-server/src/lib/spark.ts`).
- **Muse Wonder** drafts the award memo shown before approval. Key figures
  must echo the deal verbatim or the memo falls back to a template
  (`artifacts/api-server/src/lib/wonder.ts`).
- **Muse Voice Transcribe** (`muse-voice-transcribe-1.0`) turns the spoken
  approver name into text through the push-to-speak mic. Speech becomes
  text only — the human still reviews the name and clicks Approve
  (`artifacts/api-server/src/lib/voice.ts`).

No key, no network, or a malformed reply → deterministic templates take
over, and the session labels which source produced every word. Bounds are
always enforced by code, never by the model.

## What's in this repo

```text
artifacts/api-server/      Express API: negotiator engine, PayPal adapter,
                           Muse Spark/Wonder/Voice clients, staging client
artifacts/vireo-step1/     Demo app — the /negotiator-demo page judges use
artifacts/vireo-design-system/  UI kit the demo page builds on (dependency)
lib/db, lib/api-zod,       Shared TS packages the API/app need to build
lib/api-client-react
supabase/migrations/       Two migrations: ledger tables + write RPCs,
                           then the ledger-read RPC (run in order)
docs/hackathon/            Story, runbook, video script, checklists, criteria,
                           Postman collection (sponsor) for the API,
                           user-flow.md end-user walkthrough
```

Everything here exists to run the demo above. The wider Vireo product
(Flask backend, workspace app, investor materials) stays private.

## How the money moves

1. **Haggle (no money):** the deterministic engine negotiates price, delivery,
   and warranty inside the human's ceiling/date/warranty bounds — Muse Spark
   voices the dialogue. Walk-away on any breach.
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
| `docs/hackathon/user-flow.md` | End-user walkthrough: click-by-click demo path |
| `docs/hackathon/chime-negotiator.postman_collection.json` | Postman collection: full API flow, chained |
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
| Secondary | Most Impactful | $5,000 | Procurement pain for mid-market teams |
| Secondary | Best Demo Delivery | $5,000 | Live haggle transcript → one-click Approve → Sandbox capture |

Sponsor tools in use (not prize entries): Render (hosting), Postman (API
collection), AG Grid (in-demo ledger viewer).

Prototype lives on an isolated hackathon branch, staging Supabase project
only, synthetic Demo data. Never Main. Submissions close **Nov 12, 2026**.

## License

This project is licensed under the GNU Affero General Public License v3.0 —
see `LICENSE`.

**Commercial licensing:** if AGPL-3.0 terms don't fit your use (for example,
proprietary deployment without source disclosure), contact
`stunrazor@gmail.com` for a paid commercial license.
