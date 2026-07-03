// Robinhood MCP bridge Worker (Cloudflare).
//
// This file is the I/O layer only: routing, upstream fetches (Robinhood MCP +
// Robinhood Crypto API), and tool dispatch. All safety-critical pure logic
// (order normalization, confirmation tokens with expiry, zero-spread guard,
// idempotent client order IDs, inbound auth, redaction) lives in ./lib.ts and
// is unit-tested in ../test/lib.test.ts.
//
// Trade-safety invariant (do not weaken): every order flow is
//   prepare_* (never places, returns confirmation token)
//     -> explicit user confirmation
//       -> place_confirmed_* (verifies token + re-checks guards, then places)

import { ed25519 } from "@noble/curves/ed25519";
import type { JsonRpcRequest } from "./lib";
import {
  asRecord,
  base64ToBytes,
  bytesToBase64,
  deriveClientOrderId,
  enforceZeroBuySpread,
  isAuthorizedMcpRequest,
  makeConfirmationToken,
  normalizeEquityOrderArgs,
  normalizePair,
  parseMcpResponse,
  redactAccountNumbers,
  requireString,
  stableOrderPayload,
  tryParseJson,
  verifyConfirmationToken
} from "./lib";

type Env = {
  ROBINHOOD_MCP_TRADING_URL: string;
  ROBINHOOD_MCP_TRADING_ACCESS_TOKEN?: string;
  ROBINHOOD_CRYPTO_API_BASE: string;
  ROBINHOOD_CRYPTO_READ_API_KEY?: string;
  ROBINHOOD_CRYPTO_READ_PRIVATE_KEY_BASE64?: string;
  ROBINHOOD_CRYPTO_TRADE_API_KEY?: string;
  ROBINHOOD_CRYPTO_TRADE_PRIVATE_KEY_BASE64?: string;
  APP_SHARED_SECRET?: string;
  // Set to "true" to require inbound auth on /mcp (Bearer APP_SHARED_SECRET
  // header, or path secret /mcp/<APP_SHARED_SECRET> for URL-only connectors).
  // See docs/runbooks/security-hardening.md before flipping this on.
  MCP_REQUIRE_AUTH?: string;
};

const serverInfo = {
  name: "robinhood-chatgpt-app",
  version: "0.2.0"
};

