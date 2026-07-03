# AGENT HANDOFF — tasks a cloud/CI agent cannot finish here

> **Audience: any capable coding agent** (Codex, Claude Sonnet/Opus, Cursor,
> a human) working **on the owner's machine or with live credentials**. A
> cloud repo session (Claude Code web, CI) cannot do these because they need
> Cloudflare auth, live Robinhood tokens, the Windows secret bundle, or
> owner-only accounts. Each task is self-contained: context → steps →
> acceptance criteria. Do them top-down; check the box and commit this file
> when one is done.

Conventions for the executing agent:
- Never print secret **values**; names only. Never commit `.env*` (only
  `.env.example` is tracked). Read `SECURITY.md` first.
- The prepare → confirm → place trade-safety flow must survive every change.
- After any Worker change: `cd chatgpt-app && npm run check && npm test`.

---

## H1. Deploy Worker v0.2.0 and smoke-test it  ⬅ do this first

**Context:** the repo now contains safety fixes (confirmation-token expiry,
idempotent crypto `client_order_id`, numeric zero-spread guard, opt-in inbound
auth) and two new tools (`get_crypto_holdings`, `cancel_equity_order`). None
of it is live until deployed.

**Steps:** follow `docs/runbooks/deploy-worker.md` (npm check + test →
`npm run deploy` → `scripts/smoke-test-mcp.sh https://<worker-host>`).

**Accept when:** smoke test prints `SMOKE TEST PASSED` and `initialize`
reports version `0.2.0`.

- [ ] done (date/agent: __________)

## H2. Verify `cancel_equity_order` argument names against the live MCP

**Context:** the Worker proxies `cancel_equity_order` with
`{account_number, order_id}` — inferred from the documented tool list, **not
verified against the live schema** (no live token in the cloud session).

**Steps:** with a valid OAuth token, POST `tools/list` to
`https://agent.robinhood.com/mcp/trading` and read the `cancel_equity_order`
input schema. If the argument names differ, fix `cancelEquityOrder()` in
`chatgpt-app/src/index.ts`, run checks, commit.

**Accept when:** a real (small, already-filled-or-cancelled-safe) cancel round
trip returns success, or the schema is confirmed to match as written.

- [ ] done (date/agent: __________)

## H3. Enable inbound auth (`MCP_REQUIRE_AUTH=true`)

**Context:** `/mcp` is currently open by default. The code path is shipped and
unit-tested; enabling is a connector-coordination task, not a code task.

**Steps:** follow `docs/runbooks/security-hardening.md` exactly (update
connectors first, flip flag last).

**Accept when:** bare `/mcp` returns 401; all clients still work;
`smoke-test-mcp.sh <url> <secret>` fully passes.

- [ ] done (date/agent: __________)

## H4. Wire the Robinhood **banking** MCP into the Worker

**Context:** the banking tools (`banking_get_agent_card_balance`, `_status`,
`_transactions`, `_policy`, …) are documented in `README.md` and used by the
`skills/robinhood-banking` skill, but the Worker only bridges the trading MCP.
"All account information" is incomplete without the card.

**Steps:**
1. Add env vars `ROBINHOOD_MCP_BANKING_URL`
   (`https://banking-agent.robinhood.com/mcp/banking`) and
   `ROBINHOOD_MCP_BANKING_ACCESS_TOKEN` (Worker secret).
2. Generalize `robinhoodMcpTool()` to take a target (trading|banking) or add a
   `robinhoodBankingTool()` sibling.
3. Expose read-only tools first: `get_card_balance`, `get_card_status`,
   `get_card_transactions` (proxy the `banking_*` names; verify exact arg
   schemas via live `tools/list` — needs the banking OAuth token).
4. Add the card summary to `run_no_trade_audit`.
5. Unit-test any new pure logic in `lib.ts`; update README/CLAUDE.md/CHANGELOG.

**Accept when:** a connected client can read card balance + recent
transactions through the bridge with account numbers masked.

- [ ] done (date/agent: __________)

## H5. Automate the OAuth token refresh

**Context:** the trading-MCP access token is synced manually
(`rotate-secrets.md` §A) and expires, which is the #1 operational failure.

**Steps (design freedom allowed):** the clean path is a scheduled Worker (cron
trigger) or a Windows scheduled task that runs the OAuth refresh-token flow
and calls `wrangler secret put` / the Cloudflare API. Refresh tokens live in
the client credential store (`docs/SECRETS.md`). Store the refresh token as a
Worker secret only if the refresh flow is moved fully into the Worker.

**Accept when:** equity tools survive >24h without a manual sync, and the
refresh path is documented in `rotate-secrets.md`.

- [ ] done (date/agent: __________)

## H6. Expansion phase 1 — Firebase + sosaclaw (owner accounts required)

**Context:** see `docs/EXPANSION.md` for the full plan and the assumptions
that need confirming (especially what "sosaclaw" hosting should look like).

**Steps:** per EXPANSION.md phase 1: create the Firebase project (Spark),
Firestore for the sanitized audit journal, decide the dashboard host
(Cloudflare Pages on the sosaclaw domain is the default), wire DNS.

**Accept when:** `run_no_trade_audit` results can be persisted to Firestore
via an explicit opt-in script (never automatically), and a static dashboard
loads on the chosen domain.

- [ ] done (date/agent: __________)

## H7. PSScriptAnalyzer findings sweep (advisory job)

**Context:** CI's PSScriptAnalyzer job is report-only. Nobody has triaged its
warnings on the `scripts/*.ps1` helpers.

**Steps:** run `Invoke-ScriptAnalyzer -Path scripts -Recurse` locally on
Windows (pwsh), fix Error-severity findings, note deliberate suppressions
inline with `[Diagnostics.CodeAnalysis.SuppressMessageAttribute]`.

**Accept when:** the advisory CI job log shows zero Error-severity findings.

- [ ] done (date/agent: __________)
