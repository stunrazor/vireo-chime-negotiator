# Deploy the demo to Render (free tier)

Goal: a public demo URL for judges — no install on their side. Two services
from this repo's `render.yaml`: the Express API and the static demo app.

## 1. Deploy (your clicks, ~10 min)

1. Sign in at `render.com` (GitHub login is fine).
2. **New → Blueprint** → connect repo
   `stunrazor/vireo-chime-negotiator` → Render reads `render.yaml` and shows
   two services: `vireo-chime-negotiator-api` and
   `vireo-chime-negotiator-demo`.
3. Fill the secret prompts (values go into Render only — never paste them
   in chat):
   - `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET`: your Sandbox REST app at
     developer.paypal.com (same pair as your local `.env`).
   - `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`: your staging project
     (same pair as your local `.env`; staging, never Main).
   - `META_MODEL_API_KEY`: optional — skip it and the demo uses exact-figure
     templates with the source labeled; set it for live Muse voices.
4. **Apply.** Builds take ~5–10 min (first `pnpm install` is the slow part).

## 2. Verify

1. API: open `https://vireo-chime-negotiator-api.onrender.com/api/healthz`
   → expect `{"ok":true}` (or your service's status shape).
2. Demo: open `https://vireo-chime-negotiator-demo.onrender.com/negotiator-demo`
   → Start negotiation → deal banner $6,899.20.
3. Paste both URLs back to Muse — they get verified live and added to the
   README + Devpost draft.

## 3. If something differs

- **API URL has a suffix** (name was taken): copy the real API URL into the
  static service's `VITE_NEGOTIATOR_API` env var → Manual Deploy → Clear
  build cache, on the static service only.
- **First load is slow**: free-tier services sleep when idle (~30–60s cold
  start). Open the API health URL first to wake it, then the demo.
- **Approve fails**: the API service is missing/incomplete secrets — check
  its Environment tab (PayPal pair + Supabase pair), save, redeploy.
- **PayPal webhook (optional full loop)**: in developer.paypal.com, add
  `https://<your-api>/api/paypal/webhook` to the Sandbox app's webhooks.

## 4. Costs and limits

- Both services are Render's free tier: $0. The static site is always up;
  the API sleeps after inactivity — fine for judging, just wake it first.
- No code change is needed to redeploy: push to `main` and Render rebuilds.
