# Runbook: Enable Inbound Auth on /mcp

**Current state:** the Worker ships with inbound auth **off**
(`MCP_REQUIRE_AUTH` unset) so existing connectors keep working. That means
anyone who learns the Worker URL can call the read tools and drive the
prepare→place flow (placement still requires the HMAC confirmation token, and
tokens now expire in 10 minutes — but read data would still leak).

**Goal state:** `MCP_REQUIRE_AUTH=true`, every client authorized one of two
ways (both implemented in `src/lib.ts::isAuthorizedMcpRequest`):

| Client capability            | Method                                            |
|------------------------------|---------------------------------------------------|
| Can send headers (Claude Code, Cursor, Codex) | `Authorization: Bearer <APP_SHARED_SECRET>` |
| URL-only (ChatGPT connector) | point the connector at `/mcp/<APP_SHARED_SECRET>` |

## Steps (do them in this order — flipping the flag first breaks clients)

1. Confirm `APP_SHARED_SECRET` is set on the Worker (`npx wrangler secret list`)
   and is a strong random value (rotate first if it's weak —
   `rotate-secrets.md` §C).
2. Update each connector:
   - **ChatGPT app:** change the connector URL to
     `https://<worker-host>/mcp/<APP_SHARED_SECRET>`.
   - **Claude Code / Cursor / Codex:** add the `Authorization: Bearer …` header
     in the client's MCP config (`configs/` has the per-client files to edit).
3. Flip the flag — it's a plain var, so set it in `wrangler.jsonc` `vars`
   (`"MCP_REQUIRE_AUTH": "true"`) and deploy (`deploy-worker.md`).
4. Verify:
   - `curl -s -o /dev/null -w '%{http_code}' -X POST https://<worker-host>/mcp -d '{}'` → **401**
   - `scripts/smoke-test-mcp.sh https://<worker-host> <APP_SHARED_SECRET>` → passes
   - Each real client still lists tools.

## Caveats

- The path-secret form puts the secret in the URL: it can appear in client
  logs and browser history. It's a big improvement over "no auth", not a
  substitute for real OAuth on the Worker (tracked in BACKLOG.md).
- After enabling, rotating `APP_SHARED_SECRET` requires updating connectors in
  the same change window.
