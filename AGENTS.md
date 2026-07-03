# AGENTS.md

Cross-tool entry point for AI coding agents (Cursor, Codex, Copilot, Aider, and
any other LLM-based tool). This file follows the `AGENTS.md` convention so
non-Claude agents get the same context Claude does.

## Canonical context lives in `CLAUDE.md`

**Read [`CLAUDE.md`](./CLAUDE.md) first — it is the single source of truth** for
architecture, conventions, and the definition of done. Everything below is a
condensed pointer; if anything here is thinner than `CLAUDE.md`, defer to it.

## 60-second orientation

- **What:** private kit to use **Robinhood** trading/banking via MCP across
  Claude/Codex/Cursor/ChatGPT. Handles real keys/tokens → be cautious.
- **Compiled component:** the Cloudflare Worker MCP bridge in `chatgpt-app/`
  (TypeScript). Everything else is configs, PowerShell scripts, skills, docs.
- **Quality gate:** `cd chatgpt-app && npm run check` (`tsc --noEmit`).

## Setup & checks

```bash
cd chatgpt-app && npm ci   # install
npm run check              # tsc --noEmit — BLOCKING in CI
npm test                   # vitest safety suite — BLOCKING in CI
```
Plus: all tracked `.json` must parse (CI gate); PSScriptAnalyzer is advisory.

## Hard rules

1. Order tools are **prepare → review → (explicit) place**; never add silent
   order placement. Confirmation tokens expire in 10 minutes; the crypto
   `client_order_id` is derived from the token (retry-idempotent). The evals
   in `skills/*/evals/evals.json` and `chatgpt-app/test/lib.test.ts` encode this.
2. Never commit secrets; only `.env.example` files are tracked (see `SECURITY.md`).
   Ed25519 keys live base64 in env, never in code.
3. Pure logic goes in `chatgpt-app/src/lib.ts` **with a unit test**;
   `index.ts` stays a thin I/O layer.
4. `.jsonc` permits comments; plain `.json` must stay strict.
5. Update `CHANGELOG.md` for behavior/scaffolding changes.

## If you cannot finish a task from this environment

Deploys, live-token verification, secret rotation, and owner-account setup
cannot run from cloud/CI sessions. **Do not fake or skip them silently.**
Record the task in `docs/runbooks/AGENT_HANDOFF.md` (context → exact steps →
acceptance criteria → checkbox) and reference it from `BACKLOG.md`. That file
is the standing work queue for whichever agent — Codex, Claude, Cursor, or a
human — next has the required access. Execute open H-items top-down when you
DO have access.
