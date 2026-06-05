# Contributing

This is a private, single-owner setup/automation repo (see `LICENSE`). These
notes exist so **any contributor — human or AI agent — can make a change safely
and leave the repo in a known-good state.**

## Ground rules

1. **No secrets in commits.** See `SECURITY.md`. Only `.env.example` files are
   tracked.
2. **Keep the trade-safety flow intact.** The Worker's order tools are
   prepare/review-only; don't add silent order placement.
3. **The Worker must type-check.** `chatgpt-app` is the only compiled component.

## Local setup (Cloudflare Worker)

```bash
cd chatgpt-app
npm ci            # clean install from package-lock.json
npm run check     # tsc --noEmit (this is what CI gates on)
npm run dev       # local wrangler dev (needs Worker vars/secrets)
npm run deploy    # wrangler deploy (owner only)
```

On Claude Code on the web the install runs automatically via the SessionStart
hook in `.claude/settings.json`.

## The checks CI runs (run before pushing)

- `cd chatgpt-app && npm run check` — Worker type-check (**blocking**).
- All tracked `.json` files must parse (**blocking**). `.jsonc` is exempt.
- `PSScriptAnalyzer` over `scripts/*.ps1` — **advisory** (won't fail the build).

## PowerShell scripts

The `scripts/` helpers are Windows-oriented PowerShell (`.ps1`) for MCP install,
startup checks, and secret storage. Keep them idempotent and never echo secret
values.

## Conventions

- Develop on a feature branch; don't push directly to `main`.
- Update `CHANGELOG.md` for behavior/scaffolding changes.
- See `CLAUDE.md` / `AGENTS.md` for the full repo map.