const tools = [
  {
    name: "get_agentic_account",
    title: "Get Agentic Account",
    description: "Use this when you need the Robinhood Agentic brokerage account status, buying power, and equity capability summary.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    _meta: {
      "openai/toolInvocation/invoking": "Checking Agentic account",
      "openai/toolInvocation/invoked": "Agentic account checked"
    }
  },
  {
    name: "get_equity_quote",
    title: "Get Equity Quote",
    description: "Use this when you need a read-only equity quote and tradability check before considering a stock or ETF order.",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string", description: "Uppercase stock or ETF ticker, e.g. AAPL or QQQ" } },
      required: ["symbol"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true }
  },
  {
    name: "prepare_agentic_equity_order",
    title: "Prepare Agentic Equity Order",
    description: "Use this to review a stock or ETF order for the Agentic brokerage account. This never places an order.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Uppercase stock or ETF ticker" },
        side: { type: "string", enum: ["buy", "sell"] },
        orderType: { type: "string", enum: ["market", "limit"], default: "market" },
        quantity: { type: "string", description: "Share quantity, if share-based" },
        dollarAmount: { type: "string", description: "Dollar amount, if dollar-based" },
        limitPrice: { type: "string", description: "Required for limit orders" },
        timeInForce: { type: "string", enum: ["gfd", "gtc"], default: "gfd" }
      },
      required: ["symbol", "side"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "place_confirmed_agentic_equity_order",
    title: "Place Confirmed Agentic Equity Order",
    description: "Use this only after the user explicitly confirms an Agentic equity order and provides the confirmation token. Tokens expire after 10 minutes.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        side: { type: "string", enum: ["buy", "sell"] },
        orderType: { type: "string", enum: ["market", "limit"], default: "market" },
        quantity: { type: "string" },
        dollarAmount: { type: "string" },
        limitPrice: { type: "string" },
        timeInForce: { type: "string", enum: ["gfd", "gtc"], default: "gfd" },
        confirmationToken: { type: "string" }
      },
      required: ["symbol", "side", "confirmationToken"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    _meta: {
      "openai/toolInvocation/invoking": "Placing confirmed Agentic equity order",
      "openai/toolInvocation/invoked": "Agentic equity order submitted"
    }
  },
  {
    name: "cancel_equity_order",
    title: "Cancel Equity Order",
    description: "Use this to cancel an open Agentic equity order by its order id. Cancelling is corrective and requires no confirmation token.",
    inputSchema: {
      type: "object",
      properties: { orderId: { type: "string", description: "The equity order id to cancel, from get_equity_orders / run_no_trade_audit output" } },
      required: ["orderId"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    _meta: {
      "openai/toolInvocation/invoking": "Cancelling equity order",
      "openai/toolInvocation/invoked": "Equity order cancel requested"
    }
  },
  {
    name: "run_no_trade_audit",
    title: "Run No-Trade Audit",
    description: "Use this for a read-only audit of Agentic account status, equity orders, positions, crypto holdings, and crypto quote/fee status. This never places orders.",
    inputSchema: {
      type: "object",
      properties: {
        cryptoSymbol: { type: "string", default: "USDC-USD" },
        cryptoQuantity: { type: "string", default: "1" }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "get_crypto_quote",
    title: "Get Crypto Quote",
    description: "Use this when you need a read-only Robinhood Crypto best bid/ask and estimated buy price for a USD trading pair.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Crypto pair such as USDC-USD or BTC-USD" },
        quantity: { type: "string", description: "Asset quantity to estimate, e.g. 5" }
      },
      required: ["symbol", "quantity"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true }
  },
  {
    name: "get_crypto_holdings",
    title: "Get Crypto Holdings",
    description: "Use this when you need the read-only list of Robinhood Crypto holdings (asset codes and quantities).",
    inputSchema: {
      type: "object",
      properties: { assetCode: { type: "string", description: "Optional single asset code filter, e.g. BTC or USDC" } },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true }
  },
  {
    name: "prepare_crypto_market_buy",
    title: "Prepare Crypto Market Buy",
    description: "Use this when the user asks to prepare a crypto market buy. This does not place the order; it returns a confirmation token and fee/spread guard result.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Crypto pair such as USDC-USD" },
        quantity: { type: "string", description: "Asset quantity to buy" },
        requireZeroBuySpread: { type: "boolean", default: true }
      },
      required: ["symbol", "quantity"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "place_confirmed_crypto_market_buy",
    title: "Place Confirmed Crypto Market Buy",
    description: "Use this only after the user explicitly confirms the prepared crypto market buy and provides the confirmation token. Tokens expire after 10 minutes.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        quantity: { type: "string" },
        confirmationToken: { type: "string" },
        requireZeroBuySpread: { type: "boolean", default: true }
      },
      required: ["symbol", "quantity", "confirmationToken"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    _meta: {
      "openai/toolInvocation/invoking": "Placing confirmed crypto order",
      "openai/toolInvocation/invoked": "Crypto order submitted"
    }
  },
  {
    name: "render_dashboard",
    title: "Render Robinhood Dashboard",
    description: "Use this when the user wants an interactive ChatGPT app dashboard for Robinhood status and guarded trade preparation.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { "openai/outputTemplate": "ui://robinhood/dashboard.html" }
  }
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") return json({ ok: true, serverInfo, endpoints: ["/mcp", "/widget"] });
    if (url.pathname === "/widget") return widgetResponse();
    // /mcp and /mcp/<path-secret> both route to the MCP handler; the path
    // secret form exists for connectors that cannot send custom headers.
    if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
      const authorized = isAuthorizedMcpRequest({
        requireAuth: env.MCP_REQUIRE_AUTH === "true",
        sharedSecret: env.APP_SHARED_SECRET,
        authHeader: request.headers.get("Authorization"),
        pathname: url.pathname
      });
      if (!authorized) return json({ error: "Unauthorized" }, 401);
      return handleMcp(request, env);
    }
    return new Response("Not found", { status: 404 });
  }
};

async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") return json({ ok: true, serverInfo, tools: tools.map((tool) => tool.name) });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const body = await request.json<JsonRpcRequest | JsonRpcRequest[]>();
  const requests = Array.isArray(body) ? body : [body];
  const responses = await Promise.all(requests.map((rpc) => dispatchRpc(rpc, env)));
  return json(Array.isArray(body) ? responses : responses[0]);
}

