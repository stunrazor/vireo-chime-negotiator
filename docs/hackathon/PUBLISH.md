# Publish the public slice (repeatable)

Target: https://github.com/stunrazor/vireo-chime-negotiator (public, MIT).
Source of truth stays `Vireo/vireo-step1` on branch `hackathon/paypal-negotiator`;
this procedure rebuilds the public copy idempotently — safe to re-run after
any change. Never push from `vireo-step1` directly (it holds `.env` + history).
The slice is hackathon-only: demo API + demo app + their build deps + the one
migration + hackathon docs. No product docs, no Python backend, no decks.

## 1. Rebuild the slice (own terminal)

```powershell
$src = "$env:USERPROFILE\Vireo\vireo-step1"
$dst = "$env:USERPROFILE\chime-negotiator-public"
robocopy $src $dst /MIR /XD .git node_modules dist .agents .private attached_assets exports generated-artifacts research .config __pycache__ .vscode .idea deliverables snapshots /XF *.mp4 *.docx *.tsbuildinfo .env *.zip *.tar.gz *.py pyproject.toml uv.lock replit.md .replit .replitignore | Select-Object -Last 2
Remove-Item "$dst\artifacts\vireo-investor-deck", "$dst\artifacts\vireo-yc-product-demo", "$dst\artifacts\vireo-chime-intro", "$dst\artifacts\vireo-marketing-demo", "$dst\artifacts\mockup-sandbox", "$dst\lib\api-spec", "$dst\scripts", "$dst\src", "$dst\tests", "$dst\docs\vireo", "$dst\docs\chime", "$dst\docs\chime-combined-alert-checklist.md", "$dst\docs\chime-major-update-checklist.md", "$dst\supabase\admin", "$dst\supabase\diagnostics", "$dst\supabase\functions", "$dst\supabase\config.toml", "$dst\competitor-monitoring.md", "$dst\main.py", "$dst\vireo_*.py", "$dst\pyproject.toml", "$dst\uv.lock", "$dst\replit.md", "$dst\.replit", "$dst\.replitignore" -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem "$dst\supabase\migrations" -Exclude "202611060001_vireo_negotiator_paypal.sql" | Remove-Item -Force
Write-Host "=== safety (expect True/True, 3 artifacts, 1 migration, then nothing) ==="
Test-Path "$dst\LICENSE"; Test-Path "$dst\README.md"
Get-ChildItem "$dst\artifacts" | Select-Object Name
Get-ChildItem "$dst\supabase\migrations" | Select-Object Name
Get-ChildItem $dst -Recurse -Force -File | Where-Object { $_.Name -eq ".env" -or $_.Extension -in ".mp4",".docx",".zip",".py" } | Select-Object FullName
```

Kept and why: `api-server` (demo API), `vireo-step1` (demo app —
`/negotiator-demo`), `vireo-design-system` + `lib/{db,api-zod,api-client-react}`
(build deps the demo needs: `pnpm install` fails without them), the one
negotiator migration, `docs/hackathon`, README, LICENSE, workspace configs.
Excluded: product docs (`docs/vireo`, `docs/chime`), Python backend (`*.py`,
`pyproject`, `uv.lock`), decks/demos/notes, research, `tests`/`scripts`,
all other migrations, secrets, videos, zips. The 756MB Replit export tarball
lives outside `vireo-step1` and is never in the slice.

## 2. Commit + push

```powershell
cd $dst
git add -A
git status --short | Select-Object -First 15   # eyeball: no .env, no surprises
git commit -m "<what changed>"
git push origin main
```

First run only (before commit): `git init`, `git branch -M main`,
`git remote add origin https://github.com/stunrazor/vireo-chime-negotiator.git`.

## 3. Verify (ask Muse)

Muse checks the public API: repo visible, LICENSE detected, tree correct,
no `.env`. Paste "verify push" with nothing else.
