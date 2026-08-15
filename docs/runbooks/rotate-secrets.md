# Rotate the Robinhood MCP OAuth access token

This runbook covers **RH-5 / H5** — keeping the Cloudflare Worker's
`ROBINHOOD_MCP_TRADING_ACCESS_TOKEN` secret fresh without the operator
running `wrangler secret put` by hand.

There are two paths, in order of preference:

- **§A — Automated refresh (Cloudflare cron)**: the recommended path.
  The Worker itself refreshes the access token on a schedule and writes
  the new value back to its own secret binding via the Cloudflare API.
- **§B — Manual refresh**: the pre-v0.2.0 workflow. Kept as a fallback
  when the automated path is not yet provisioned or has failed and the
  on-call operator needs to unblock trading before the next cron tick.

Both paths write the same secret names, so they are safe to interleave.

## §A — Automated refresh (Cloudflare cron)

### One-time provisioning (operator, Cloudflare account access required)

The Worker code (`chatgpt-app/src/refresh.ts` + the `scheduled` handler
in `src/index.ts`) is credential-free and gated on `TOKEN_REFRESH_ENABLED`.
It stays disabled — even with the cron trigger installed — until the
operator flips the flag and provides the required secrets.

1. Confirm the cron trigger is deployed. `chatgpt-app/wrangler.jsonc`
   already declares:

   ```jsonc
   "triggers": {
     "crons": ["*/15 * * * *"]
   }
   ```

   After `npm run deploy`, Cloudflare's dashboard should list the cron
   under Workers → `robinhood-chatgpt-app` → Triggers → Cron Triggers.

2. Create a **scoped** Cloudflare API token for the Worker's own account.
   Required permission: **Account → Workers Scripts → Edit** on the
   account that hosts `robinhood-chatgpt-app` (account id
   `d1ef200da61cc67c8c6399fc3b8ff5d8`, per
   `docs/LOCAL_SECRET_SOURCE_OF_TRUTH.md`). No other permissions are
   needed. Do not use the account-wide global API key.

