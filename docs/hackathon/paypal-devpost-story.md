# Vireo — Chime Negotiator (PayPal AI Hackathon)

> Verified current state as of Nov 8, 2026. Prototype live end-to-end;
> demo video + submission pending.

## Inspiration

I worked in procurement for 19 years before I started Vireo. I prepared request forms, tracked supplies, and later ran supplier and vendor work as the founder of Footprint International Office Supplies. I have seen this work from both sides: the buyer lost in emailed quotes and spreadsheets, and the supplier waiting on approvals and pay with no power to speed things up.

Seeing both sides is why I built Vireo. Work on email security products at CagePathway taught me the rest: systems that touch business money must be safe by design, not by promise. When AI coding tools put a working prototype in reach of my basic HTML and Python skills, I did not build another dashboard. I built the workspace I had needed for 19 years: one that turns a messy request email into a clear next step, ranks quotes by fit with the buyer still choosing, and keeps one record from first request to final pay note. Smart from Request to Payment.

Chime, our Workspace Agent, lives by what those years taught me: help, spot problems, and prep next steps — but people keep every supplier choice, order approval, and pay decision. This hackathon is my chance to prove that rule with real money rails. PayPal already moves money for millions of firms, and Vireo's plan for Step 8 has always been the same: approved pay orders go out through the client's chosen licensed provider, while Vireo itself never holds funds. An agent that haggles inside human-set limits and stops cold at a human yes is agent commerce a real firm can trust: agents talk, humans pay, settled on PayPal.

## What it does

Picture a buyer at a 40-person firm. She needs 8 tablets for new staff and has no time to chase quotes over chat. In the demo she sets her limits — $900 per unit max, delivery by Nov 20, 12-month warranty — and Chime haggles with the supplier inside those limits: $906.20 rejected as over ceiling, $862.40 accepted in round 2. Total $6,899.20, saved $700.80 against list. She clicks Approve, PayPal Sandbox holds the funds, and capture fires only on receipt — every step written to an audit ledger she can show her boss.

Vireo today is the eight-stage Request-to-Payment workflow behind the site's
four phases — Request, Get quotes, Order, Receive and close — with three
enforced roles (Maker, Reviewer/Approver, Admin-Member) under Supabase
row-level security. The site's demo board says it in one line: *"Ranked on
quality fit · buyer awards."* VireoIntelligence, our AI engine, reviews quotes
on spec match, completeness, and delivery — price stays visible for context,
but the lowest number never auto-wins, and the buyer always awards.

The hackathon prototype on this foundation — Chime Negotiator, built and
verified live — carries "quality fit before award" into the negotiation
itself: buyer-vs.-supplier agents haggle price, delivery, and terms inside
human-set bounds, with Muse Spark voicing the dialogue (deterministic
templates keep every number identical offline). Chime presents the best deal
with savings and evidence, and the human's Approve click is the
payment-initiation event that creates a PayPal Sandbox order (`AUTHORIZE`
intent, escrow-style hold), followed by capture-on-receipt and webhook
reconciliation. The acceptance rule, enforced by code:

$$\text{accept} \iff P \le P_{\max} \;\land\; D \le D_{\max} \;\land\; W \supseteq W_{\min}$$

Anything outside the bounds returns to a human — never auto-accepted.

## How we built it

Reuse before invention — the backend doing the heavy lifting, as the site
promises. Vireo's staging payment foundation (private transfer/event ledger,
atomic idempotent apply-RPC with durable dedupe, fail-closed receiver) already
exists, verified in an isolated staging project. The prototype extends that
pattern into Negotiator-scoped staging tables (same lifecycle, dedupe keys,
and no-regression rules, keyed by synthetic DEMO-NEG refs) plus a PayPal
adapter that verifies webhook signatures server-side and normalizes PayPal
events into that same envelope.

The AI split is deliberate: Muse Spark voices the haggle and Muse Wonder
drafts the award memo (one grounded call each per session, synthetic context
only, strict shape validation with template fallback), while prices, rounds,
and the accept/walk-away outcome stay deterministic — the models can persuade
and brief, but only the bounds can decide.

All payment work is staging-only with synthetic Demo data through a new
additive migration: no existing table touched, nothing near production Main.
And rather than excepting Chime's never-initiate-payment rule, the
Approve-click-as-initiation design makes it structural — the code cannot reach
PayPal without a recorded human approval. Prototype lives on the isolated
`hackathon/paypal-negotiator` branch.

## Challenges we ran into

- **Our builder ran out of fuel mid-project.** Vireo was built with a Replit
  coding agent, and credits hit zero six days before the deadline. We exported
  the full project (756 MB), verified it file-by-file against git history (last
  activity Oct 27, 2026), and resumed in a new environment with zero loss.
- **A doctrine we refused to break.** The never-initiate-payment rule could
  have killed the concept; instead it became the design and the trust story.
- **Windows vs. a Linux-only toolchain.** Four native-dependency overrides
  excluded Windows binaries, so we relaxed them with documented, revertible
  dev-only comments rather than rebuilding the toolchain under deadline.
- **The environment fought back.** A stale shell variable silently shadowed
  the new `.env` file through an evening of 404s; a startup fingerprint
  (names + lengths, never values) now exposes file-vs.-shell sourcing on
  every boot.

## Accomplishments that we're proud of

- A verified end-to-end path from messy request email to confirmed PO, with
  real workspace isolation proven by authenticated access checks — not slides.
- Quote review that ranks on quality fit with the buyer awarding, exactly as
  the homepage promises — never lowest-price-first.
- Ask Chime at 15/15 on its grounded eval set, with procurement records never
  leaving the workspace.
- A staging payment ledger that treats paranoia as a feature: dedupe keys,
  no-regression transitions, raw bodies never stored.
- Rescuing the entire project from a deadlocked environment in hours, on the
  strength of committed git history — and turning our hardest constraint into
  the product's trust story.
- Every figure carries provenance and every deal prints its headroom: the
  ranking admits what it knows, what it assumes, and how far each bound can
  move before the deal breaks.

## What we learned

- A payment ledger designed for paranoia ports cleanly to a new provider:
  PayPal only needs an adapter, not a redesign.
- Constraints beat freedom under deadline: the staging-only rule and the
  human-initiation doctrine removed entire categories of decisions and review
  risk.
- Git history is a resume button: because the Replit work was committed
  through Oct 27, the environment move cost us hours, not the project.
- AI earns trust fastest behind guardrails: letting the model voice words
  while code enforces numbers gave us a demo that is lively yet unable to
  overspend.

## What's next for Vireo

- **Finish and submit:** prototype complete and verified; record the demo
  with Vireo's real UI and Chime's real guidance, and submit before Nov 12.
- **PayPal as a provider rail:** our Step 8 direction already plans
  client-chosen providers per corridor (InstaPay/GCash for PHP, licensed rails
  for SEA currencies + USD). PayPal Sandbox today is the first prototype of
  the USD/global corridor — provider executes and reports, Vireo never touches
  funds or FX.
- **Supplier-side agents:** let real suppliers plug a counter-offer agent into
  the same bounded protocol — negotiation as an open marketplace.
- **Net-0 payouts pilot:** instant payouts to SMB suppliers on three-way
  match, starting with synthetic cohorts.
- **Merge home:** fold the prototype behind a feature flag into Vireo's main
  line, guardrails and audit rules intact — still smart from Request to
  Payment.
