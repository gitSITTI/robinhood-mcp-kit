// Pure, testable helpers for the Robinhood MCP bridge Worker.
//
// WHY THIS FILE EXISTS (for any human or AI agent reading this):
// Everything here is deliberately free of Cloudflare-specific I/O (no fetch,
// no Env bindings) so it can be unit-tested with vitest (see ../test/lib.test.ts)
// and reasoned about in isolation. The safety-critical logic of the bridge —
// order normalization, confirmation tokens, the zero-spread guard, idempotent
// client order IDs, inbound auth, and account-number redaction — all lives here.
// index.ts should stay a thin I/O layer over these functions.

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Small input helpers
// ---------------------------------------------------------------------------

export function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

export function normalizePair(value: unknown): string {
  return requireString(value, "symbol").toUpperCase();
}

export function tryParseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

// ---------------------------------------------------------------------------
// Redaction — account numbers must never leave the Worker unmasked
// ---------------------------------------------------------------------------

export function redactAccountNumbers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAccountNumbers);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key.toLowerCase().includes("account_number") && typeof item === "string") output[key] = `••••${item.slice(-4)}`;
      else output[key] = redactAccountNumbers(item);
    }
    return output;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Equity order normalization (validation happens ONCE, here)
// ---------------------------------------------------------------------------

export function normalizeEquityOrderArgs(args: Record<string, unknown>, accountNumber: string): Record<string, unknown> {
  const symbol = requireString(args.symbol, "symbol").toUpperCase();
  const side = requireString(args.side, "side").toLowerCase();
  if (!["buy", "sell"].includes(side)) throw new Error("side must be buy or sell.");
  const orderType = (typeof args.orderType === "string" ? args.orderType : "market").toLowerCase();
  if (!["market", "limit"].includes(orderType)) throw new Error("orderType must be market or limit.");
  const timeInForce = (typeof args.timeInForce === "string" ? args.timeInForce : "gfd").toLowerCase();
  const order: Record<string, unknown> = { account_number: accountNumber, symbol, side, type: orderType, time_in_force: timeInForce };
  if (args.quantity) order.quantity = requireString(args.quantity, "quantity");
  if (args.dollarAmount) order.dollar_based_amount = requireString(args.dollarAmount, "dollarAmount");
  if (!order.quantity && !order.dollar_based_amount) throw new Error("Provide quantity or dollarAmount.");
  if (orderType === "limit") order.price = requireString(args.limitPrice, "limitPrice");
  return order;
}

export function stableOrderPayload(order: Record<string, unknown>): Record<string, string> {
  const keys = Object.keys(order).sort();
  const payload: Record<string, string> = {};
  for (const key of keys) payload[key] = String(order[key]);
  return payload;
}

// ---------------------------------------------------------------------------
// Zero-buy-spread guard (numeric — "0.000000" and "0e0" are still zero)
// ---------------------------------------------------------------------------

export function enforceZeroBuySpread(bestBidAsk: unknown, enabled: boolean): void {
  if (!enabled) return;
  const row = (bestBidAsk as { results?: Array<Record<string, unknown>> })?.results?.[0];
  if (!row) throw new Error("No best bid/ask row returned for zero-spread guard.");
  const raw = row.buy_spread;
  const buySpread = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));
  if (!Number.isFinite(buySpread)) throw new Error(`Zero buy-spread guard failed; buy_spread is not numeric: ${String(raw)}`);
  if (buySpread !== 0) throw new Error(`Zero buy-spread guard failed; buy_spread=${String(raw)}`);
}

// ---------------------------------------------------------------------------
// Confirmation tokens (HMAC over order params + issued-at, with expiry)
//
// Format: "<issuedAtSeconds>.<base64 HMAC prefix>"
// The prepare_* tools mint one; the place_confirmed_* tools verify it. Tokens
// expire (default 10 minutes) so a stale confirmation can't place an order at
// materially different market conditions.
// ---------------------------------------------------------------------------

export const CONFIRMATION_TOKEN_TTL_SECONDS = 600;
const CLOCK_SKEW_TOLERANCE_SECONDS = 60;

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return bytesToBase64(signature);
}

async function confirmationSignature(secret: string, payload: Record<string, string>, issuedAtSeconds: number): Promise<string> {
  const message = JSON.stringify({ p: payload, ts: issuedAtSeconds });
  return (await hmacSha256Base64(secret, message)).slice(0, 32);
}

