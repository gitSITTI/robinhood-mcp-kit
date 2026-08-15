/**
 * Verify that the Worker proxies calls to the Robinhood MCP with the
 * argument names documented for that upstream tool.
 *
 * This is the RH-2 [P0] verification: cancel_equity_order forwards
 * `{ account_number, order_id }` to the upstream MCP endpoint. This is
 * asserted via a mocked fetch — no live Robinhood account is touched.
 *
 * The documented argument shape is defined in README.md ("Trading" tools),
 * docs/SESSION-LOG.md, and the AGENT_HANDOFF runbook. The source of truth
 * for equity order args is `place_equity_order` / `review_equity_order`,
 * which take `{ account_number, symbol, side, type, ... }`; `cancel_equity_order`
 * follows the same convention with `{ account_number, order_id }`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.ts";
import {
  installFetchHarness,
  makeAccessToken,
  mcpToolResult,
  testEnvBase
} from "./harness.ts";

async function callTool(name: string, args: Record<string, unknown>, env: Record<string, unknown>) {
  return worker.fetch(new Request("https://worker.test/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args }
    })
  }), env as any);
}

test("cancel_equity_order forwards { account_number, order_id } to trading MCP", async () => {
  const harness = installFetchHarness();
  const capturedBodies: string[] = [];
  harness.setResponder((call) => {
    capturedBodies.push(call.body ?? "");
    const parsed = JSON.parse(call.body ?? "{}");
    const method = parsed.params?.name;
    if (method === "get_accounts") {
      return mcpToolResult({
        data: { accounts: [{ account_number: "1234567890", agentic_allowed: true, nickname: "Agentic" }] }
      });
    }
    if (method === "cancel_equity_order") {
      return mcpToolResult({ data: { canceled: true } });
    }
    return new Response("unexpected", { status: 500 });
  });

  const env = {
    ...testEnvBase,
    ROBINHOOD_MCP_TRADING_ACCESS_TOKEN: makeAccessToken(3600)
  };

  const response = await callTool("cancel_equity_order", { orderId: "order-abc-123" }, env);
  assert.equal(response.status, 200);
  const body = await response.json() as { result?: { structuredContent?: unknown }; error?: unknown };
  assert.equal(body.error, undefined, `RPC error: ${JSON.stringify(body.error)}`);

  const cancelCall = capturedBodies
    .map((raw) => JSON.parse(raw))
    .find((rpc) => rpc.params?.name === "cancel_equity_order");
  assert.ok(cancelCall, "cancel_equity_order was not forwarded to trading MCP");

  const forwardedArgs = cancelCall.params.arguments as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(forwardedArgs).sort(),
    ["account_number", "order_id"].sort(),
    "cancel_equity_order args must be exactly { account_number, order_id }"
  );
  assert.equal(forwardedArgs.order_id, "order-abc-123");
  assert.equal(forwardedArgs.account_number, "1234567890");

  harness.restore();
});

test("cancel_equity_order rejects missing order id", async () => {
  const harness = installFetchHarness();
  harness.setResponder(() => mcpToolResult({
    data: { accounts: [{ account_number: "1234567890", agentic_allowed: true }] }
  }));

  const env = {
    ...testEnvBase,
    ROBINHOOD_MCP_TRADING_ACCESS_TOKEN: makeAccessToken(3600)
  };

  const response = await callTool("cancel_equity_order", {}, env);
  const body = await response.json() as { error?: { message: string }; result?: unknown };
  assert.ok(body.error, "expected RPC error");
  assert.match(body.error!.message, /orderId is required/i);

  harness.restore();
});

test("cancel_equity_order also accepts snake_case order_id", async () => {
  const harness = installFetchHarness();
  const capturedBodies: string[] = [];
  harness.setResponder((call) => {
    capturedBodies.push(call.body ?? "");
    const parsed = JSON.parse(call.body ?? "{}");
    const method = parsed.params?.name;
    if (method === "get_accounts") {
      return mcpToolResult({
        data: { accounts: [{ account_number: "1234567890", agentic_allowed: true }] }
      });
    }
    return mcpToolResult({ data: { canceled: true } });
  });

  const env = {
    ...testEnvBase,
    ROBINHOOD_MCP_TRADING_ACCESS_TOKEN: makeAccessToken(3600)
  };
  const response = await callTool("cancel_equity_order", { order_id: "order-xyz" }, env);
  assert.equal(response.status, 200);
  const cancelCall = capturedBodies
    .map((raw) => JSON.parse(raw))
    .find((rpc) => rpc.params?.name === "cancel_equity_order");
  assert.equal(cancelCall.params.arguments.order_id, "order-xyz");

  harness.restore();
});

test("trading MCP calls send bearer token and Accept header", async () => {
  const harness = installFetchHarness();
  const capturedHeaders: Record<string, string>[] = [];
  harness.setResponder((call) => {
    capturedHeaders.push(call.headers);
    const parsed = JSON.parse(call.body ?? "{}");
    if (parsed.params?.name === "get_accounts") {
      return mcpToolResult({
        data: { accounts: [{ account_number: "1234567890", agentic_allowed: true }] }
      });
    }
    return mcpToolResult({ data: { canceled: true } });
  });

  const env = {
    ...testEnvBase,
    ROBINHOOD_MCP_TRADING_ACCESS_TOKEN: makeAccessToken(3600)
  };
  await callTool("cancel_equity_order", { orderId: "o1" }, env);

  for (const headers of capturedHeaders) {
    assert.ok(/^Bearer /.test(headers.authorization ?? ""), "Authorization header missing");
    assert.match(headers.accept ?? "", /application\/json/);
    assert.equal(headers["mcp-protocol-version"], "2025-03-26");
  }

  harness.restore();
});

test("expired access token blocks equity MCP call before network", async () => {
  const harness = installFetchHarness();
  let called = false;
  harness.setResponder(() => {
    called = true;
    return mcpToolResult({});
  });

  const env = {
    ...testEnvBase,
    ROBINHOOD_MCP_TRADING_ACCESS_TOKEN: makeAccessToken(-60)
  };
  const response = await callTool("cancel_equity_order", { orderId: "o1" }, env);
  const body = await response.json() as { error?: { message: string } };
  assert.ok(body.error, "expected error for expired token");
  assert.match(body.error!.message, /expired/i);
  assert.equal(called, false, "expired token must short-circuit before hitting upstream");

  harness.restore();
});

test("missing access token blocks equity MCP call with actionable error", async () => {
  const harness = installFetchHarness();
  const env = { ...testEnvBase };
  const response = await callTool("cancel_equity_order", { orderId: "o1" }, env);
  const body = await response.json() as { error?: { message: string } };
  assert.ok(body.error);
  assert.match(body.error!.message, /ROBINHOOD_MCP_TRADING_ACCESS_TOKEN/);
  harness.restore();
});

test("get_crypto_holdings signs a GET against v1 crypto holdings endpoint", async () => {
  const harness = installFetchHarness();
  const captured: { url: string; method: string; headers: Record<string, string> }[] = [];
  harness.setResponder((call) => {
    captured.push({ url: call.url, method: call.method, headers: call.headers });
    return new Response(JSON.stringify({ results: [{ asset_code: "USDC", total_quantity: "1.0" }] }), {
      headers: { "Content-Type": "application/json" }
    });
  });

  const env = {
    ...testEnvBase,
    ROBINHOOD_CRYPTO_READ_API_KEY: "rh-crypto-key",
    ROBINHOOD_CRYPTO_READ_PRIVATE_KEY_BASE64: btoa(String.fromCharCode(...new Uint8Array(32)))
  };
  const response = await callTool("get_crypto_holdings", {}, env);
  assert.equal(response.status, 200);
  const body = await response.json() as { result?: { structuredContent?: unknown }; error?: unknown };
  assert.equal(body.error, undefined, `unexpected error: ${JSON.stringify(body.error)}`);

  assert.equal(captured.length, 1);
  assert.equal(captured[0].method, "GET");
  assert.match(captured[0].url, /\/api\/v1\/crypto\/trading\/holdings\//);
  assert.ok(captured[0].headers["x-api-key"], "x-api-key header missing");
  assert.ok(captured[0].headers["x-signature"], "x-signature header missing");
  assert.ok(captured[0].headers["x-timestamp"], "x-timestamp header missing");

  harness.restore();
});

test("get_crypto_holdings forwards asset_code filter as query string", async () => {
  const harness = installFetchHarness();
  const captured: { url: string }[] = [];
  harness.setResponder((call) => {
    captured.push({ url: call.url });
    return new Response(JSON.stringify({ results: [] }), {
      headers: { "Content-Type": "application/json" }
    });
  });

  const env = {
    ...testEnvBase,
    ROBINHOOD_CRYPTO_READ_API_KEY: "rh-crypto-key",
    ROBINHOOD_CRYPTO_READ_PRIVATE_KEY_BASE64: btoa(String.fromCharCode(...new Uint8Array(32)))
  };
  await callTool("get_crypto_holdings", { asset_code: "btc" }, env);
  assert.equal(captured.length, 1);
  assert.match(captured[0].url, /asset_code=BTC/);

  harness.restore();
});
