# Devpost submission checklist + rules map

Fill on https://paypalaihackathon.devpost.com/ before Nov 12, 2026.
Rule texts below are transcribed from the PayPal announcement + standard
Devpost terms — the rules page itself returned HTTP 403 to automated fetch,
so the submitter MUST skim the live Official Rules once for eligibility fine
print (age, location, team size) before clicking submit.

## Fields

- Title: `Chime Negotiator — bounded AI procurement settled on PayPal`
- Tagline: `AI agents haggle inside human-set bounds; humans approve; PayPal Sandbox settles.`
- Story: paste `docs/hackathon/paypal-devpost-story.md` (7 labeled sections).
- Repo: `https://github.com/stunrazor/vireo-chime-negotiator` (public, MIT).
- Video: unlisted link, < 3:00, per `docs/hackathon/video-script.md`.
- Built with: `PayPal Sandbox (Orders API, webhooks), Muse Spark, Express, Supabase, React, Drizzle`.
- Prize focus: Best Use of Agentic Commerce (primary), Overall, PayPal+AI,
  Impactful, Demo.

## Rules map (verify each, initial when true)

- [ ] Original work, built during the window (Oct 1 – Nov 12). Reused Vireo
      foundation is the entrant's own prior work, disclosed in-story.
- [ ] Meaningful PayPal use: Orders create/authorize/capture + webhooks +
      signature verification (not a button slapped on).
- [ ] Meaningful AI use: Muse Spark voices negotiation within deterministic
      bounds (session records `muse-spark` vs `template` source).
- [ ] Working prototype, not mockups: live Sandbox order + staging ledger,
      reproducible via repo README.
- [ ] Public repo + OSS license, docs sufficient to run (README judges
      section + runbook + `.env.example`).
- [ ] No production money or credentials: Sandbox + synthetic data only;
      no secrets in repo, video, or screenshots.
- [ ] Eligibility (submitter confirms on live rules page): age, residence,
      team/individual terms, one-entry rules.

## Pre-submit gates (all green before clicking submit)

1. Fresh-clone build passes (Muse runs: clone → install → typecheck → test).
2. Authorize → capture → settled verified live (needs the Sandbox buyer click).
3. Video watched once at 1x, < 3:00, no secrets visible.
4. Story has zero TODOs; repo About shows description + topics + MIT.