export async function makeConfirmationToken(secret: string, payload: Record<string, string>, nowMs: number): Promise<string> {
  const issuedAt = Math.floor(nowMs / 1000);
  return `${issuedAt}.${await confirmationSignature(secret, payload, issuedAt)}`;
}

export async function verifyConfirmationToken(
  secret: string,
  payload: Record<string, string>,
  token: string,
  nowMs: number,
  ttlSeconds: number = CONFIRMATION_TOKEN_TTL_SECONDS
): Promise<void> {
  const separator = token.indexOf(".");
  if (separator <= 0) throw new Error("Confirmation token is malformed. Run the prepare step again.");
  const issuedAt = Number.parseInt(token.slice(0, separator), 10);
  if (!Number.isFinite(issuedAt)) throw new Error("Confirmation token is malformed. Run the prepare step again.");
  const ageSeconds = Math.floor(nowMs / 1000) - issuedAt;
  if (ageSeconds > ttlSeconds) throw new Error(`Confirmation token expired (older than ${ttlSeconds}s). Run the prepare step again and re-confirm.`);
  if (ageSeconds < -CLOCK_SKEW_TOLERANCE_SECONDS) throw new Error("Confirmation token is from the future; rejecting.");
  const expected = `${issuedAt}.${await confirmationSignature(secret, payload, issuedAt)}`;
  if (!timingSafeEqual(token, expected)) throw new Error("Confirmation token does not match the current order parameters.");
}

// ---------------------------------------------------------------------------
// Idempotent client order IDs
//
// The crypto order's client_order_id is derived deterministically from the
// confirmation token, NOT freshly random at placement time. If a placement
// request times out and is retried with the same confirmation, the exchange
// sees the same client_order_id and will not double-fill. UUIDv4-shaped so it
// passes format validation.
// ---------------------------------------------------------------------------

export async function deriveClientOrderId(confirmationToken: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`client-order-id:${confirmationToken}`)));
  const hex = Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------
// Inbound MCP auth (opt-in via MCP_REQUIRE_AUTH="true")
//
// Two ways to authorize, because not every MCP client can send headers:
//   1. Header:  Authorization: Bearer <APP_SHARED_SECRET>
//   2. Path:    POST /mcp/<APP_SHARED_SECRET>   (for URL-only connectors)
// Fail-closed: if auth is required but no secret is configured, deny.
// Default is open for backwards compatibility with already-configured
// connectors — see docs/runbooks/security-hardening.md before enabling.
// ---------------------------------------------------------------------------

export function isAuthorizedMcpRequest(options: {
  requireAuth: boolean;
  sharedSecret: string | undefined;
  authHeader: string | null;
  pathname: string;
}): boolean {
  if (!options.requireAuth) return true;
  const secret = options.sharedSecret ?? "";
  if (!secret) return false;
  if (options.authHeader && timingSafeEqual(options.authHeader, `Bearer ${secret}`)) return true;
  const segments = options.pathname.split("/").filter(Boolean);
  if (segments.length === 2 && segments[0] === "mcp" && timingSafeEqual(segments[1], secret)) return true;
  return false;
}

export function timingSafeEqual(a: string, b: string): boolean {
  const bytesA = new TextEncoder().encode(a);
  const bytesB = new TextEncoder().encode(b);
  let mismatch = bytesA.length === bytesB.length ? 0 : 1;
  const length = Math.max(bytesA.length, bytesB.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (bytesA[index % bytesA.length] ?? 0) ^ (bytesB[index % bytesB.length] ?? 0);
  }
  return mismatch === 0;
}

// ---------------------------------------------------------------------------
// MCP response parsing (upstream may answer JSON or SSE "data:" lines)
// ---------------------------------------------------------------------------

export function parseMcpResponse(text: string): {
  result?: { content?: Array<{ text?: string }>; structuredContent?: unknown };
  error?: { message?: string };
} {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const line = trimmed.split(/\r?\n/).find((item) => item.startsWith("data: "));
  if (!line) throw new Error(`No MCP data line in response: ${trimmed.slice(0, 120)}`);
  return JSON.parse(line.slice(6));
}

// ---------------------------------------------------------------------------
// Base64 helpers
// ---------------------------------------------------------------------------

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
