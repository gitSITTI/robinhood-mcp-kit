/**
 * Credential-free smoke tests for the Worker.
 *
 * These tests boot the Worker's default fetch handler in-process, without
 * `wrangler dev`, and verify:
 *
 *   1. Root health check reports serverInfo with the current version.
 *   2. MCP `initialize` reports version 0.2.0.
 *   3. MCP `tools/list` includes the P0 tools that shipped in v0.2.0
 *      (`cancel_equity_order`, `get_crypto_holdings`).
 *   4. Opt-in inbound MCP auth (MCP_REQUIRE_AUTH=true) rejects requests
 *      without a matching bearer token.
 *   5. Widget endpoint responds with HTML.
 *
 * No live Robinhood tokens or Crypto API keys are needed to run this.
 */

import test from "node:test";
import assert from "node:assert/strict";
import worker, { serverInfo, tools } from "../src/index.ts";
import { installFetchHarness, testEnvBase } from "./harness.ts";

const harness = installFetchHarness();

test.after(() => harness.restore());

test("serverInfo advertises v0.2.0", () => {
  assert.equal(serverInfo.version, "0.2.0");
  assert.equal(serverInfo.name, "robinhood-chatgpt-app");
});

test("tool catalog includes P0 additions", () => {
  const names = tools.map((tool) => tool.name);
  assert.ok(names.includes("cancel_equity_order"), "cancel_equity_order missing");
  assert.ok(names.includes("get_crypto_holdings"), "get_crypto_holdings missing");
});

test("GET / returns health payload with serverInfo", async () => {
  const env = { ...testEnvBase };
  const response = await worker.fetch(new Request("https://worker.test/"), env as any);
  assert.equal(response.status, 200);
  const body = await response.json() as { ok: boolean; serverInfo: { version: string } };
  assert.equal(body.ok, true);
  assert.equal(body.serverInfo.version, "0.2.0");
});

test("POST /mcp initialize reports v0.2.0", async () => {
  const env = { ...testEnvBase };
  const response = await worker.fetch(new Request("https://worker.test/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" })
  }), env as any);
  const body = await response.json() as { result: { serverInfo: { version: string } } };
  assert.equal(body.result.serverInfo.version, "0.2.0");
});

test("POST /mcp tools/list contains cancel_equity_order and get_crypto_holdings", async () => {
  const env = { ...testEnvBase };
  const response = await worker.fetch(new Request("https://worker.test/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
  }), env as any);
  const body = await response.json() as { result: { tools: Array<{ name: string }> } };
  const names = body.result.tools.map((tool) => tool.name);
  assert.ok(names.includes("cancel_equity_order"));
  assert.ok(names.includes("get_crypto_holdings"));
});

test("opt-in /mcp auth rejects unauthenticated when MCP_REQUIRE_AUTH=true", async () => {
  const env = { ...testEnvBase, MCP_REQUIRE_AUTH: "true" };
  const response = await worker.fetch(new Request("https://worker.test/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" })
  }), env as any);
  assert.equal(response.status, 401);
});

test("opt-in /mcp auth accepts matching bearer when MCP_REQUIRE_AUTH=true", async () => {
  const env = { ...testEnvBase, MCP_REQUIRE_AUTH: "true" };
  const response = await worker.fetch(new Request("https://worker.test/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testEnvBase.APP_SHARED_SECRET}`
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" })
  }), env as any);
  assert.equal(response.status, 200);
});

test("opt-in /mcp auth is off by default", async () => {
  const env = { ...testEnvBase };
  const response = await worker.fetch(new Request("https://worker.test/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" })
  }), env as any);
  assert.equal(response.status, 200);
});

test("GET /widget serves HTML", async () => {
  const env = { ...testEnvBase };
  const response = await worker.fetch(new Request("https://worker.test/widget"), env as any);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.ok(text.includes("Robinhood Guardrail Console"));
});
