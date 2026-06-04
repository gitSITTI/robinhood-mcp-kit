# Robinhood ChatGPT App

Cloudflare-hosted MCP bridge for a private ChatGPT app that can read Robinhood
status, quote equities/crypto, and enforce explicit confirmation before crypto
orders.

## Shape

- `src/index.ts` exposes `/mcp` and `/widget` from one Cloudflare Worker.
- Equity tools call the Robinhood trading MCP when a fresh MCP OAuth access token is stored as a Worker secret.
- Crypto tools call the official Robinhood Crypto Trading API with Ed25519 API credentials.
- Secrets are supplied by Cloudflare Worker secrets and can also be stored in AWS Secrets Manager for reuse from Cursor, Claude, GitHub Actions, or other projects.

## Tools

- `get_agentic_account`
- `get_equity_quote`
- `get_crypto_quote`
- `prepare_crypto_market_buy`
- `place_confirmed_crypto_market_buy`
- `render_dashboard`

`place_confirmed_crypto_market_buy` requires the confirmation token returned by
`prepare_crypto_market_buy`. The prepare step checks the v1 non-fee endpoint and
can enforce `buy_spread == 0`.

## Local Setup

```powershell
npm install
npm run check
wrangler dev
```

For local secrets, create `.dev.vars` from `.env.example`.

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

- Robinhood MCP OAuth access tokens expire. Use the sync script to refresh the Worker secret from local Codex credentials when needed.
- The current Robinhood MCP tools are equities-focused. Crypto order tools use the separate Robinhood Crypto Trading API.
- The deployed app currently identifies the Agentic account through Robinhood MCP, but portfolio detail may be empty through the Worker bridge until the upstream MCP response handling is tightened further.
- Do not submit this as a public app until auth, privacy policy, support contact, and review-safe demo credentials are added.
