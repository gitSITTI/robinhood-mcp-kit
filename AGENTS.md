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
```
Plus: all tracked `.json` must parse (CI gate); PSScriptAnalyzer is advisory.

## Hard rules

1. Order tools are **prepare → review → (explicit) place**; never add silent
   order placement. The evals in `skills/*/evals/evals.json` encode this.
2. Never commit secrets; only `.env.example` files are tracked (see `SECURITY.md`).
   Ed25519 keys live base64 in env, never in code.
3. `.jsonc` permits comments; plain `.json` must stay strict.
4. Update `CHANGELOG.md` for behavior/scaffolding changes.
