// Unit tests for the Worker's safety-critical pure logic (src/lib.ts).
// Run with:  npm test   (vitest; blocking in CI alongside `npm run check`).
//
// These tests need no network, no secrets, and no Cloudflare runtime — the
// helpers are pure by design. If you add logic to lib.ts, add a test here.

import { describe, expect, it } from "vitest";
import {
  deriveClientOrderId,
  enforceZeroBuySpread,
  isAuthorizedMcpRequest,
  makeConfirmationToken,
  normalizeEquityOrderArgs,
  parseMcpResponse,
  redactAccountNumbers,
  stableOrderPayload,
  timingSafeEqual,
  verifyConfirmationToken
} from "../src/lib";

const SECRET = "test-secret";
const NOW = 1_750_000_000_000; // fixed clock for deterministic tests

describe("enforceZeroBuySpread", () => {
  const bidAsk = (buySpread: unknown) => ({ results: [{ buy_spread: buySpread }] });

  it("accepts zero in any numeric representation", () => {
    for (const zero of ["0", "0.0", "0.000000", "0e0", 0]) {
      expect(() => enforceZeroBuySpread(bidAsk(zero), true)).not.toThrow();
    }
  });

  it("rejects a non-zero spread", () => {
    expect(() => enforceZeroBuySpread(bidAsk("0.0042"), true)).toThrow(/guard failed/);
  });

  it("rejects a non-numeric spread instead of silently passing", () => {
    expect(() => enforceZeroBuySpread(bidAsk("n/a"), true)).toThrow(/not numeric/);
    expect(() => enforceZeroBuySpread(bidAsk(undefined), true)).toThrow(/not numeric/);
  });

  it("rejects a missing bid/ask row", () => {
    expect(() => enforceZeroBuySpread({ results: [] }, true)).toThrow(/No best bid\/ask/);
  });

  it("is a no-op when the guard is disabled", () => {
    expect(() => enforceZeroBuySpread(bidAsk("9.99"), false)).not.toThrow();
  });
});

describe("normalizeEquityOrderArgs", () => {
  it("builds a normalized order and uppercases/lowercases fields", () => {
    const order = normalizeEquityOrderArgs({ symbol: "aapl", side: "BUY", quantity: "2" }, "12345678");
    expect(order).toMatchObject({ account_number: "12345678", symbol: "AAPL", side: "buy", type: "market", time_in_force: "gfd", quantity: "2" });
  });

  it("requires quantity or dollarAmount", () => {
    expect(() => normalizeEquityOrderArgs({ symbol: "AAPL", side: "buy" }, "1")).toThrow(/quantity or dollarAmount/);
  });

  it("requires limitPrice for limit orders", () => {
    expect(() => normalizeEquityOrderArgs({ symbol: "AAPL", side: "buy", orderType: "limit", quantity: "1" }, "1")).toThrow(/limitPrice/);
  });

  it("rejects unknown sides and order types", () => {
    expect(() => normalizeEquityOrderArgs({ symbol: "AAPL", side: "short", quantity: "1" }, "1")).toThrow(/side must be/);
    expect(() => normalizeEquityOrderArgs({ symbol: "AAPL", side: "buy", orderType: "stop", quantity: "1" }, "1")).toThrow(/orderType must be/);
  });
});

