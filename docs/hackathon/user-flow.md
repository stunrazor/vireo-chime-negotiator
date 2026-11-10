# Vireo Chime Negotiator — end-user walkthrough

Do the whole run in one pass, start to finish. No account, no install, no
real money: PayPal Sandbox + synthetic DEMO data only.

> IMPORTANT: OPEN THE API FIRST TO WAKE IT UP —
> `https://vireo-chime-negotiator-api.onrender.com` — WAIT FOR IT TO
> RESPOND, THEN LOAD THE DEMO. THE FREE TIER SLEEPS WHEN IDLE AND THE
> DEMO FAILS UNTIL THE API IS AWAKE.

Demo: `https://vireo-chime-negotiator.onrender.com/negotiator-demo`

## The flow

### 1. Set guardrails, start the negotiation

The page opens on step 1 with working defaults (8 tablets, $900/unit
ceiling, Demo Supplier Alpha). Keep them or set your own bounds, then
click **Start negotiation**.

Expect: the Current stage line switches to Negotiating (animated dots),
Chime animates, and a transcript appears: Chime and the supplier haggle
inside your ceiling. With defaults the deal lands in round 2 —
$6,899.20 total, $700.80 saved vs list.

### 2. Read the deal

Step 2 shows every round plus the final offer: unit price, total,
savings, and headroom (how much slack is left under your ceiling).
The dialogue is voiced by Muse Spark; every number is enforced by
deterministic code, never by the model.

If the agents walk away, your ceiling held — lower the ask or raise the
ceiling and start again.

### 3. Name the approver, then Approve (the payment moment)

Step 3 shows the award memo (drafted by Muse Wonder) and the approver
field. Fill the name two ways:

- **Type it**, or
- **Click the mic, say the name, click again** — Muse Voice Transcribe
  fills the field. While listening the mic fills solid with expanding
  rings; it auto-stops at 30 seconds.

Review the name, then click **Approve**. This click IS the
payment-initiation event: it creates the PayPal Sandbox order and the
staging transfer together. No approval, no PayPal call — Chime can
never pay on its own.

Expect: a demo ref (`DEMO-NEG-XXXXXXXX`, yours differs per run), a
PayPal order id, and a Sandbox approval link.

### 4. Approve as the Sandbox buyer

Click the approval link (opens PayPal Sandbox) and log in as the buyer:

- Email: `sb-0f3yu53823617@personal.example.com`
- Password: `s.RF"I44`

Click **Review Order / Agree** on the $6,899.20 authorization. PayPal
then returns you to a FRESH demo page (empty state). That is expected:
**go back to your ORIGINAL demo tab** — the one holding the deal.

If the PayPal page stalls on "Getting your Wallet", retry in another
browser. That is a known Sandbox glitch, not the demo.

### 5. Authorize, then capture

Back in the original tab, step 4 is waiting:

1. Click **Mark buyer-approved & authorize**. An `auth …` reference
   appears beside the button — funds are held.
2. Click **Capture on receipt**. A `capture …` reference appears with:
   "Settled in Sandbox. Transfer DEMO-NEG-XXXXXXXX reconciled in the
   staging ledger — agents talked, humans paid."

### 6. Read the money trail

Below the capture button, the ledger grid shows the run's staging
trail: the transfer row (status, amount, order, approver) plus one row
per event (`accepted` → `settled`). Click **Refresh ledger** any time.
No Supabase access needed — the grid reads through a read-only,
DEMO-scoped API.

### 7. Run it again

Click **Reset demo** and start over. Notes:

- Each run gets a fresh demo ref, order, and ledger rows.
- Approval links work once, for their own run — never reuse one.
- Sessions live in server memory: if the services redeploy mid-run,
  start a fresh run.

## What the demo proves

A buyer sets the limits. Agents haggle inside them. A human approves,
PayPal Sandbox settles, and the ledger reconciles — with AI voicing
the experience at three points (dialogue, memo, voice) while code
enforces every bound.
