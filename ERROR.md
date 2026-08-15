# Error Catalog

Track of concrete errors that have shown up in the Robinhood MCP kit and
the branch/commit where each was fixed. Newest at the top.

| Date | Where | Error | Status | Fix |
|------|-------|-------|--------|-----|
| 2026-08-15 | `chatgpt-app` v0.2.0 | Manual `wrangler secret put` was the only path to refresh the MCP OAuth access token | Fixed on `cursor/rh5-token-refresh-automation-16bd` | Automated refresh path (`src/refresh.ts` + cron `scheduled` + `POST /refresh-token`), gated by `TOKEN_REFRESH_ENABLED`. See `docs/runbooks/rotate-secrets.md §A`. |
| 2026-08-15 | `chatgpt-app` tsconfig | `TS5097` on `import "./refresh.ts"` after adding the refresh module | Fixed on `cursor/rh5-token-refresh-automation-16bd` | Enabled `allowImportingTsExtensions` in `chatgpt-app/tsconfig.json`. |
| 2026-08-15 | `chatgpt-app` v0.1.0 | `cancel_equity_order` forwarded redacted `••••XXXX` account_number upstream | Fixed on `cursor/rh-p0-worker-v0.2.0-smoke-and-schema-b120` | Split `robinhoodMcpToolRaw` from redacting `robinhoodMcpTool`; see `FIX_DOC.md`. |
| 2026-08-15 | `chatgpt-app` v0.1.0 | Buy-spread guard rejected legitimate numeric zero (e.g. `"0.0000000"`) | Fixed on `cursor/rh-p0-worker-v0.2.0-smoke-and-schema-b120` | Numeric `parseFloat` guard; see `FIX_DOC.md`. |
| 2026-08-15 | `chatgpt-app` v0.1.0 | Expired MCP OAuth token surfaced as opaque upstream 401 | Fixed on `cursor/rh-p0-worker-v0.2.0-smoke-and-schema-b120` | JWT `exp` check in `assertAccessTokenNotExpired`. |
| 2026-08-15 | `chatgpt-app` v0.1.0 | Repeat confirmed crypto buys created duplicate `client_order_id`s | Fixed on `cursor/rh-p0-worker-v0.2.0-smoke-and-schema-b120` | Deterministic HMAC-derived UUIDv4 in `deriveIdempotentClientOrderId`. |
| 2026-08-15 | `chatgpt-app/tests` | `node --test` failed on `.ts` files by default | Fixed on `cursor/rh-p0-worker-v0.2.0-smoke-and-schema-b120` | Added `--experimental-strip-types` to `npm test`. |
