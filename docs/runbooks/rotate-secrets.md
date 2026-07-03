# Runbook: Rotate Worker Secrets & Refresh the Robinhood OAuth Token

**When to use:** equity tools fail with auth errors (stale OAuth token), on a
schedule for the crypto keys, or immediately after any suspected exposure.

## A. Refresh the Robinhood MCP OAuth access token (most common)

The Worker calls the Robinhood trading MCP with a bearer token that expires.
Until issue "Automate OAuth token refresh" (see BACKLOG.md) lands, this is a
manual sync:

1. On the Windows ops machine, authenticate a Robinhood MCP client so a fresh
   token lands in its credential store (e.g. Claude Code:
   `~/.claude/.credentials.json` — see `docs/SECRETS.md`).
2. Push the fresh token (and the rest of the bundle) to Cloudflare + AWS:

   ```powershell
   .\scripts\sync-chatgpt-app-secrets.ps1 -Cloudflare -Aws -WorkerName robinhood-chatgpt-app -Region us-east-2
   ```

   If AWS login is unavailable, use the Cloudflare-only path:
   `docs/CLOUDFLARE_ONLY_RECOVERY.md`.
3. Verify: run `run_no_trade_audit` from any connected client, or
   `scripts/smoke-test-mcp.sh <worker-url>` for the unauthenticated read path.

## B. Rotate the Robinhood Crypto API keys

1. In the Robinhood Crypto API portal, create a replacement key pair for the
   affected scope (read or trade). Keep read and trade keys separate.
2. Base64 of the Ed25519 private key goes in
   `ROBINHOOD_CRYPTO_{READ|TRADE}_PRIVATE_KEY_BASE64`; the API key id in
   `ROBINHOOD_CRYPTO_{READ|TRADE}_API_KEY`.
3. Update the local untracked bundle (`docs/LOCAL_SECRET_SOURCE_OF_TRUTH.md`),
   then sync as in step A.2.
4. Revoke the old key in the portal **after** the new one is verified
   (`get_crypto_quote` for read; a guarded USDC-USD prepare for trade).

## C. Rotate APP_SHARED_SECRET

This secret signs order confirmation tokens and (when `MCP_REQUIRE_AUTH=true`)
gates inbound `/mcp` requests.

1. Generate 32+ random bytes (`openssl rand -base64 32`).
2. `npx wrangler secret put APP_SHARED_SECRET` (prompts for the value).
3. If inbound auth is enabled, update every connector URL/header that carries
   the secret (see `security-hardening.md`).
4. In-flight confirmation tokens become invalid — that is intended.

## Exposure response (any secret)

1. Rotate per the section above — revoke first if the exposure is active.
2. Check Robinhood account activity for unexpected orders; cancel via
   `cancel_equity_order` or the Robinhood app.
3. Note the incident in `docs/SESSION-LOG.md` (sanitized).
