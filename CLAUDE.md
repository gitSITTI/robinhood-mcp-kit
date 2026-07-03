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
  src/index.ts               # I/O layer: routing, tool defs, upstream fetches
                             #   (Robinhood trading MCP + Crypto API), dispatch
  src/lib.ts                 # SAFETY-CRITICAL pure logic: order normalization,
                             #   confirmation tokens (10-min expiry), zero-spread
                             #   guard, idempotent client_order_id, inbound auth,
                             #   account-number redaction. Unit-tested.
  test/lib.test.ts           # vitest suite for lib.ts — `npm test`, blocks CI
  package.json               # dev | deploy | check (tsc --noEmit) | test | types
  tsconfig.json              # strict TS, @cloudflare/workers-types, noEmit
  wrangler.jsonc             # Worker config (JSONC — comments allowed)

configs/                     # client-side MCP config templates
  claude-desktop/ codex/ cursor/   # per-client connector URLs / mcp.json / toml

scripts/                     # PowerShell helpers (.ps1, Windows ops machine) +
  smoke-test-mcp.sh          #   bash smoke test for the deployed Worker

skills/                      # robinhood-banking/ + robinhood-trading/ (tool use)
  robinhood-worker-ops/      #   + operating/changing the Worker itself
  */SKILL.md, */evals/evals.json

docs/                        # SETUP, SECRETS, CHATGPT_APP, *_RECOVERY, SESSION-LOG
  runbooks/                  # deploy-worker, rotate-secrets, security-hardening,
                             #   AGENT_HANDOFF (owner-only tasks for other agents)
  EXPANSION.md               # Firebase / Cloudflare / sosaclaw plan
BACKLOG.md                   # ticket registry (mirrored to GitHub issues)
.env.example                 # placeholder env vars (real .env is git-ignored)
```

## 3. Conventions (follow these; they are deliberate)

- **The Worker is the only thing that compiles.** Quality gates = `npm run check`
  (`tsc --noEmit`) **and** `npm test` (vitest) from inside `chatgpt-app/`.
- **Pure logic goes in `src/lib.ts` with a test; `src/index.ts` stays I/O.**
- **Secrets come from runtime env / Worker bindings**, never hardcoded. Ed25519
  private keys are base64 in env (`ROBINHOOD_CRYPTO_*_PRIVATE_KEY_BASE64`).
- **Trade-safety flow:** order tools are **prepare → review → (explicit) place**.
  Prepare tools never place; confirmation tokens are HMAC-bound to the exact
  order params and **expire after 10 minutes**; the crypto `client_order_id`
  is derived from the confirmation token so retries cannot double-fill.
  Preserve all of that; the evals and unit tests encode it.
- **Work you can't finish from a cloud session** (deploys, live-token checks,
  owner accounts) goes into `docs/runbooks/AGENT_HANDOFF.md` as a numbered
  H-item with steps + acceptance criteria, referenced from `BACKLOG.md`.
- **`.jsonc` allows comments** (`wrangler.jsonc`); plain `.json` must be strict
  (CI validates all tracked `.json`).
- **PowerShell scripts are Windows-oriented** and must never echo secret values.

## 4. Commands

```bash
cd chatgpt-app
npm ci            # clean install (auto on web via .claude hook)
npm run check     # tsc --noEmit  — BLOCKING in CI
npm test          # vitest safety-logic suite — BLOCKING in CI
npm run dev       # local wrangler dev (needs Worker vars/secrets)
npm run deploy    # wrangler deploy (owner only — docs/runbooks/deploy-worker.md)
npm run types     # regenerate Worker types

../scripts/smoke-test-mcp.sh https://<worker-host> [shared-secret]  # post-deploy
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

1. If the Worker was touched: `cd chatgpt-app && npm run check && npm test` pass.
2. Tracked JSON still parses.
3. Trade-safety prepare/review-before-place flow preserved (tokens expire,
   client_order_id stays deterministic per confirmation).
4. No secrets added; `.env*` still ignored.
5. `CHANGELOG.md` updated for behavior/scaffolding changes; leave a note for the
   next maintainer in the PR.
6. Anything requiring live credentials/owner accounts is recorded in
   `docs/runbooks/AGENT_HANDOFF.md` + `BACKLOG.md`, not silently skipped.

## 8. Operational docs index

- `docs/runbooks/deploy-worker.md` — build → deploy → smoke test → rollback.
- `docs/runbooks/rotate-secrets.md` — OAuth token refresh, crypto keys,
  APP_SHARED_SECRET, exposure response.
- `docs/runbooks/security-hardening.md` — enabling inbound `/mcp` auth.
- `docs/runbooks/AGENT_HANDOFF.md` — owner-only tasks, written for any agent.
- `BACKLOG.md` — ticket registry (mirrored to GitHub issues).
- `docs/EXPANSION.md` — Firebase / Cloudflare free tier / sosaclaw plan.
