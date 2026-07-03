# Runbook: Deploy the ChatGPT App Worker

**When to use:** any change to `chatgpt-app/` needs to reach the live Cloudflare
Worker. Deploys are owner-run — CI never deploys.

**Prerequisites:** Cloudflare account access (`wrangler login` or
`CLOUDFLARE_API_TOKEN`), Node 20+, this repo checked out locally.

## Steps

1. **Gate locally** (same checks CI runs):

   ```bash
   cd chatgpt-app
   npm ci
   npm run check     # tsc --noEmit
   npm test          # vitest — safety logic
   ```

2. **Confirm secrets exist on the Worker** (names only, never values):

   ```bash
   npx wrangler secret list
   ```

   Expected names: `ROBINHOOD_MCP_TRADING_ACCESS_TOKEN`,
   `ROBINHOOD_CRYPTO_READ_API_KEY`, `ROBINHOOD_CRYPTO_READ_PRIVATE_KEY_BASE64`,
   `ROBINHOOD_CRYPTO_TRADE_API_KEY`, `ROBINHOOD_CRYPTO_TRADE_PRIVATE_KEY_BASE64`,
   `APP_SHARED_SECRET`. Missing ones → `docs/runbooks/rotate-secrets.md`.

3. **Deploy:**

   ```bash
   npm run deploy    # wrangler deploy
   ```

4. **Smoke test** the deployed endpoint (no secrets required for the read path):

   ```bash
   ../scripts/smoke-test-mcp.sh https://<worker-host>
   ```

   Pass = `initialize` answers with `serverInfo.version` matching
   `chatgpt-app/package.json`, and `tools/list` returns the full tool set.

5. **Verify a live read tool** from a connected client (Claude/Cursor/ChatGPT):
   run `run_no_trade_audit`. If it errors with "ACCESS_TOKEN is not configured"
   or a 401 from Robinhood, the OAuth token is stale →
   `docs/runbooks/rotate-secrets.md`.

## Rollback

`wrangler deploy` is versioned. Roll back from the Cloudflare dashboard
(Workers → robinhood-chatgpt-app → Deployments → promote previous), or
`git checkout <last-good-sha> -- chatgpt-app/src && npm run deploy`.

## Notes

- `wrangler.jsonc` holds only non-secret vars (URLs, `APP_ENV`).
- Never paste secret values into a terminal that logs history on a shared
  machine; use `wrangler secret put NAME` which prompts on stdin.
