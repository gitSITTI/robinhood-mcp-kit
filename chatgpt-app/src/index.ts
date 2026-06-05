import { ed25519 } from "@noble/curves/ed25519";

type Env = {
  ROBINHOOD_MCP_TRADING_URL: string;
  ROBINHOOD_MCP_TRADING_ACCESS_TOKEN?: string;
  ROBINHOOD_CRYPTO_API_BASE: string;
  ROBINHOOD_CRYPTO_READ_API_KEY?: string;
  ROBINHOOD_CRYPTO_READ_PRIVATE_KEY_BASE64?: string;
  ROBINHOOD_CRYPTO_TRADE_API_KEY?: string;
  ROBINHOOD_CRYPTO_TRADE_PRIVATE_KEY_BASE64?: string;
  APP_SHARED_SECRET?: string;
};

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

const serverInfo = {
  name: "robinhood-chatgpt-app",
  version: "0.1.0"
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
    description: "Use this only after the user explicitly confirms an Agentic equity order and provides the confirmation token.",
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
    name: "run_no_trade_audit",
    title: "Run No-Trade Audit",
    description: "Use this for a read-only audit of Agentic account status, equity orders, positions, and crypto quote/fee status. This never places orders.",
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
    description: "Use this only after the user explicitly confirms the prepared crypto market buy and provides the confirmation token.",
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
    if (url.pathname === "/mcp") return handleMcp(request, env);
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
  if (name === "run_no_trade_audit") return runNoTradeAudit(env, args);
  if (name === "get_crypto_quote") return getCryptoQuote(env, normalizePair(args.symbol), requireString(args.quantity, "quantity"));
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
  const confirmationToken = await makeConfirmationToken(env, stableOrderPayload(order));
  return toolJson("Prepared Agentic equity order. No order was placed.", {
    accountLast4: accountNumber.slice(-4),
    order: redactAccountNumbers(order),
    quote: asRecord(quote.data),
    tradability: asRecord(tradability.data),
    review,
    confirmationToken,
    instruction: "Only call place_confirmed_agentic_equity_order after the user explicitly confirms this exact order."
  });
}

async function placeConfirmedAgenticEquityOrder(env: Env, args: Record<string, unknown>) {
  const { accountNumber } = await getAgenticAccountRecord(env);
  const order = normalizeEquityOrderArgs(args, accountNumber);
  const confirmationToken = requireString(args.confirmationToken, "confirmationToken");
  const expected = await makeConfirmationToken(env, stableOrderPayload(order));
  if (confirmationToken !== expected) throw new Error("Confirmation token does not match the current Agentic equity order parameters.");
  await robinhoodMcpTool(env, "review_equity_order", order);
  const placed = await robinhoodMcpTool(env, "place_equity_order", order);
  return toolJson("Submitted confirmed Agentic equity order.", {
    accountLast4: accountNumber.slice(-4),
    order: redactAccountNumbers(order),
    result: placed
  });
}

async function runNoTradeAudit(env: Env, args: Record<string, unknown>) {
  const { accountNumber } = await getAgenticAccountRecord(env);
  const cryptoSymbol = normalizePair(args.cryptoSymbol ?? "USDC-USD");
  const cryptoQuantity = requireString(args.cryptoQuantity ?? "1", "cryptoQuantity");
  const [agentic, positions, orders, cryptoQuote] = await Promise.all([
    getAgenticAccount(env),
    robinhoodMcpTool(env, "get_equity_positions", { account_number: accountNumber }),
    robinhoodMcpTool(env, "get_equity_orders", { account_number: accountNumber }),
    getCryptoQuoteData(env, cryptoSymbol, cryptoQuantity)
  ]);
  return toolJson("Completed no-trade audit. No orders were placed.", {
    agentic: asRecord(agentic.structuredContent),
    equityPositions: asRecord(positions).data ?? positions,
    equityOrders: asRecord(orders).data ?? orders,
    crypto: { symbol: cryptoSymbol, quantity: cryptoQuantity, quote: cryptoQuote }
  });
}

