# Where we stand on the 5 judging criteria

Scored 2026-11-08 against the published PayPal AI Hackathon criteria.
Evidence-first: each claim below points at something a judge can run or watch.

## 1. Technological Implementation — strong

- PayPal Sandbox, real calls, no mocks: authorize-intent Orders, explicit
  authorize, capture on synthetic receipt, webhook signature verification,
  and a staging ledger that dedupes provider events and never regresses
  transfer state (`artifacts/api-server/src/lib/paypal.ts`,
  `supabase/migrations/202611060001_vireo_negotiator_paypal.sql`).
- Two Meta models with distinct jobs: Muse Spark voices the haggle
  (`lib/spark.ts`), Muse Wonder drafts the buyer memo (`lib/wonder.ts`).
  Both degrade to exact-figure templates when keys are absent, so the demo
  never blocks — and the UI labels which source spoke.
- Deterministic bounded engine under the models (`lib/negotiator.ts`):
  human-set ceiling/date/warranty, supplier never concedes below floor,
  walk-away on bounds breach. Provenance labels + headroom (flip point)
  ship with every deal.
- To lock: finish the live authorize → capture → settled run (Sandbox buyer
  click pending) and keep the ledger proof queries in the runbook.

## 2. Design — strong

- One coherent page, complete flow: guardrails → transcript → human Approve
  → authorize → capture → settled + ledger (`/negotiator-demo`). No dead
  ends; headless-Chrome pass at ~60fps.
- Reads as Vireo product on camera: product eyebrow, buyer-pain header line,
  Chime voice in the transcript, doctrine sentence under the title.

## 3. Potential Impact — strong

- Real problem: small-business procurement runs on chat haggling and
  scattered approvals; real audience: PH SMEs first, global via PayPal USD.
- The demo solves the slice it claims: bounded haggle, human approval as
  the payment-initiation event, auditable ledger.
- Story now opens "What it does" with a concrete buyer (40-person firm,
  8 tablets, before/after, exact demo figures $6,899.20 / $700.80 saved) —
  credible, not asserted. Video script carries the same numbers.

## 4. Innovation — strong, our best card

- Not "AI + a PayPal button": agent-to-agent negotiation inside human
  bounds, where the human's Approve click IS the payment-initiation event —
  Chime structurally cannot initiate payment (no approval, no PayPal call,
  no transfer row).
- Honesty pattern on top: provenance labels admit estimates vs. facts, and
  headroom puts the flip point next to the pick ("wins by $37.60/unit, but
  only if the ceiling holds").

## 5. Presentation — ready to record, recording is the work

- Script, runbook, and submission checklist are written and figure-synced
  ($6,899.20 throughout); video not recorded, submission not filed.
- Critical path: restart API → Sandbox buyer approval → authorize → capture
  → ledger proof → record per `video-script.md` → submit per
  `submission-checklist.md` (deadline Nov 12).
