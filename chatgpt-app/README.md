# Robinhood ChatGPT App

Cloudflare-hosted MCP bridge for a private ChatGPT app that can read Robinhood
status, quote equities/crypto, and enforce explicit confirmation before crypto
orders.

## Shape

- `src/index.ts` exposes `/mcp`, `/widget`, and `/refresh-token` from one Cloudflare Worker.
- Equity tools call the Robinhood trading MCP when a fresh MCP OAuth access token is stored as a Worker secret.
- `src/refresh.ts` + the `scheduled` handler refresh that access token on a cron, gated by `TOKEN_REFRESH_ENABLED`. See [`docs/runbooks/rotate-secrets.md`](../docs/runbooks/rotate-secrets.md).
- Crypto tools call the official Robinhood Crypto Trading API with Ed25519 API credentials.
- Secrets are supplied by Cloudflare Worker secrets and can also be stored in AWS Secrets Manager for reuse from Cursor, Claude, GitHub Actions, or other projects.

## Tools

- `get_agentic_account`
- `get_equity_quote`
- `prepare_agentic_equity_order`
- `place_confirmed_agentic_equity_order`
- `cancel_equity_order` *(v0.2.0)*
- `run_no_trade_audit`
- `get_crypto_quote`
- `get_crypto_holdings` *(v0.2.0)*
- `prepare_crypto_market_buy`
- `place_confirmed_crypto_market_buy`
- `render_dashboard`

`place_confirmed_agentic_equity_order` requires the confirmation token returned
by `prepare_agentic_equity_order`.

`place_confirmed_crypto_market_buy` requires the confirmation token returned by
`prepare_crypto_market_buy`. The prepare step checks the v1 non-fee endpoint and
can enforce `buy_spread == 0`.

## Local Setup

```powershell
npm install
npm run check
npm test
wrangler dev
```

`npm test` runs the credential-free smoke and schema tests
(`tests/smoke.test.ts`, `tests/schema.test.ts`, `tests/guards.test.ts`)
via Node's built-in test runner. No Robinhood tokens are required.

For local secrets, create `.dev.vars` from `.env.example`.

## Deploy

See [`docs/runbooks/deploy-worker.md`](../docs/runbooks/deploy-worker.md).
After deploy, run the post-deploy smoke test from the repo root:

```bash
scripts/smoke-test-mcp.sh \
  --url https://robinhood-chatgpt-app.<subdomain>.workers.dev \
  --expect-version 0.2.0
```

## Cloudflare Secrets

From the repo root:

```powershell
.\scripts\sync-chatgpt-app-secrets.ps1 -Cloudflare -WorkerName robinhood-chatgpt-app
```

## AWS Secrets Manager

```powershell
.\scripts\sync-chatgpt-app-secrets.ps1 -Aws -Region us-east-2 -SecretId robinhood/chatgpt-app/config
```

## ChatGPT Developer Mode

1. Deploy the Worker: `npm run deploy`.
2. Open ChatGPT settings and enable Developer Mode for Apps.
3. Create a new app with the Worker MCP URL: `https://robinhood-chatgpt-app.edgar-sosa553.workers.dev/mcp`.
4. Ask ChatGPT: `Render the Robinhood dashboard and check my Agentic account.`

Current deployed Worker:

```text
https://robinhood-chatgpt-app.edgar-sosa553.workers.dev
```

## Important Limitations

- Robinhood MCP OAuth access tokens expire. The preferred path is the automated cron refresh in [`docs/runbooks/rotate-secrets.md §A`](../docs/runbooks/rotate-secrets.md); §B in the same runbook keeps the manual sync-script fallback for on-call use.
- The current Robinhood MCP tools are equities-focused. Crypto order tools use the separate Robinhood Crypto Trading API.
- Do not submit this as a public app until auth, privacy policy, support contact, and review-safe demo credentials are added.