function normalizeEquityOrderArgs(args: Record<string, unknown>, accountNumber: string) {
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

function stableOrderPayload(order: Record<string, unknown>): Record<string, string> {
  const keys = Object.keys(order).sort();
  const payload: Record<string, string> = {};
  for (const key of keys) payload[key] = String(order[key]);
  return payload;
}

async function getCryptoQuote(env: Env, symbol: string, quantity: string) {
  const [pair, best, estimate] = await Promise.all([
    cryptoGet(env, "read", `/api/v1/crypto/trading/trading_pairs/?symbol=${encodeURIComponent(symbol)}`),
    cryptoGet(env, "read", `/api/v1/crypto/marketdata/best_bid_ask/?symbol=${encodeURIComponent(symbol)}`),
    cryptoGet(env, "read", `/api/v1/crypto/marketdata/estimated_price/?symbol=${encodeURIComponent(symbol)}&side=ask&quantity=${encodeURIComponent(quantity)}`)
  ]);
  return toolJson(`Loaded crypto quote for ${symbol}.`, { symbol, quantity, pair, bestBidAsk: best, estimatedAsk: estimate });
}

async function prepareCryptoMarketBuy(env: Env, symbol: string, quantity: string, requireZeroBuySpread: boolean) {
  const quote = await getCryptoQuoteData(env, symbol, quantity);
  enforceZeroBuySpread(quote.bestBidAsk, requireZeroBuySpread);
  const confirmationToken = await makeConfirmationToken(env, { symbol, quantity, side: "buy", type: "market", guard: "v1-zero-buy-spread" });
  return toolJson("Prepared crypto market buy. No order was placed.", {
    action: "buy",
    symbol,
    quantity,
    requireZeroBuySpread,
    quote,
    confirmationToken,
    instruction: "Only call place_confirmed_crypto_market_buy after the user explicitly confirms this exact order."
  });
}

async function placeConfirmedCryptoMarketBuy(env: Env, symbol: string, quantity: string, confirmationToken: string, requireZeroBuySpread: boolean) {
  const expected = await makeConfirmationToken(env, { symbol, quantity, side: "buy", type: "market", guard: "v1-zero-buy-spread" });
  if (confirmationToken !== expected) throw new Error("Confirmation token does not match the current order parameters.");
  const quote = await getCryptoQuoteData(env, symbol, quantity);
  enforceZeroBuySpread(quote.bestBidAsk, requireZeroBuySpread);
  const order = await cryptoPost(env, "trade", "/api/v1/crypto/trading/orders/", {
    client_order_id: crypto.randomUUID(),
    side: "buy",
    type: "market",
    symbol,
    market_order_config: { asset_quantity: quantity }
  });
  return toolJson("Submitted confirmed crypto market buy through the v1 non-fee endpoint.", { symbol, quantity, order: redactAccountNumbers(order) });
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

async function makeConfirmationToken(env: Env, payload: Record<string, string>) {
  const secret = env.APP_SHARED_SECRET || "local-dev-unsafe-secret";
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64(new Uint8Array(await crypto.subtle.sign("HMAC", key, data))).slice(0, 32);
}

function enforceZeroBuySpread(bestBidAsk: unknown, enabled: boolean) {
  if (!enabled) return;
  const row = (bestBidAsk as { results?: Array<Record<string, unknown>> })?.results?.[0];
  if (!row) throw new Error("No best bid/ask row returned for zero-spread guard.");
  const buySpread = String(row.buy_spread ?? "");
  if (!["0", "0.0", "0.00", "0.0000"].includes(buySpread)) throw new Error(`Zero buy-spread guard failed; buy_spread=${buySpread}`);
}

function parseMcpResponse(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const line = trimmed.split(/\r?\n/).find((item) => item.startsWith("data: "));
  if (!line) throw new Error(`No MCP data line in response: ${trimmed.slice(0, 120)}`);
  return JSON.parse(line.slice(6));
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
      <p style="margin-top:18px">Suggested prompt: <code>Render dashboard, check Agentic account, then quote USDC-USD for quantity 5.</code></p>
    </section>
  </main>
  <script>
    document.getElementById("ask").addEventListener("click", async () => {
      if (window.openai?.sendFollowUpMessage) {
        await window.openai.sendFollowUpMessage({ prompt: "Check my Agentic account status and render the Robinhood dashboard." });
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

function requireString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

function normalizePair(value: unknown) {
  return requireString(value, "symbol").toUpperCase();
}

function tryParseJson(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function redactAccountNumbers(value: unknown): unknown {
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

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
