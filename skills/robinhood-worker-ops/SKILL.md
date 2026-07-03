---
name: robinhood-worker-ops
description: Use when developing, testing, deploying, or troubleshooting the Cloudflare Worker MCP bridge in chatgpt-app/ — including secret rotation, smoke tests, enabling inbound auth, and handing off owner-only tasks to another agent.
---

# Robinhood Worker Ops

Use this skill when the task is operating or changing the ChatGPT app bridge
Worker (as opposed to *using* the trading/banking tools — those are the
`robinhood-trading` / `robinhood-banking` skills).

## Ground truth

- Architecture + conventions: `CLAUDE.md` (canonical), `AGENTS.md` (pointer).
- Safety logic lives in `chatgpt-app/src/lib.ts` and is unit-tested in
  `chatgpt-app/test/lib.test.ts`. `index.ts` is the I/O layer.
- Invariant: prepare → explicit confirm → place. Confirmation tokens expire in
  10 minutes. Never add a tool that places/cancels/moves money without either
  a confirmation token (placement) or explicit user intent (cancel).

## Workflow for any Worker change

1. Edit; keep pure logic in `lib.ts` with a test.
2. `cd chatgpt-app && npm run check && npm test` — both must pass (CI blocks).
3. Update `CHANGELOG.md`; bump `package.json` + `serverInfo` version for
   behavior changes.
4. Deploy is owner-run: `docs/runbooks/deploy-worker.md`. From a cloud session,
   do NOT attempt to deploy — instead check the box conditions in
   `docs/runbooks/AGENT_HANDOFF.md` and leave the deploy to H1.

## Troubleshooting map

| Symptom | Runbook |
|---|---|
| Equity tools: "ACCESS_TOKEN is not configured" / Robinhood 401 | `docs/runbooks/rotate-secrets.md` §A |
| Crypto tools: "key/private key is not configured" or 401 | `docs/runbooks/rotate-secrets.md` §B |
| Deployed Worker misbehaving | `scripts/smoke-test-mcp.sh <url>` then `docs/runbooks/deploy-worker.md` rollback |
| Anyone-can-call-/mcp concern | `docs/runbooks/security-hardening.md` |

## What to do with work you cannot finish

If a task needs live credentials, Cloudflare/AWS auth, the Windows secret
bundle, or owner accounts: append a new H-item to
`docs/runbooks/AGENT_HANDOFF.md` (context → steps → acceptance criteria →
checkbox), reference it from `BACKLOG.md`, and say so in your summary. Never
silently drop the work.