async function dispatchRpc(rpc: JsonRpcRequest, env: Env) {
  try {
    if (rpc.method === "initialize") {
      return rpcResult(rpc.id, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {}, resources: {} },
        serverInfo
      });
    }
    if (rpc.method === "tools/list") return rpcResult(rpc.id, { tools });
    if (rpc.method === "resources/list") {
      return rpcResult(rpc.id, {
        resources: [{ uri: "ui://robinhood/dashboard.html", name: "Robinhood dashboard", mimeType: "text/html;profile=mcp-app" }]
      });
    }
    if (rpc.method === "resources/read") {
      return rpcResult(rpc.id, {
        contents: [{ uri: "ui://robinhood/dashboard.html", mimeType: "text/html;profile=mcp-app", text: widgetHtml() }]
      });
    }
    if (rpc.method === "tools/call") {
      const params = rpc.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
      return rpcResult(rpc.id, await callTool(params?.name ?? "", params?.arguments ?? {}, env));
    }
    if (rpc.method === "notifications/initialized") return rpcResult(rpc.id, {});
    return rpcError(rpc.id, -32601, `Unsupported method: ${rpc.method}`);
  } catch (error) {
    return rpcError(rpc.id, -32000, error instanceof Error ? error.message : String(error));
  }
}

async function callTool(name: string, args: Record<string, unknown>, env: Env) {
  if (name === "render_dashboard") {
    return {
      content: [{ type: "text", text: "Rendered the Robinhood dashboard." }],
      structuredContent: { status: "ready" },
      _meta: { "openai/outputTemplate": "ui://robinhood/dashboard.html" }
    };
  }
  if (name === "get_agentic_account") return getAgenticAccount(env);
  if (name === "get_equity_quote") return getEquityQuote(env, requireString(args.symbol, "symbol").toUpperCase());
  if (name === "prepare_agentic_equity_order") return prepareAgenticEquityOrder(env, args);
  if (name === "place_confirmed_agentic_equity_order") return placeConfirmedAgenticEquityOrder(env, args);
  if (name === "cancel_equity_order") return cancelEquityOrder(env, requireString(args.orderId, "orderId"));
  if (name === "run_no_trade_audit") return runNoTradeAudit(env, args);
  if (name === "get_crypto_quote") return getCryptoQuote(env, normalizePair(args.symbol), requireString(args.quantity, "quantity"));
  if (name === "get_crypto_holdings") return getCryptoHoldings(env, typeof args.assetCode === "string" ? args.assetCode.toUpperCase() : undefined);
  if (name === "prepare_crypto_market_buy") {
    return prepareCryptoMarketBuy(env, normalizePair(args.symbol), requireString(args.quantity, "quantity"), args.requireZeroBuySpread !== false);
  }
  if (name === "place_confirmed_crypto_market_buy") {
    return placeConfirmedCryptoMarketBuy(
      env,
      normalizePair(args.symbol),
      requireString(args.quantity, "quantity"),
      requireString(args.confirmationToken, "confirmationToken"),
      args.requireZeroBuySpread !== false
    );
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function getAgenticAccount(env: Env) {
  const { account: agentic, accountNumber } = await getAgenticAccountRecord(env);
  const portfolio = asRecord(await robinhoodMcpTool(env, "get_portfolio", { account_number: accountNumber }));
  const portfolioText = typeof portfolio.text === "string" ? tryParseJson(portfolio.text) : undefined;
  const portfolioData = asRecord(portfolio.data ?? asRecord(portfolioText).data ?? portfolioText);
  const summary = {
    accountLast4: accountNumber.slice(-4),
    nickname: agentic.nickname ?? "Agentic",
    type: agentic.type,
    brokerageAccountType: agentic.brokerage_account_type,
    optionLevel: agentic.option_level,
    state: agentic.state,
    agenticAllowed: agentic.agentic_allowed,
    portfolio: portfolioData
  };
  return toolJson("Agentic account summary loaded. Account numbers are masked.", summary);
}

async function getAgenticAccountRecord(env: Env) {
  const accounts = asRecord(await robinhoodMcpTool(env, "get_accounts", {}));
  const accountData = asRecord(accounts.data);
  const list = Array.isArray(accountData.accounts) ? accountData.accounts as Array<Record<string, unknown>> : [];
  const agentic = list.find((account: Record<string, unknown>) => account.agentic_allowed === true);
  if (!agentic) throw new Error("No agentic_allowed brokerage account was returned by Robinhood MCP.");
  const accountNumber = String(agentic.account_number);
  return { account: agentic, accountNumber };
}

async function getEquityQuote(env: Env, symbol: string) {
  const [quote, tradability] = await Promise.all([
    robinhoodMcpTool(env, "get_equity_quotes", { symbols: [symbol] }),
    robinhoodMcpTool(env, "get_equity_tradability", { symbol })
  ]).then(([quoteResult, tradabilityResult]) => [asRecord(quoteResult), asRecord(tradabilityResult)]);
  return toolJson(`Loaded equity quote and tradability for ${symbol}.`, { symbol, quote: asRecord(quote.data), tradability: asRecord(tradability.data) });
}

async function prepareAgenticEquityOrder(env: Env, args: Record<string, unknown>) {
  const { accountNumber } = await getAgenticAccountRecord(env);
  const order = normalizeEquityOrderArgs(args, accountNumber);
  const [quote, tradability, review] = await Promise.all([
    robinhoodMcpTool(env, "get_equity_quotes", { symbols: [order.symbol] }),
    robinhoodMcpTool(env, "get_equity_tradability", { symbol: order.symbol }),
    robinhoodMcpTool(env, "review_equity_order", order)
  ]).then(([quoteResult, tradabilityResult, reviewResult]) => [asRecord(quoteResult), asRecord(tradabilityResult), asRecord(reviewResult)]);
  const confirmationToken = await makeConfirmationToken(appSecret(env), stableOrderPayload(order), Date.now());
  return toolJson("Prepared Agentic equity order. No order was placed.", {
    accountLast4: accountNumber.slice(-4),
    order: redactAccountNumbers(order),
    quote: asRecord(quote.data),
    tradability: asRecord(tradability.data),
    review,
    confirmationToken,
    instruction: "Only call place_confirmed_agentic_equity_order after the user explicitly confirms this exact order. The token expires in 10 minutes."
  });
}

async function placeConfirmedAgenticEquityOrder(env: Env, args: Record<string, unknown>) {
  const { accountNumber } = await getAgenticAccountRecord(env);
  const order = normalizeEquityOrderArgs(args, accountNumber);
  const confirmationToken = requireString(args.confirmationToken, "confirmationToken");
  await verifyConfirmationToken(appSecret(env), stableOrderPayload(order), confirmationToken, Date.now());
  await robinhoodMcpTool(env, "review_equity_order", order);
  const placed = await robinhoodMcpTool(env, "place_equity_order", order);
  return toolJson("Submitted confirmed Agentic equity order.", {
    accountLast4: accountNumber.slice(-4),
    order: redactAccountNumbers(order),
    result: placed
  });
}

async function cancelEquityOrder(env: Env, orderId: string) {
  const { accountNumber } = await getAgenticAccountRecord(env);
  // NOTE for maintainers: the argument names for the upstream cancel tool are
  // taken from the documented tool list (README "Trading" tools) and mirror
  // the place/review argument style. If the live MCP rejects them, check the
  // upstream schema via tools/list with a live token — tracked in BACKLOG.md.
  const result = await robinhoodMcpTool(env, "cancel_equity_order", { account_number: accountNumber, order_id: orderId });
  return toolJson(`Requested cancel for equity order ${orderId}.`, {
    accountLast4: accountNumber.slice(-4),
    orderId,
    result
  });
}

async function runNoTradeAudit(env: Env, args: Record<string, unknown>) {
  const { accountNumber } = await getAgenticAccountRecord(env);
  const cryptoSymbol = normalizePair(args.cryptoSymbol ?? "USDC-USD");
  const cryptoQuantity = requireString(args.cryptoQuantity ?? "1", "cryptoQuantity");
  const [agentic, positions, orders, cryptoQuote, cryptoHoldings] = await Promise.all([
    getAgenticAccount(env),
    robinhoodMcpTool(env, "get_equity_positions", { account_number: accountNumber }),
    robinhoodMcpTool(env, "get_equity_orders", { account_number: accountNumber }),
    getCryptoQuoteData(env, cryptoSymbol, cryptoQuantity),
    cryptoGet(env, "read", "/api/v1/crypto/trading/holdings/").catch((error: unknown) => ({
      unavailable: error instanceof Error ? error.message : String(error)
    }))
  ]);
  return toolJson("Completed no-trade audit. No orders were placed.", {
    agentic: asRecord(agentic.structuredContent),
    equityPositions: asRecord(positions).data ?? positions,
    equityOrders: asRecord(orders).data ?? orders,
    crypto: { symbol: cryptoSymbol, quantity: cryptoQuantity, quote: cryptoQuote, holdings: cryptoHoldings }
  });
}

async function getCryptoQuote(env: Env, symbol: string, quantity: string) {
  const quote = await getCryptoQuoteData(env, symbol, quantity);
  return toolJson(`Loaded crypto quote for ${symbol}.`, { symbol, quantity, pair: quote.pair, bestBidAsk: quote.bestBidAsk, estimatedAsk: quote.estimatedAsk });
}

async function getCryptoHoldings(env: Env, assetCode?: string) {
  const query = assetCode ? `?asset_code=${encodeURIComponent(assetCode)}` : "";
  const holdings = await cryptoGet(env, "read", `/api/v1/crypto/trading/holdings/${query}`);
  return toolJson(assetCode ? `Loaded crypto holdings for ${assetCode}.` : "Loaded crypto holdings.", { assetCode: assetCode ?? null, holdings });
}

async function prepareCryptoMarketBuy(env: Env, symbol: string, quantity: string, requireZeroBuySpread: boolean) {
  const quote = await getCryptoQuoteData(env, symbol, quantity);
  enforceZeroBuySpread(quote.bestBidAsk, requireZeroBuySpread);
  const confirmationToken = await makeConfirmationToken(appSecret(env), cryptoOrderPayload(symbol, quantity), Date.now());
  return toolJson("Prepared crypto market buy. No order was placed.", {
    action: "buy",
    symbol,
    quantity,
    requireZeroBuySpread,
    quote,
    confirmationToken,
    instruction: "Only call place_confirmed_crypto_market_buy after the user explicitly confirms this exact order. The token expires in 10 minutes."
  });
}

async function placeConfirmedCryptoMarketBuy(env: Env, symbol: string, quantity: string, confirmationToken: string, requireZeroBuySpread: boolean) {
  await verifyConfirmationToken(appSecret(env), cryptoOrderPayload(symbol, quantity), confirmationToken, Date.now());
  const quote = await getCryptoQuoteData(env, symbol, quantity);
  enforceZeroBuySpread(quote.bestBidAsk, requireZeroBuySpread);
  const order = await cryptoPost(env, "trade", "/api/v1/crypto/trading/orders/", {
    // Deterministic per confirmation token: a timed-out placement retried with
    // the same confirmation reuses the same id, so the exchange deduplicates
    // instead of double-buying.
    client_order_id: await deriveClientOrderId(confirmationToken),
    side: "buy",
    type: "market",
    symbol,
    market_order_config: { asset_quantity: quantity }
  });
  return toolJson("Submitted confirmed crypto market buy through the v1 non-fee endpoint.", { symbol, quantity, order: redactAccountNumbers(order) });
}

function cryptoOrderPayload(symbol: string, quantity: string): Record<string, string> {
  return { symbol, quantity, side: "buy", type: "market", guard: "v1-zero-buy-spread" };
}

function appSecret(env: Env): string {
  return env.APP_SHARED_SECRET || "local-dev-unsafe-secret";
}

async function getCryptoQuoteData(env: Env, symbol: string, quantity: string) {
  const [pair, bestBidAsk, estimatedAsk] = await Promise.all([
    cryptoGet(env, "read", `/api/v1/crypto/trading/trading_pairs/?symbol=${encodeURIComponent(symbol)}`),
    cryptoGet(env, "read", `/api/v1/crypto/marketdata/best_bid_ask/?symbol=${encodeURIComponent(symbol)}`),
    cryptoGet(env, "read", `/api/v1/crypto/marketdata/estimated_price/?symbol=${encodeURIComponent(symbol)}&side=ask&quantity=${encodeURIComponent(quantity)}`)
  ]);
  return { pair, bestBidAsk, estimatedAsk };
}

async function robinhoodMcpTool(env: Env, name: string, args: Record<string, unknown>) {
  if (!env.ROBINHOOD_MCP_TRADING_ACCESS_TOKEN) {
    throw new Error("ROBINHOOD_MCP_TRADING_ACCESS_TOKEN is not configured. Sync a fresh Robinhood MCP OAuth access token before using equity tools.");
  }
  const response = await fetch(env.ROBINHOOD_MCP_TRADING_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.ROBINHOOD_MCP_TRADING_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-03-26"
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name, arguments: args } })
  });
  if (!response.ok) throw new Error(`Robinhood MCP ${name} failed: ${response.status}`);
  const rpc = parseMcpResponse(await response.text());
  if (rpc.error) throw new Error(rpc.error.message ?? `Robinhood MCP ${name} returned an error`);
  const firstText = rpc.result?.content?.[0]?.text;
  const parsedText = tryParseJson(firstText);
  const content = rpc.result?.structuredContent ?? parsedText ?? { text: firstText ?? "" };
  return redactAccountNumbers(content);
}

