# Deploy the Robinhood ChatGPT MCP Worker

Runbook for shipping the `robinhood-chatgpt-app` Cloudflare Worker to Edgar's
Cloudflare account and confirming a healthy release. This runbook is the
`docs/runbooks/AGENT_HANDOFF.md#h1` acceptance path.

The deploy step itself cannot be performed from a cloud agent session — it
requires an interactive `wrangler login` against Edgar's Cloudflare account.
Do the deploy from a local machine that already has `wrangler` authenticated,
then use `scripts/smoke-test-mcp.sh` to confirm.

## Prerequisites

- Node.js 22.x and npm 10+
- Wrangler authenticated: `npx wrangler whoami` shows Edgar's Cloudflare account
- Repo checked out on the branch that is being deployed (never deploy
  straight from `main` without a PR)
- All Cloudflare Worker secrets already synced (see `docs/CHATGPT_APP.md`)

## Required secrets

The Worker refuses to hit upstreams without these:

- `ROBINHOOD_MCP_TRADING_ACCESS_TOKEN` — MCP OAuth access token for the
  trading endpoint. The Worker rejects expired JWTs before making a
  network call.
- `ROBINHOOD_CRYPTO_READ_API_KEY`, `ROBINHOOD_CRYPTO_READ_PRIVATE_KEY_BASE64`
- `ROBINHOOD_CRYPTO_TRADE_API_KEY`, `ROBINHOOD_CRYPTO_TRADE_PRIVATE_KEY_BASE64`
- `APP_SHARED_SECRET` — used to sign confirmation tokens and, when
  `MCP_REQUIRE_AUTH=true`, to authenticate inbound `/mcp` calls.

Optional bindings (set as `vars`, not secrets):

- `MCP_REQUIRE_AUTH=true` — turns on inbound `/mcp` bearer-token auth.
  Off by default so the ChatGPT app connector can complete `initialize`
  without an extra header. See RH-3 for the plan to flip this on.

## Deploy

```powershell
cd chatgpt-app
npm ci
npm run check
npm test
npm run deploy
```

`npm test` runs the credential-free smoke and schema tests (`node --test`)
and must pass before deploy. `npm run deploy` runs `wrangler deploy`
against the account currently logged in.

Confirm the deploy printed the expected route, e.g.
`https://robinhood-chatgpt-app.<subdomain>.workers.dev`.

## Post-deploy smoke test

Run the shared smoke script against the live URL. No live Robinhood
credentials are needed for the routes it hits.

```bash
scripts/smoke-test-mcp.sh \
  --url https://robinhood-chatgpt-app.<subdomain>.workers.dev \
  --expect-version 0.2.0
```

If the Worker is running with `MCP_REQUIRE_AUTH=true`, add
`--shared-secret <APP_SHARED_SECRET>` so the script can also verify that
missing bearers are rejected.

Expected output ends with `All smoke checks passed.`

## Acceptance criteria (matches RH-1)

- `curl <URL>/` returns `serverInfo.version == "0.2.0"`.
- `POST /mcp` with `initialize` returns `result.serverInfo.version == "0.2.0"`.
- `POST /mcp` with `tools/list` includes `cancel_equity_order` and
  `get_crypto_holdings` in addition to the tools shipped in 0.1.0.
- `scripts/smoke-test-mcp.sh --url … --expect-version 0.2.0` exits 0.

## Rollback

If the smoke script fails and the release must be rolled back:

```powershell
cd chatgpt-app
npx wrangler deployments list --name robinhood-chatgpt-app
npx wrangler rollback --name robinhood-chatgpt-app --deployment-id <previous-id>
```

Then run the smoke script again against the same URL to confirm the
previous version is serving.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `initialize` reports 0.1.0 | Wrangler deployed the wrong worktree | Re-run `npm run deploy` from the branch that contains `serverInfo.version = "0.2.0"` |
| `cancel_equity_order` returns "expired" errors | JWT in the Worker secret has expired | Refresh MCP OAuth (`codex mcp login robinhood-trading`) and re-sync secrets; see `docs/CHATGPT_APP.md` |
| Smoke script prints `HTTP 401` for `initialize` | Worker has `MCP_REQUIRE_AUTH=true` set | Pass `--shared-secret <APP_SHARED_SECRET>` to the script |
| `tools/list` missing new tools | Old worker still cached at the edge | Run `npx wrangler deployments list` to confirm the newest deployment id matches the local build |
