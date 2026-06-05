# CLAUDE.md — agent & maintainer guide for `robinhood-mcp-kit`

> **Canonical project context.** This file is written so that **any** LLM or
> human can pick up the repo and continue safely. `AGENTS.md` is a short pointer
> to this file for non-Claude tools. If the two ever disagree, **this file wins.**

## 1. What this repo is

A setup + automation kit for using **Robinhood** trading and banking via MCP
(Model Context Protocol), across multiple clients (Claude, Codex, Cursor,
ChatGPT). It holds:

- **Client configs** (`configs/`) for pointing each client at the Robinhood MCP
  servers.
- **A Cloudflare Worker MCP bridge** (`chatgpt-app/`, TypeScript) that exposes
  Robinhood Agentic brokerage + Crypto API tools to ChatGPT Apps, signing
  requests with Ed25519 (`@noble/curves`).
- **PowerShell helper scripts** (`scripts/`) for MCP install, startup checks, and
  storing secrets in Cloudflare / AWS.
- **Skills + evals** (`skills/`) describing the trading/banking tool flows and
  the expected safety behavior.
- **Docs** (`docs/`) for setup, secrets, and recovery.

It brokers access to **real brokerage/banking accounts** and handles **API keys,
Ed25519 private keys, and access tokens**. Default to caution. See `SECURITY.md`.

## 2. Architecture map (where everything lives)

```
chatgpt-app/                 # Cloudflare Worker (the only COMPILED component)
  src/index.ts               # JSON-RPC MCP server: tool defs + Robinhood calls
                             #   (get_*, prepare_*, review_*, place_* equity tools)
  package.json               # scripts: dev | deploy | check (tsc --noEmit) | types
  tsconfig.json              # strict TS, @cloudflare/workers-types, noEmit
  wrangler.jsonc             # Worker config (JSONC — comments allowed)

configs/                     # client-side MCP config templates
  claude-desktop/ codex/ cursor/   # per-client connector URLs / mcp.json / toml

scripts/                     # Windows PowerShell helpers (.ps1)
  install-robinhood-mcp.ps1, set-*-secrets.ps1, sync-*-secrets.ps1, test-*.ps1

skills/                      # robinhood-banking/ + robinhood-trading/
  */SKILL.md, */evals/evals.json   # tool flows + expected safety behavior

docs/                        # SETUP, SECRETS, CHATGPT_APP, *_RECOVERY, SESSION-LOG
.env.example                 # placeholder env vars (real .env is git-ignored)
```

## 3. Conventions (follow these; they are deliberate)

- **The Worker is the only thing that compiles.** Quality gate = `npm run check`
  (`tsc --noEmit`) from inside `chatgpt-app/`. Keep `tsconfig.json` strict.
- **Secrets come from runtime env / Worker bindings**, never hardcoded. Ed25519
  private keys are base64 in env (`ROBINHOOD_CRYPTO_*_PRIVATE_KEY_BASE64`).
- **Trade-safety flow:** order tools are **prepare → review → (explicit) place**.
  `prepare_agentic_equity_order` and `review_equity_order` never place an order.
  Preserve that; the evals encode it.
- **`.jsonc` allows comments** (`wrangler.jsonc`); plain `.json` must be strict
  (CI validates all tracked `.json`).
- **PowerShell scripts are Windows-oriented** and must never echo secret values.

## 4. Commands

```bash
cd chatgpt-app
npm ci            # clean install (auto on web via .claude hook)
npm run check     # tsc --noEmit  — BLOCKING in CI
npm run dev       # local wrangler dev (needs Worker vars/secrets)
npm run deploy    # wrangler deploy (owner only)
npm run types     # regenerate Worker types
```

## 5. CI / automation

- `.github/workflows/ci.yml` — (1) Worker type-check `npm run check` **blocking**,
  (2) validate all tracked `.json` **blocking**, (3) PSScriptAnalyzer **advisory**.
  **No secrets.**
- `.github/workflows/sync-robinhood-secrets-from-aws.yml` — operational AWS
  secret-sync job; uses cloud credentials, prints keys only (never values).
- `.github/dependabot.yml` — weekly bumps for the Worker's npm deps + Actions.
- `.claude/settings.json` + `.claude/session-start.sh` — runs `npm ci` in
  `chatgpt-app/` on Claude Code (web) session start.

## 6. Safety / secrets (read `SECURITY.md` in full)

- Never commit secrets. Only `.env.example` files are tracked.
- Real secret sources: local untracked bundle + Cloudflare + AWS Secrets Manager
  (`docs/SECRETS.md`, `docs/LOCAL_SECRET_SOURCE_OF_TRUTH.md`,
  `docs/CLOUDFLARE_ONLY_RECOVERY.md`).
- `@noble/curves` (request signing) is security-sensitive — patch promptly.

## 7. Definition of done for a change here

1. If the Worker was touched: `cd chatgpt-app && npm run check` passes.
2. Tracked JSON still parses.
3. Trade-safety prepare/review-before-place flow preserved.
4. No secrets added; `.env*` still ignored.
5. `CHANGELOG.md` updated for behavior/scaffolding changes; leave a note for the
   next maintainer in the PR.
