# Robinhood MCP Kit — Agent Handoff

This runbook is the handoff surface for the P0/P1/P2 items tracked in the
`RH-*` GitHub issues. Each section is written so a fresh session (agent or
human) can pick up the work with only the repo and Edgar's Cloudflare +
Robinhood credentials.

The v0.2.0 code changes are in-repo. Anything that requires touching
Edgar's Cloudflare account or a live Robinhood session is called out
explicitly and left to Edgar.

## H1 — Deploy Worker v0.2.0 + smoke test (RH-1, P0)

**Status:** code-complete. Deploy pending.

The Worker at `chatgpt-app/` now advertises `serverInfo.version = "0.2.0"`
and ships the v0.2.0 P0 fixes:

- `cancel_equity_order` tool that forwards `{ account_number, order_id }`
  to the trading MCP (matches the upstream tool list documented in
  `README.md`).
- `get_crypto_holdings` tool that signs a GET to the v1 crypto holdings
  endpoint and optionally filters by `asset_code`.
- JWT access-token expiry check: the Worker refuses to make an equity MCP
  call if the OAuth access token's `exp` is in the past.
- Numeric buy-spread guard: parses `buy_spread` numerically instead of
  matching a hand-written list of zero-string variants.
- Deterministic `client_order_id` for confirmed crypto market buys,
  derived via HMAC(APP_SHARED_SECRET, canonical order payload). Repeats
  of the same confirmed order carry the same id so Robinhood can dedupe.
- Fix for a pre-existing bug where account numbers were redacted before
  the Worker used them in subsequent upstream calls (would have broken
  cancel/review/place equity flows in production).
- Opt-in inbound `/mcp` bearer auth, gated by `MCP_REQUIRE_AUTH=true`
  (kept off by default so ChatGPT Developer Mode still works without an
  extra header; flipping it on is RH-3).

### Acceptance

- `chatgpt-app/tests/*.test.ts` (`npm test`) passes without live
  credentials.
- After deploy: `scripts/smoke-test-mcp.sh --url <deployed-url> --expect-version 0.2.0`
  exits 0.

### Steps (for Edgar or an agent with Cloudflare access)

Follow `docs/runbooks/deploy-worker.md`. The short version:

```powershell
cd chatgpt-app
npm ci
npm run check
npm test
npm run deploy
```

Then from the repo root:

```bash
scripts/smoke-test-mcp.sh \
  --url https://robinhood-chatgpt-app.<subdomain>.workers.dev \
  --expect-version 0.2.0
```

### What this session could not do

- Deploy to Edgar's Cloudflare account. `wrangler deploy` requires an
  interactive `wrangler login`.
- Run the smoke script against the deployed URL. It ran against a local
  `wrangler dev` instance to prove the script works end-to-end without
  live credentials.

## H2 — Verify `cancel_equity_order` args against the MCP schema (RH-2, P0)

**Status:** verified in-repo. No live cancel was performed.

The upstream tool inventory documented in `README.md` and
`docs/SESSION-LOG.md` lists the trading MCP tools including
`cancel_equity_order`. The other order tools (`place_equity_order`,
`review_equity_order`) take `{ account_number, symbol, side, type, … }`,
so `cancel_equity_order` is expected to follow the same convention with
`{ account_number, order_id }`.

`chatgpt-app/tests/schema.test.ts` locks that shape in with a mocked
upstream MCP endpoint. It asserts:

- The Worker's `cancel_equity_order` tool forwards exactly
  `{ account_number, order_id }` to the trading MCP (no extra keys, no
  missing keys, no snake_case/camelCase drift).
- `account_number` is the un-redacted number from `get_accounts` (not the
  masked `••••XXXX` string that shows up in tool responses).
- Callers can pass either `orderId` (camelCase from the tool schema) or
  `order_id` (snake_case for parity with the upstream).
- Missing `orderId` returns a clean RPC error, not a live network call.
- Requests carry the `Authorization: Bearer …` and
  `MCP-Protocol-Version: 2025-03-26` headers the upstream MCP requires.
- An expired OAuth access token short-circuits *before* any upstream
  call — no live cancel is ever attempted with stale creds.

### If Edgar wants to double-check against a live MCP session

Without placing a cancel, run `codex mcp list --json` and look at the
`cancel_equity_order` entry to confirm its input schema. If it drifts
from `{ account_number, order_id }`, adjust `cancelEquityOrder` in
`chatgpt-app/src/index.ts` and the corresponding schema test.

## H3 — Enable inbound `/mcp` auth (RH-3, P1) [not in this PR]

Left for a later PR. The Worker already implements the auth check
(`isMcpAuthorized`, gated by `MCP_REQUIRE_AUTH`). Flipping the flag on
requires updating the ChatGPT app connector to send
`Authorization: Bearer <APP_SHARED_SECRET>` and confirming
`scripts/smoke-test-mcp.sh --shared-secret …` passes.

## H4 — Banking MCP tools (RH-4, P1) [not in this PR]

Left for a later PR.

## H5 — Automate MCP OAuth token refresh (RH-5, P1) [not in this PR]

Left for a later PR. The v0.2.0 Worker at least surfaces expired tokens
with a clean, actionable error instead of a confusing upstream 401.

## H8 — Firebase journal + dashboard (RH-8, P2) [not in this PR]

Left for a later PR.
