# Chime Negotiator — demo runbook (staging + Sandbox only)

Target: record the 3-minute PayPal AI Hackathon demo video. No real money, no
production data, no Main writes at any step.

## 0. One-time setup

1. Install toolchain (own terminal, fresh window to pick up PATH):
   `winget install -e --id OpenJS.NodeJS.LTS`, reopen terminal,
   `npm install -g pnpm` (Node 26 ships no corepack), then in
   `Vireo/vireo-step1`: `pnpm install --allow-build esbuild --allow-build
   @clerk/shared --allow-build @swc/core --allow-build msw --allow-build
   unrs-resolver`. Git for Windows must be installed (the root preinstall
   needs `sh`). Verified green on Node v26.13.0 + pnpm 12.18.0.
2. Verify gates: `pnpm --filter @workspace/api-server run typecheck`,
   `pnpm --filter @workspace/api-server run test:negotiator`,
   `pnpm --filter @workspace/vireo-step1 run typecheck`.
3. PayPal Sandbox REST app at developer.paypal.com (Sandbox tab). Note the
   Client ID + Secret, and the auto-created Sandbox **buyer** account email.
4. Staging Supabase project (the Oct 11 payment-staging one): confirm the
   project/branch in the SQL Editor, then apply ONLY
   `supabase/migrations/202611060001_vireo_negotiator_paypal.sql`.
   Verify with a read-only query that `vireo_negotiator_transfers` and
   `vireo_negotiator_events` exist and are empty.
5. Webhooks (optional for the video): expose the api-server publicly
   (ngrok/Cloudflare tunnel) and register
   `https://<public>/api/paypal/webhook` in the PayPal dashboard for the
   Sandbox app. The direct ledger writes already cover the demo if webhooks
   are skipped — say so on camera.

## 1. Run the demo (two terminals)

Terminal A — api-server (port 5000):

```powershell
cd C:\Users\mapet\Vireo\vireo-step1
$env:PAYPAL_CLIENT_ID="..."; $env:PAYPAL_CLIENT_SECRET="..."
$env:PAYPAL_WEBHOOK_ID="..."  # only if webhooks registered
$env:SUPABASE_URL="https://<staging-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="..."
$env:NODE_ENV="development"
# No Clerk keys needed: /api/healthz, /api/negotiator/* and /api/paypal/webhook
# bypass Clerk on this branch (public demo paths, synthetic + Sandbox only).
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

Terminal B — demo UI (Vite dev, any free port, e.g. 5173):

```powershell
cd C:\Users\mapet\Vireo\vireo-step1\artifacts\vireo-step1
$env:PORT="5173"; $env:BASE_PATH="/"
$env:VITE_NEGOTIATOR_API="http://localhost:5000"
pnpm run dev
```

Open `http://localhost:5173/negotiator-demo`.

## 2. Video beats (3:00)

- 0:00–0:25 — the pain: spreadsheet quotes, stalled approvals; the promise:
  agents talk, humans pay.
- 0:25–1:10 — set guardrails (8 tablets, ceiling, date, warranty), pick a
  synthetic supplier, run the negotiation; show the transcript + savings.
- 1:10–2:00 — enter approver, click Approve (THE initiation moment); open the
  PayPal Sandbox approval link in a second tab, approve as the Sandbox buyer,
  come back, click authorize.
- 2:00–2:40 — click capture on receipt; show settled state + DEMO-NEG ref;
  show the staging ledger rows (transfer + events) in Supabase Studio.
- 2:40–3:00 — close: bounded agents, human money, PayPal rails; staging-only,
  synthetic, rule-driven and labeled.

Rehearse once end to end before recording. If PayPal Sandbox is slow, the
rule-driven negotiation + Approve gate alone still tell the story.
