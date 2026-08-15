# Fix Log

Short catalog of errors hit while shipping v0.2.0 P0 fixes and the smoke
test / schema test harness. Three-line entries: symptom → root cause →
fix.

## account_number redaction leaked into upstream calls

- `cancel_equity_order` (and place/review flows) forwarded `••••XXXX` to
  Robinhood MCP instead of the real account number.
- `robinhoodMcpTool` ran `redactAccountNumbers` on every response, so the
  helper that reads the agentic account number saw only the masked value.
- Introduced `robinhoodMcpToolRaw` for internal reads; the exported
  `robinhoodMcpTool` still redacts for tool-response callers.

## Numeric buy-spread guard rejected valid zero

- Live crypto quotes returned `buy_spread` values like `0.0000000` that
  are numerically zero but not in the hardcoded string list.
- The guard used a whitelist of specific zero-length strings.
- Replaced with `Number.parseFloat` and an explicit `!== 0` check that
  also rejects negative and non-numeric values.

## Expired OAuth token surfaced as opaque upstream 401

- After the Robinhood MCP token expired, tool calls returned an unhelpful
  `Robinhood MCP … failed: 401`.
- The Worker never inspected the JWT's `exp` claim.
- Added `assertAccessTokenNotExpired` that decodes the JWT (if the token
  looks like a JWT) and throws an actionable error before the network
  call; opaque tokens are ignored so unknown formats still work.

## `crypto.randomUUID()` client_order_id defeated dedupe

- Two calls to `place_confirmed_crypto_market_buy` with the same
  confirmation token would send different `client_order_id` values.
- The id was generated fresh from `crypto.randomUUID()` per request.
- Replaced with `deriveIdempotentClientOrderId`: HMAC-SHA256 over a
  canonical order payload, formatted as a UUIDv4.

## Manual `wrangler secret put` was the only path to refresh MCP OAuth tokens

- After the Robinhood MCP access token expired, on-call had to run
  `codex mcp login robinhood-trading` + `wrangler secret put` by hand,
  interrupting trading while the operator rotated secrets.
- The Worker never called the OAuth token endpoint itself, and no cron
  hook existed to trigger a refresh on schedule.
- Added `src/refresh.ts` (`shouldRefreshAccessToken`, `callTokenEndpoint`,
  `putWorkerSecret`, `runScheduledRefresh`) plus a `scheduled` handler
  and `POST /refresh-token`; gated by `TOKEN_REFRESH_ENABLED` so the
  code is credential-free by default. See
  `docs/runbooks/rotate-secrets.md §A`.

## TypeScript build refused `.ts` extension in imports

- `npm run check` failed with `TS5097: An import path can only end
  with a '.ts' extension when 'allowImportingTsExtensions' is enabled`
  after `src/index.ts` imported `./refresh.ts`.
- The tsconfig used `moduleResolution: Bundler` but did not enable the
  matching import-extension flag, while the test runner requires the
  `.ts` extension for Node's type stripping.
- Added `"allowImportingTsExtensions": true` to `chatgpt-app/tsconfig.json`;
  the emit was already suppressed via `noEmit`.

## Node type-stripping failed on unmarked files

- `node --test` for `.ts` tests errored until `--experimental-strip-types`
  was added.
- Node 22 requires the flag for `.ts` files even when they use plain TS
  syntax.
- Added the flag to the `npm test` script and kept the tests free of
  non-strippable TS (`enum`, decorators, namespaces).