async function cryptoGet(env: Env, key: "read" | "trade", path: string) {
  return cryptoRequest(env, key, "GET", path);
}

async function cryptoPost(env: Env, key: "read" | "trade", path: string, body: unknown) {
  return cryptoRequest(env, key, "POST", path, JSON.stringify(body));
}

async function cryptoRequest(env: Env, key: "read" | "trade", method: string, path: string, body = "") {
  const apiKey = key === "read" ? env.ROBINHOOD_CRYPTO_READ_API_KEY : env.ROBINHOOD_CRYPTO_TRADE_API_KEY;
  const privateKey = key === "read" ? env.ROBINHOOD_CRYPTO_READ_PRIVATE_KEY_BASE64 : env.ROBINHOOD_CRYPTO_TRADE_PRIVATE_KEY_BASE64;
  if (!apiKey || !privateKey) throw new Error(`Robinhood Crypto ${key} API key/private key is not configured.`);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signatureBase64 = signEd25519(privateKey, `${apiKey}${timestamp}${path}${method}${body}`);
  const response = await fetch(`${env.ROBINHOOD_CRYPTO_API_BASE}${path}`, {
    method,
    headers: {
      "x-api-key": apiKey,
      "x-timestamp": timestamp,
      "x-signature": signatureBase64,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: method === "GET" ? undefined : body
  });
  const text = await response.text();
  const parsed = text ? tryParseJson(text) ?? text : null;
  if (!response.ok) throw new Error(`Robinhood Crypto ${method} ${path} failed: ${response.status} ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`);
  return redactAccountNumbers(parsed);
}

function signEd25519(privateKeyBase64: string, message: string) {
  const privateKey = base64ToBytes(privateKeyBase64);
  const signature = ed25519.sign(new TextEncoder().encode(message), privateKey);
  return bytesToBase64(signature);
}

function widgetResponse() {
  return new Response(widgetHtml(), {
    headers: {
      "Content-Type": "text/html;profile=mcp-app; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function widgetHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Robinhood Guardrail Console</title>
  <style>
    :root { color-scheme: light; --ink: #102018; --muted: #607060; --line: #d6e8d2; --leaf: #0f7a3b; --cream: #fbf7e8; --card: #ffffff; }
    body { margin: 0; font: 15px/1.45 Georgia, "Times New Roman", serif; color: var(--ink); background: radial-gradient(circle at top left, #d8f7c4, transparent 34%), linear-gradient(135deg, #fbf7e8, #eef8e8); }
    main { max-width: 860px; margin: 0 auto; padding: 28px; }
    .hero { border: 1px solid var(--line); border-radius: 24px; padding: 24px; background: rgba(255,255,255,.82); box-shadow: 0 20px 70px rgba(20,80,30,.12); }
    h1 { font-size: clamp(28px, 6vw, 54px); line-height: .95; margin: 0 0 12px; letter-spacing: -.04em; }
    p { margin: 0 0 16px; color: var(--muted); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-top: 18px; }
    .tile { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 16px; }
    .label { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
    .value { font-size: 22px; margin-top: 6px; color: var(--leaf); }
    button { border: 0; background: var(--leaf); color: white; border-radius: 999px; padding: 11px 16px; cursor: pointer; font-weight: 700; }
    code { background: #eef6ea; padding: 2px 6px; border-radius: 6px; }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>Robinhood Guardrail Console</h1>
      <p>Use ChatGPT tools for read checks, quotes, and explicit-confirmation trade flows. Secrets stay in Cloudflare/AWS, not in this widget.</p>
      <button id="ask">Ask ChatGPT for account status</button>
      <div class="grid">
        <div class="tile"><div class="label">Equities</div><div class="value">Agentic MCP</div></div>
        <div class="tile"><div class="label">Crypto</div><div class="value">API guarded</div></div>
        <div class="tile"><div class="label">Orders</div><div class="value">Confirm first</div></div>
      </div>
      <p style="margin-top:18px">Suggested prompt: <code>Render dashboard, run the no-trade audit, then quote USDC-USD for quantity 5.</code></p>
    </section>
  </main>
  <script>
    document.getElementById("ask").addEventListener("click", async () => {
      if (window.openai?.sendFollowUpMessage) {
        await window.openai.sendFollowUpMessage({ prompt: "Run the no-trade audit and render the Robinhood dashboard." });
      }
    });
  </script>
</body>
</html>`;
}

function toolJson(message: string, data: unknown) {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: data,
    _meta: { raw: data }
  };
}

function rpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
