# Demo video script — 3:00, one continuous take preferred

Target: PayPal AI Hackathon submission (hard cap 3:00). Record the real UI,
real Sandbox, real staging ledger. No slides, no mockups. If Sandbox stalls,
the marked pause points are clean edit cuts — never fake a step.

## Pre-flight (off camera)

- Terminal A (api-server, `.env` set, fresh window) + Terminal B (vite) up.
- Staging ledger empty of today's rows (or note pre-existing refs on camera).
- PayPal Sandbox buyer logged OUT in the demo browser (log in on camera).
- Browser 1366x900, notifications off, mic check. Never show `.env`, keys,
  or dashboard secrets — demo page + PayPal Sandbox + Supabase rows only.

## Beats

**0:00–0:25 — Hook (face or voiceover + site)**
"Procurement runs on spreadsheets and stalled approvals. Vireo's Chime
Negotiator lets AI agents haggle inside human-set bounds — and a human's
Approve click settles real money on PayPal. Agents talk, humans pay."

**0:25–1:10 — Negotiate (demo page, defaults)**
Show guardrails (8 tablets, USD 900 ceiling, date, warranty, 3 rounds) →
Start → transcript streams → deal banner: round 2, USD 862.40/unit,
USD 6,899.20 total, USD 700.80 saved, dialogue source visible.
Say: "Muse Spark voices the haggle; deterministic bounds enforce the numbers.
Nothing outside the ceiling can be accepted." [PAUSE POINT]

**1:10–2:00 — Approve (the initiation moment)**
Type approver name → Approve → order ID + DEMO-NEG ref + Sandbox link appear.
"This click IS the payment initiation — no approval, no PayPal call, ever."
Open the link in a new tab → log in as Sandbox buyer → approve → back.
[PAUSE POINT]

**2:00–2:40 — Settle (authorize → capture → ledger)**
Click authorize (auth ID) → capture on receipt (capture ID, settled message).
Flip to Supabase staging: transfer row `settled`, events `accepted → settled`.
"Every cent reconciled in the ledger — webhooks dedupe, state never regresses."

**2:40–3:00 — Close (back on demo page)**
"Bounded agents, human money, PayPal rails. Next: Net-0 supplier payouts and
supplier-side agents. Built with PayPal Sandbox, Express, Supabase, and Muse
Spark — staging-only, synthetic data throughout."

## After recording

Watch once at 1x: every number legible, no secret visible, total under 3:00.
Upload unlisted, paste the link into the submission checklist, done.
