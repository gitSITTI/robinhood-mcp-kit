# Changelog

All notable changes to this repo. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). This repo is not versioned for
release; entries are grouped by date.

## [Unreleased]

### Worker 0.2.0 — safety hardening + full-usability pass (2026-07-03)

Safety fixes (behavior changes — deploy required, see runbooks/AGENT_HANDOFF H1):
- **Confirmation tokens now expire after 10 minutes** (HMAC bound to order
  params + issued-at). Stale confirmations can no longer place orders.
- **Idempotent crypto orders:** `client_order_id` is derived from the
  confirmation token instead of random-at-placement, so a timed-out retry
  cannot double-buy.
- **Zero-buy-spread guard is numeric** (`0.000000` counts as zero; non-numeric
  values now fail instead of silently passing the string comparison).
- **Opt-in inbound auth on `/mcp`** (`MCP_REQUIRE_AUTH=true`): Bearer
  `APP_SHARED_SECRET` header or `/mcp/<secret>` path for URL-only connectors.
  Default off for connector compatibility — see runbooks/security-hardening.md.

New tools:
- `get_crypto_holdings` (read-only holdings, optional asset filter).
- `cancel_equity_order` (proxy; arg names pending live-schema verification —
  BACKLOG RH-2). `run_no_trade_audit` now includes crypto holdings.

Structure & tests:
- Safety logic extracted to `chatgpt-app/src/lib.ts`; new vitest suite
  (`test/lib.test.ts`, 24 tests) blocking in CI alongside the type-check.

Ops & planning:
- `docs/runbooks/`: deploy-worker, rotate-secrets, security-hardening, and
  **AGENT_HANDOFF.md** (owner-only tasks written for any agent to execute).
- `scripts/smoke-test-mcp.sh` — post-deploy verification, no secrets needed.
- `skills/robinhood-worker-ops/` — skill for operating the Worker itself.
- `BACKLOG.md` ticket registry (mirrored to GitHub issues) and
  `docs/EXPANSION.md` (Firebase / Cloudflare free tier / sosaclaw plan).

### Added — repo workflow & scaffolding QA (2026-06-05)
Brought the repo up to a standard scaffolding/CI baseline. All additive; no
existing Worker, script, config, or doc content was changed.

- **CI:** `.github/workflows/ci.yml` — Worker type-check (`npm run check`,
  blocking), tracked-JSON validation (blocking), PSScriptAnalyzer (advisory).
  Previously the Worker's `tsc` check ran nowhere.
- **Dependabot:** `.github/dependabot.yml` — weekly bumps for `chatgpt-app` npm
  deps (incl. the security-sensitive `@noble/curves`) + GitHub Actions.
- **Governance:** `LICENSE` (proprietary, all rights reserved), `SECURITY.md`,
  `CONTRIBUTING.md`, `.github/CODEOWNERS`, PR template, issue templates.
- **Agent context:** `CLAUDE.md` (canonical architecture/convention guide) and
  `AGENTS.md` (cross-tool pointer) so any LLM can continue the work.
- **Web sessions:** `.claude/settings.json` + `.claude/session-start.sh`
  SessionStart hook runs `npm ci` in `chatgpt-app/` on Claude Code (web) start.
- **Editor/commit hygiene:** `.editorconfig`, `.pre-commit-config.yaml`.
