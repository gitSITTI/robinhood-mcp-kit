# ChatGPT App Bridge

This repo includes a private ChatGPT app scaffold in `chatgpt-app/`.

## Why A Bridge App

Robinhood has two useful integration surfaces:

- Robinhood trading MCP for the Agentic brokerage account and equities.
- Robinhood Crypto Trading API for crypto quotes/orders.

The bridge keeps ChatGPT pointed at one MCP endpoint while the Worker handles
both upstreams. Secrets stay in Cloudflare Worker secrets and AWS Secrets
Manager instead of GitHub, Cursor, Claude, or ChatGPT instructions.

## Secret Locations

Cloudflare Worker secrets:

- `ROBINHOOD_MCP_TRADING_ACCESS_TOKEN`
- `ROBINHOOD_CRYPTO_READ_API_KEY`
- `ROBINHOOD_CRYPTO_READ_PRIVATE_KEY_BASE64`
- `ROBINHOOD_CRYPTO_TRADE_API_KEY`
- `ROBINHOOD_CRYPTO_TRADE_PRIVATE_KEY_BASE64`
- `APP_SHARED_SECRET`

AWS Secrets Manager:

- Default secret ID: `robinhood/chatgpt-app/config`
- Default region: `us-east-2`

Sync command:

```powershell
.\scripts\sync-chatgpt-app-secrets.ps1 -Cloudflare -Aws -WorkerName robinhood-chatgpt-app -Region us-east-2
```

If AWS is not authenticated yet, run:

```powershell
.\scripts\aws-login-and-sync-chatgpt-app-secrets.ps1 -Region us-east-2 -SecretId robinhood/chatgpt-app/config
```

The command starts `aws login --remote`, asks for the browser authorization
code, verifies `sts get-caller-identity`, and then writes the same secret bundle
to AWS Secrets Manager.

## Reuse From Other Projects

Cursor, Claude, GitHub Actions, or other projects should pull from AWS Secrets
Manager or Cloudflare secrets rather than copying credentials into repos.

Until AWS is available, use Cloudflare as the source of truth. See
`docs/CLOUDFLARE_ONLY_RECOVERY.md`.

Expected JSON shape in AWS:

```json
{
  "ROBINHOOD_MCP_TRADING_URL": "https://agent.robinhood.com/mcp/trading",
  "ROBINHOOD_MCP_TRADING_ACCESS_TOKEN": "...",
  "ROBINHOOD_CRYPTO_API_BASE": "https://trading.robinhood.com",
  "ROBINHOOD_CRYPTO_READ_API_KEY": "...",
  "ROBINHOOD_CRYPTO_READ_PRIVATE_KEY_BASE64": "...",
  "ROBINHOOD_CRYPTO_TRADE_API_KEY": "...",
  "ROBINHOOD_CRYPTO_TRADE_PRIVATE_KEY_BASE64": "...",
  "APP_SHARED_SECRET": "..."
}
```

## Deployment

```powershell
cd chatgpt-app
npm install
npm run check
npm run deploy
```

Connect ChatGPT Developer Mode to:

```text
https://robinhood-chatgpt-app.edgar-sosa553.workers.dev/mcp
```

Current Cloudflare deployment:

```text
https://robinhood-chatgpt-app.edgar-sosa553.workers.dev
```

Cloudflare secrets have been uploaded for the Worker. AWS Secrets Manager sync
is scripted, but the local AWS CLI needs `aws login` or another credential
provider before `robinhood/chatgpt-app/config` can be written.

## Safety Model

- Read tools are marked read-only.
- Agentic equity placement requires `prepare_agentic_equity_order` first.
- `place_confirmed_agentic_equity_order` requires a confirmation token tied to the exact Agentic order.
- Crypto placement requires `prepare_crypto_market_buy` first.
- `place_confirmed_crypto_market_buy` requires a confirmation token tied to the exact symbol, quantity, side, and guard.
- The default guard uses Robinhood Crypto v1 and requires zero buy spread unless explicitly disabled.
- The current deployed Worker passes `tools/list` and read-only `get_crypto_quote`.
- `prepare_crypto_market_buy` returns a confirmation token and does not place an order.
- `run_no_trade_audit` checks account, equity positions/orders, and crypto quote state without placing orders.