describe("confirmation tokens", () => {
  const payload = () => stableOrderPayload({ symbol: "USDC-USD", quantity: "5", side: "buy" });

  it("round-trips: a freshly minted token verifies", async () => {
    const token = await makeConfirmationToken(SECRET, payload(), NOW);
    await expect(verifyConfirmationToken(SECRET, payload(), token, NOW + 5_000)).resolves.toBeUndefined();
  });

  it("rejects a token after the TTL (default 10 minutes)", async () => {
    const token = await makeConfirmationToken(SECRET, payload(), NOW);
    await expect(verifyConfirmationToken(SECRET, payload(), token, NOW + 601_000)).rejects.toThrow(/expired/);
  });

  it("rejects a token when the order parameters changed", async () => {
    const token = await makeConfirmationToken(SECRET, payload(), NOW);
    const tampered = stableOrderPayload({ symbol: "USDC-USD", quantity: "500", side: "buy" });
    await expect(verifyConfirmationToken(SECRET, tampered, token, NOW + 5_000)).rejects.toThrow(/does not match/);
  });

  it("rejects malformed and forged tokens", async () => {
    await expect(verifyConfirmationToken(SECRET, payload(), "garbage", NOW)).rejects.toThrow(/malformed/);
    const forged = `${Math.floor(NOW / 1000)}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    await expect(verifyConfirmationToken(SECRET, payload(), forged, NOW)).rejects.toThrow(/does not match/);
  });
});

describe("deriveClientOrderId", () => {
  it("is deterministic for the same confirmation token (retry-idempotent)", async () => {
    const a = await deriveClientOrderId("123.token");
    const b = await deriveClientOrderId("123.token");
    expect(a).toBe(b);
  });

  it("differs across tokens and is UUID-shaped", async () => {
    const a = await deriveClientOrderId("123.tokenA");
    const b = await deriveClientOrderId("123.tokenB");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("isAuthorizedMcpRequest", () => {
  const base = { requireAuth: true, sharedSecret: "s3cret", authHeader: null as string | null, pathname: "/mcp" };

  it("allows everything when auth is not required (backwards compatibility)", () => {
    expect(isAuthorizedMcpRequest({ ...base, requireAuth: false })).toBe(true);
  });

  it("accepts the bearer header", () => {
    expect(isAuthorizedMcpRequest({ ...base, authHeader: "Bearer s3cret" })).toBe(true);
    expect(isAuthorizedMcpRequest({ ...base, authHeader: "Bearer wrong" })).toBe(false);
  });

  it("accepts the path secret for URL-only connectors", () => {
    expect(isAuthorizedMcpRequest({ ...base, pathname: "/mcp/s3cret" })).toBe(true);
    expect(isAuthorizedMcpRequest({ ...base, pathname: "/mcp/wrong" })).toBe(false);
    expect(isAuthorizedMcpRequest({ ...base, pathname: "/mcp" })).toBe(false);
  });

  it("fails closed when auth is required but no secret is configured", () => {
    expect(isAuthorizedMcpRequest({ ...base, sharedSecret: undefined, authHeader: "Bearer anything" })).toBe(false);
    expect(isAuthorizedMcpRequest({ ...base, sharedSecret: "", pathname: "/mcp/" })).toBe(false);
  });
});

describe("timingSafeEqual", () => {
  it("compares correctly", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("redactAccountNumbers", () => {
  it("masks account_number fields at any depth, preserving the last 4", () => {
    const input = { account_number: "12345678", nested: [{ from_account_number: "87654321", other: "keep" }] };
    const output = redactAccountNumbers(input) as Record<string, unknown>;
    expect(output.account_number).toBe("••••5678");
    expect((output.nested as Array<Record<string, unknown>>)[0].from_account_number).toBe("••••4321");
    expect((output.nested as Array<Record<string, unknown>>)[0].other).toBe("keep");
  });
});

describe("parseMcpResponse", () => {
  it("parses plain JSON bodies", () => {
    expect(parseMcpResponse('{"result":{"structuredContent":{"ok":true}}}').result?.structuredContent).toEqual({ ok: true });
  });

  it("parses SSE data lines", () => {
    const sse = 'event: message\ndata: {"result":{"content":[{"text":"hi"}]}}\n\n';
    expect(parseMcpResponse(sse).result?.content?.[0]?.text).toBe("hi");
  });

  it("throws a helpful error when no data line exists", () => {
    expect(() => parseMcpResponse("event: ping\n\n")).toThrow(/No MCP data line/);
  });
});