3. Set the runtime configuration. Non-secret values go in
   `wrangler.jsonc → vars` (already present); the rest are Worker
   secrets:

   | Kind   | Name                                       | Purpose |
   |--------|--------------------------------------------|---------|
   | var    | `TOKEN_REFRESH_ENABLED`                    | Flip to `"true"` when everything below is set. Default `"false"`. |
   | var    | `TOKEN_REFRESH_THRESHOLD_SECONDS`          | Seconds of runway required to skip a refresh. Default `"1800"` (30 minutes). |
   | var    | `ROBINHOOD_MCP_OAUTH_TOKEN_ENDPOINT`       | OAuth token endpoint (from the trading MCP's OAuth discovery metadata). |
   | var    | `ROBINHOOD_MCP_OAUTH_CLIENT_ID`            | Public OAuth client id used by Codex/Claude for the trading MCP. |
   | var    | `CLOUDFLARE_ACCOUNT_ID`                    | `d1ef200da61cc67c8c6399fc3b8ff5d8`. |
   | var    | `CLOUDFLARE_WORKER_NAME`                   | `robinhood-chatgpt-app`. |
   | secret | `ROBINHOOD_MCP_TRADING_REFRESH_TOKEN`      | The current refresh token issued alongside the access token. |
   | secret | `CLOUDFLARE_SECRETS_API_TOKEN`             | The scoped API token from step 2. |
   | secret | `ROBINHOOD_MCP_TRADING_ACCESS_TOKEN`       | (Already present.) The Worker overwrites this on every successful refresh. |

   The token endpoint URL and client id are not secrets per
   `docs/SECRETS.md`, so they belong in `vars`. The refresh token and
   the Cloudflare API token are secrets.

4. Deploy and flip the flag:

   ```powershell
   cd chatgpt-app
   npx wrangler secret put ROBINHOOD_MCP_TRADING_REFRESH_TOKEN
   npx wrangler secret put CLOUDFLARE_SECRETS_API_TOKEN
   # then set the vars via wrangler.jsonc or `wrangler deploy --var …`
   npm run deploy
   ```

   Set `TOKEN_REFRESH_ENABLED=true` last. Until that flag is `true`, the
   scheduled handler returns `{ status: "disabled" }` and makes zero
   network calls.

### Verify (no live cancel, no live trade)

The Worker exposes `POST /refresh-token` for operator-triggered verify.
The endpoint is gated by the same `APP_SHARED_SECRET` used for opt-in
`/mcp` auth:

```bash
curl -sS -X POST "https://robinhood-chatgpt-app.<subdomain>.workers.dev/refresh-token" \
  -H "Authorization: Bearer $APP_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected shapes:

- `{ "outcome": { "status": "skipped", "reason": "has-runway", … } }` —
  refresh not needed, current token has more runway than the threshold.
- `{ "outcome": { "status": "refreshed", "updatedSecrets": [ … ] } }` —
  refresh succeeded and the new access token (plus rotated refresh
  token, if the OAuth server returned one) has been written.
- `{ "outcome": { "status": "disabled" | "misconfigured" | "failed", … } }`
  — actionable next steps in the payload.

The response body never includes any secret values.

### Observability

Every scheduled tick logs a single JSON line, for example:

```json
{"event":"robinhood_mcp_token_refresh","source":"*/15 * * * *","status":"skipped","reason":"has-runway","expiresInSeconds":3421}
```

Emit levels:

- `status: "refreshed"` — normal path. `updatedSecrets` lists which
  secrets were rewritten.
- `status: "skipped"` — token still has enough runway, no upstream
  calls were made.
- `status: "disabled" | "misconfigured"` — operator needs to complete
  provisioning.
- `status: "failed"` — includes `stage: "token" | "cloudflare"` so
  Cloudflare log alerts can page on either side of the flow.

Set a Cloudflare log alert on
`event=robinhood_mcp_token_refresh AND status=failed` to catch
`invalid_grant` from Robinhood or `403` from the Cloudflare secrets API
before the on-call is paged by a trading MCP 401.

### Rollback

If the automated path misbehaves, either disable the flag or roll back
the deploy:

```powershell
# Fast disable — keeps everything else running.
npx wrangler deploy --var TOKEN_REFRESH_ENABLED:false

# Full rollback to the previous deploy.
npx wrangler deployments list --name robinhood-chatgpt-app
npx wrangler rollback --name robinhood-chatgpt-app --deployment-id <previous-id>
```

Then fall through to §B until the automated path is fixed.

## §B — Manual refresh (fallback)

Use this path when §A is not yet provisioned, has been disabled, or the
scheduled path is failing and trading needs to be unblocked before the
next cron tick.

1. Refresh the MCP OAuth session locally:

   ```powershell
   codex mcp login robinhood-trading
   ```

2. Re-export the local secret bundle so the sync scripts see the new
   token (see `docs/LOCAL_SECRET_SOURCE_OF_TRUTH.md`).

3. Push the new access token to the Worker:

   ```powershell
   .\scripts\sync-chatgpt-app-secrets.ps1 `
     -Cloudflare `
     -WorkerName robinhood-chatgpt-app
   ```

   or, secret-by-secret:

   ```powershell
   npx wrangler secret put ROBINHOOD_MCP_TRADING_ACCESS_TOKEN
   ```

4. Re-run `scripts/smoke-test-mcp.sh --url <URL> --expect-version 0.2.0`.
   The `initialize` and `tools/list` checks are credential-free and
   should pass.

## Acceptance for RH-5 / H5

- Automated refresh path exists in-repo with tests
  (`chatgpt-app/tests/refresh.test.ts`) that run offline via
  `installFetchHarness` — no live Robinhood OAuth or Cloudflare API
  calls in CI.
- The scheduled handler is wired to `wrangler.jsonc → triggers.crons`
  and defaults to disabled (`TOKEN_REFRESH_ENABLED=false`) so shipping
  the code does not turn on the refresh loop until an operator
  completes the provisioning steps in §A.
- Manual fallback in §B is preserved for on-call use.

### Remaining operator steps (not doable from CI)

The following require operator action against Edgar's Cloudflare account
and a live Robinhood MCP OAuth session:

1. Populate the OAuth token endpoint URL and public client id (via the
   trading MCP's OAuth discovery metadata) as Worker vars.
2. Mint a scoped Cloudflare API token with `Workers Scripts:Edit` and
   set it as the `CLOUDFLARE_SECRETS_API_TOKEN` Worker secret.
3. Set `ROBINHOOD_MCP_TRADING_REFRESH_TOKEN` from the current Codex
   credentials file.
4. Flip `TOKEN_REFRESH_ENABLED=true` and verify with
   `POST /refresh-token`.
5. Confirm the cron schedule (`*/15 * * * *` by default) matches
   Robinhood's actual access-token lifetime; adjust
   `TOKEN_REFRESH_THRESHOLD_SECONDS` if the observed lifetime differs
   from the assumed ~1 hour.
