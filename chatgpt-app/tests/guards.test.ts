/**
 * Unit tests for the v0.2.0 safety guards:
 *
 *   - Numeric buy-spread guard (accepts numeric zero, rejects positive
 *     numeric spread, tolerates whitespace, rejects non-numeric).
 *   - Idempotent client_order_id derivation (same inputs -> same UUIDv4
 *     shape; different inputs -> different id).
 *   - Access-token expiry helper (well-formed JWT with past `exp` throws;
 *     tokens without JWT shape are ignored so opaque tokens still work).
 *   - Opt-in /mcp auth helpers.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  assertAccessTokenNotExpired,
  deriveIdempotentClientOrderId,
  enforceZeroBuySpread,
  isMcpAuthRequired,
  isMcpAuthorized
} from "../src/index.ts";

test("numeric spread guard accepts numeric zero variants", () => {
  const cases = ["0", "0.0", "0.00", "0.0000", 0, "0.000000"];
  for (const value of cases) {
    enforceZeroBuySpread({ results: [{ buy_spread: value }] }, true);
  }
});

test("numeric spread guard rejects positive spreads", () => {
  assert.throws(() => enforceZeroBuySpread({ results: [{ buy_spread: "0.0001" }] }, true), /Zero buy-spread guard failed/);
  assert.throws(() => enforceZeroBuySpread({ results: [{ buy_spread: 0.5 }] }, true), /Zero buy-spread guard failed/);
});

test("numeric spread guard rejects negative and non-numeric values", () => {
  assert.throws(() => enforceZeroBuySpread({ results: [{ buy_spread: -0.01 }] }, true), /Zero buy-spread guard failed/);
  assert.throws(() => enforceZeroBuySpread({ results: [{ buy_spread: "banana" }] }, true), /not numeric/);
});

test("numeric spread guard bypasses when disabled", () => {
  enforceZeroBuySpread({ results: [{ buy_spread: "99" }] }, false);
});

test("numeric spread guard fails safe when payload missing", () => {
  assert.throws(() => enforceZeroBuySpread({}, true), /No best bid\/ask row/);
  assert.throws(() => enforceZeroBuySpread({ results: [{}] }, true), /buy_spread is missing/);
});

test("idempotent client_order_id is deterministic for identical inputs", async () => {
  const env = { APP_SHARED_SECRET: "test-secret" } as any;
  const a = await deriveIdempotentClientOrderId(env, { symbol: "USDC-USD", quantity: "1", side: "buy", type: "market", confirmationToken: "ct" });
  const b = await deriveIdempotentClientOrderId(env, { confirmationToken: "ct", side: "buy", symbol: "USDC-USD", type: "market", quantity: "1" });
  assert.equal(a, b, "field order must not change the id");
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("idempotent client_order_id differs for different inputs", async () => {
  const env = { APP_SHARED_SECRET: "test-secret" } as any;
  const a = await deriveIdempotentClientOrderId(env, { symbol: "USDC-USD", quantity: "1", confirmationToken: "a" });
  const b = await deriveIdempotentClientOrderId(env, { symbol: "USDC-USD", quantity: "2", confirmationToken: "a" });
  const c = await deriveIdempotentClientOrderId(env, { symbol: "USDC-USD", quantity: "1", confirmationToken: "b" });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test("access-token expiry helper throws on past exp", () => {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" })).replace(/=+$/, "");
  const claims = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 })).replace(/=+$/, "");
  const token = `${header}.${claims}.sig`;
  assert.throws(() => assertAccessTokenNotExpired(token), /expired/i);
});

test("access-token expiry helper passes on future exp", () => {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" })).replace(/=+$/, "");
  const claims = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).replace(/=+$/, "");
  const token = `${header}.${claims}.sig`;
  assertAccessTokenNotExpired(token);
});

test("access-token expiry helper ignores opaque tokens without JWT shape", () => {
  assertAccessTokenNotExpired("opaque-token-value");
  assertAccessTokenNotExpired("");
});

test("MCP auth flag reads truthy values", () => {
  for (const value of ["true", "1", "yes", "TRUE", " True "]) {
    assert.equal(isMcpAuthRequired({ MCP_REQUIRE_AUTH: value } as any), true, `expected truthy for ${value}`);
  }
  for (const value of [undefined, "", "false", "0", "no"]) {
    assert.equal(isMcpAuthRequired({ MCP_REQUIRE_AUTH: value } as any), false, `expected falsy for ${value ?? "undefined"}`);
  }
});

test("MCP auth check requires matching bearer when required", () => {
  const env = { MCP_REQUIRE_AUTH: "true", APP_SHARED_SECRET: "s3cret" } as any;
  const good = new Request("https://worker.test/mcp", {
    headers: { Authorization: "Bearer s3cret" }
  });
  const bad = new Request("https://worker.test/mcp", {
    headers: { Authorization: "Bearer wrong" }
  });
  const none = new Request("https://worker.test/mcp");
  assert.equal(isMcpAuthorized(good, env), true);
  assert.equal(isMcpAuthorized(bad, env), false);
  assert.equal(isMcpAuthorized(none, env), false);
});

test("MCP auth check is a no-op when not required", () => {
  const env = { APP_SHARED_SECRET: "s3cret" } as any;
  const request = new Request("https://worker.test/mcp");
  assert.equal(isMcpAuthorized(request, env), true);
});
