/**
 * Offline tests for the automated OAuth token refresh path (RH-5 / H5).
 *
 * These tests never touch a live Robinhood OAuth server or the live
 * Cloudflare API. `installFetchHarness` swaps out `globalThis.fetch` with
 * a scripted responder that plays the role of both the token endpoint
 * and the Cloudflare Workers Scripts Secrets endpoint.
 *
 * Every "token" value used below is a synthetic JWT-shaped string. No
 * real refresh_tokens, access_tokens, or Cloudflare API tokens appear.
 */

import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.ts";
import {
  callTokenEndpoint,
  decodeJwtExp,
  isTruthyFlag,
  putWorkerSecret,
  runScheduledRefresh,
  shouldRefreshAccessToken
} from "../src/refresh.ts";
import { installFetchHarness, makeAccessToken, testEnvBase } from "./harness.ts";

const TOKEN_ENDPOINT = "https://oauth.example.test/token";
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4/accounts/acct-fake/workers/scripts/robinhood-chatgpt-app/secrets";

function refreshEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    ...testEnvBase,
    TOKEN_REFRESH_ENABLED: "true",
    TOKEN_REFRESH_THRESHOLD_SECONDS: "600",
    ROBINHOOD_MCP_TRADING_ACCESS_TOKEN: makeAccessToken(60),
    ROBINHOOD_MCP_TRADING_REFRESH_TOKEN: "fake-refresh-token-not-real",
    ROBINHOOD_MCP_OAUTH_TOKEN_ENDPOINT: TOKEN_ENDPOINT,
    ROBINHOOD_MCP_OAUTH_CLIENT_ID: "fake-client-id",
    CLOUDFLARE_ACCOUNT_ID: "acct-fake",
    CLOUDFLARE_WORKER_NAME: "robinhood-chatgpt-app",
    CLOUDFLARE_SECRETS_API_TOKEN: "fake-cf-token-not-real",
    ...overrides
  };
}

test("isTruthyFlag accepts true/1/yes and rejects everything else", () => {
  for (const value of ["true", "TRUE", " True ", "1", "yes", "YES"]) {
    assert.equal(isTruthyFlag(value), true, `expected truthy for ${value}`);
  }
  for (const value of [undefined, "", "false", "0", "no", "maybe"]) {
    assert.equal(isTruthyFlag(value), false, `expected falsy for ${value ?? "undefined"}`);
  }
});

test("decodeJwtExp reads the exp claim from a JWT-shaped token", () => {
  const token = makeAccessToken(3600);
  const exp = decodeJwtExp(token);
  assert.ok(exp !== null && exp > Math.floor(Date.now() / 1000));
});

test("decodeJwtExp returns null for opaque tokens", () => {
  assert.equal(decodeJwtExp(undefined), null);
  assert.equal(decodeJwtExp(""), null);
  assert.equal(decodeJwtExp("opaque"), null);
  assert.equal(decodeJwtExp("a.b"), null);
});

test("shouldRefreshAccessToken forces refresh when the token is missing", () => {
  const decision = shouldRefreshAccessToken(undefined, 1000, 60);
  assert.equal(decision.refresh, true);
  assert.equal(decision.reason, "no-access-token");
});

test("shouldRefreshAccessToken forces refresh when the token is opaque", () => {
  const decision = shouldRefreshAccessToken("opaque-token", 1000, 60);
  assert.equal(decision.refresh, true);
  assert.equal(decision.reason, "opaque-token");
});

test("shouldRefreshAccessToken skips when runway exceeds threshold", () => {
  const token = makeAccessToken(3600);
  const decision = shouldRefreshAccessToken(token, Math.floor(Date.now() / 1000), 600);
  assert.equal(decision.refresh, false);
  assert.equal(decision.reason, "has-runway");
});

test("shouldRefreshAccessToken refreshes when runway is under threshold", () => {
  const token = makeAccessToken(60);
  const decision = shouldRefreshAccessToken(token, Math.floor(Date.now() / 1000), 600);
  assert.equal(decision.refresh, true);
  assert.equal(decision.reason, "near-expiry");
});

test("shouldRefreshAccessToken refreshes when the token has already expired", () => {
  const token = makeAccessToken(-60);
  const decision = shouldRefreshAccessToken(token, Math.floor(Date.now() / 1000), 600);
  assert.equal(decision.refresh, true);
  assert.equal(decision.reason, "expired");
});

test("callTokenEndpoint POSTs form-encoded grant_type=refresh_token", async () => {
  const harness = installFetchHarness();
  const captured: { url: string; method: string; body: string | null; headers: Record<string, string> } = {
    url: "", method: "", body: null, headers: {}
  };
  harness.setResponder((call) => {
    captured.url = call.url;
    captured.method = call.method;
    captured.body = call.body;
    captured.headers = call.headers;
    return new Response(JSON.stringify({
      access_token: "fake-new-access-token",
      refresh_token: "fake-new-refresh-token",
      expires_in: 3600,
      token_type: "Bearer"
    }), { headers: { "Content-Type": "application/json" } });
  });

  const response = await callTokenEndpoint({ fetch: globalThis.fetch }, {
    tokenEndpoint: TOKEN_ENDPOINT,
    clientId: "cid-1",
    refreshToken: "rt-1"
  });

  assert.equal(captured.method, "POST");
  assert.equal(captured.url, TOKEN_ENDPOINT);
  assert.match(captured.headers["content-type"] ?? "", /application\/x-www-form-urlencoded/);
  const parsed = new URLSearchParams(captured.body ?? "");
  assert.equal(parsed.get("grant_type"), "refresh_token");
  assert.equal(parsed.get("refresh_token"), "rt-1");
  assert.equal(parsed.get("client_id"), "cid-1");
  assert.equal(response.access_token, "fake-new-access-token");
  assert.equal(response.refresh_token, "fake-new-refresh-token");
  assert.equal(response.expires_in, 3600);

  harness.restore();
});

test("callTokenEndpoint rejects non-JSON and missing access_token responses", async () => {
  const harness = installFetchHarness();
  harness.setResponder(() => new Response("<html>500</html>", { status: 500 }));
  await assert.rejects(
    callTokenEndpoint({ fetch: globalThis.fetch }, { tokenEndpoint: TOKEN_ENDPOINT, clientId: "c", refreshToken: "r" }),
    /HTTP 500/
  );
  harness.setResponder(() => new Response("not-json", { status: 200 }));
  await assert.rejects(
    callTokenEndpoint({ fetch: globalThis.fetch }, { tokenEndpoint: TOKEN_ENDPOINT, clientId: "c", refreshToken: "r" }),
    /non-JSON/
  );
  harness.setResponder(() => new Response(JSON.stringify({ refresh_token: "only" }), { status: 200 }));
  await assert.rejects(
    callTokenEndpoint({ fetch: globalThis.fetch }, { tokenEndpoint: TOKEN_ENDPOINT, clientId: "c", refreshToken: "r" }),
    /missing access_token/
  );
  harness.restore();
});

test("putWorkerSecret PUTs secret payload to Cloudflare API with bearer auth", async () => {
  const harness = installFetchHarness();
  const captured: { url: string; method: string; body: string | null; headers: Record<string, string> } = {
    url: "", method: "", body: null, headers: {}
  };
  harness.setResponder((call) => {
    captured.url = call.url;
    captured.method = call.method;
    captured.body = call.body;
    captured.headers = call.headers;
    return new Response(JSON.stringify({ success: true, result: null }), { status: 200 });
  });

  await putWorkerSecret({ fetch: globalThis.fetch }, {
    accountId: "acct-fake",
    scriptName: "robinhood-chatgpt-app",
    apiToken: "fake-cf-token",
    name: "ROBINHOOD_MCP_TRADING_ACCESS_TOKEN",
    value: "fake-new-value"
  });

  assert.equal(captured.method, "PUT");
  assert.equal(captured.url, CLOUDFLARE_API);
  assert.equal(captured.headers.authorization, "Bearer fake-cf-token");
  const payload = JSON.parse(captured.body ?? "{}");
  assert.equal(payload.name, "ROBINHOOD_MCP_TRADING_ACCESS_TOKEN");
  assert.equal(payload.text, "fake-new-value");
  assert.equal(payload.type, "secret_text");

  harness.restore();
});

test("putWorkerSecret surfaces Cloudflare error status without echoing the secret", async () => {
  const harness = installFetchHarness();
  harness.setResponder(() => new Response(JSON.stringify({ success: false, errors: [{ code: 10001 }] }), { status: 403 }));
  await assert.rejects(
    putWorkerSecret({ fetch: globalThis.fetch }, {
      accountId: "acct-fake",
      scriptName: "robinhood-chatgpt-app",
      apiToken: "fake",
      name: "ROBINHOOD_MCP_TRADING_ACCESS_TOKEN",
      value: "should-not-appear-in-error"
    }),
    (error: Error) => {
      assert.match(error.message, /HTTP 403/);
      assert.ok(!error.message.includes("should-not-appear-in-error"),
        "secret value must not appear in thrown error");
      return true;
    }
  );
  harness.restore();
});

test("runScheduledRefresh returns disabled when the flag is off", async () => {
  const harness = installFetchHarness();
  const env = refreshEnv({ TOKEN_REFRESH_ENABLED: "false" });
  const outcome = await runScheduledRefresh(env, { fetch: globalThis.fetch });
  assert.equal(outcome.status, "disabled");
  assert.equal(harness.calls.length, 0, "no network calls when refresh is disabled");
  harness.restore();
});

test("runScheduledRefresh returns misconfigured when required env is missing", async () => {
  const harness = installFetchHarness();
  const env = refreshEnv({
    ROBINHOOD_MCP_OAUTH_TOKEN_ENDPOINT: undefined,
    CLOUDFLARE_SECRETS_API_TOKEN: undefined
  });
  const outcome = await runScheduledRefresh(env, { fetch: globalThis.fetch });
  assert.equal(outcome.status, "misconfigured");
  if (outcome.status === "misconfigured") {
    assert.ok(outcome.missing.includes("ROBINHOOD_MCP_OAUTH_TOKEN_ENDPOINT"));
    assert.ok(outcome.missing.includes("CLOUDFLARE_SECRETS_API_TOKEN"));
  }
  assert.equal(harness.calls.length, 0, "no network calls when misconfigured");
  harness.restore();
});

test("runScheduledRefresh skips when the current token still has runway", async () => {
  const harness = installFetchHarness();
  const env = refreshEnv({
    ROBINHOOD_MCP_TRADING_ACCESS_TOKEN: makeAccessToken(3600),
    TOKEN_REFRESH_THRESHOLD_SECONDS: "600"
  });
  const outcome = await runScheduledRefresh(env, { fetch: globalThis.fetch });
  assert.equal(outcome.status, "skipped");
  if (outcome.status === "skipped") assert.equal(outcome.reason, "has-runway");
  assert.equal(harness.calls.length, 0, "skip must not touch the network");
  harness.restore();
});

test("runScheduledRefresh refreshes and pushes new secrets when near expiry", async () => {
  const harness = installFetchHarness();
  const calls: Array<{ url: string; method: string; body: string | null }> = [];
  harness.setResponder((call) => {
    calls.push({ url: call.url, method: call.method, body: call.body });
    if (call.url === TOKEN_ENDPOINT) {
      return new Response(JSON.stringify({
        access_token: "fake-rotated-access-token",
        refresh_token: "fake-rotated-refresh-token",
        expires_in: 3600
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (call.url === CLOUDFLARE_API) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response("unexpected", { status: 599 });
  });

  const env = refreshEnv({
    ROBINHOOD_MCP_TRADING_ACCESS_TOKEN: makeAccessToken(60),
    TOKEN_REFRESH_THRESHOLD_SECONDS: "600"
  });
  const outcome = await runScheduledRefresh(env, { fetch: globalThis.fetch });
  assert.equal(outcome.status, "refreshed");
  if (outcome.status === "refreshed") {
    assert.equal(outcome.rotatedRefreshToken, true);
    assert.deepEqual(outcome.updatedSecrets.sort(), [
      "ROBINHOOD_MCP_TRADING_ACCESS_TOKEN",
      "ROBINHOOD_MCP_TRADING_REFRESH_TOKEN"
    ].sort());
  }

  const tokenCall = calls.find((call) => call.url === TOKEN_ENDPOINT);
  const cfCalls = calls.filter((call) => call.url === CLOUDFLARE_API);
  assert.ok(tokenCall, "token endpoint was not called");
  assert.equal(cfCalls.length, 2, "expected two Cloudflare secret PUTs (access + refresh)");
  const cfPayloads = cfCalls.map((call) => JSON.parse(call.body ?? "{}"));
  const names = cfPayloads.map((payload) => payload.name).sort();
  assert.deepEqual(names, [
    "ROBINHOOD_MCP_TRADING_ACCESS_TOKEN",
    "ROBINHOOD_MCP_TRADING_REFRESH_TOKEN"
  ].sort());
  const accessPayload = cfPayloads.find((payload) => payload.name === "ROBINHOOD_MCP_TRADING_ACCESS_TOKEN");
  assert.equal(accessPayload.text, "fake-rotated-access-token");
  const refreshPayload = cfPayloads.find((payload) => payload.name === "ROBINHOOD_MCP_TRADING_REFRESH_TOKEN");
  assert.equal(refreshPayload.text, "fake-rotated-refresh-token");

  harness.restore();
});

test("runScheduledRefresh omits refresh-token push when server did not rotate it", async () => {
  const harness = installFetchHarness();
  harness.setResponder((call) => {
    if (call.url === TOKEN_ENDPOINT) {
      return new Response(JSON.stringify({ access_token: "fake-rotated-access-token", expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
  const env = refreshEnv({ ROBINHOOD_MCP_TRADING_ACCESS_TOKEN: makeAccessToken(60) });
  const outcome = await runScheduledRefresh(env, { fetch: globalThis.fetch });
  assert.equal(outcome.status, "refreshed");
  if (outcome.status === "refreshed") {
    assert.equal(outcome.rotatedRefreshToken, false);
    assert.deepEqual(outcome.updatedSecrets, ["ROBINHOOD_MCP_TRADING_ACCESS_TOKEN"]);
  }
  harness.restore();
});

test("runScheduledRefresh reports token-stage failure when the OAuth server errors", async () => {
  const harness = installFetchHarness();
  harness.setResponder((call) => {
    if (call.url === TOKEN_ENDPOINT) return new Response("invalid_grant", { status: 400 });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
  const env = refreshEnv({ ROBINHOOD_MCP_TRADING_ACCESS_TOKEN: makeAccessToken(60) });
  const outcome = await runScheduledRefresh(env, { fetch: globalThis.fetch });
  assert.equal(outcome.status, "failed");
  if (outcome.status === "failed") {
    assert.equal(outcome.stage, "token");
    assert.match(outcome.reason, /HTTP 400/);
  }
  harness.restore();
});

test("runScheduledRefresh reports cloudflare-stage failure when secrets API errors", async () => {
  const harness = installFetchHarness();
  harness.setResponder((call) => {
    if (call.url === TOKEN_ENDPOINT) {
      return new Response(JSON.stringify({ access_token: "fake-new", expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: false }), { status: 403 });
  });
  const env = refreshEnv({ ROBINHOOD_MCP_TRADING_ACCESS_TOKEN: makeAccessToken(60) });
  const outcome = await runScheduledRefresh(env, { fetch: globalThis.fetch });
  assert.equal(outcome.status, "failed");
  if (outcome.status === "failed") {
    assert.equal(outcome.stage, "cloudflare");
    assert.match(outcome.reason, /HTTP 403/);
  }
  harness.restore();
});

test("POST /refresh-token requires APP_SHARED_SECRET bearer", async () => {
  const harness = installFetchHarness();
  const env = refreshEnv();
  const unauthorized = await worker.fetch(new Request("https://worker.test/refresh-token", { method: "POST" }), env as any);
  assert.equal(unauthorized.status, 401);
  assert.equal(harness.calls.length, 0, "unauthorized request must not touch upstreams");
  harness.restore();
});

test("POST /refresh-token executes the refresh with a matching bearer", async () => {
  const harness = installFetchHarness();
  harness.setResponder((call) => {
    if (call.url === TOKEN_ENDPOINT) {
      return new Response(JSON.stringify({ access_token: "fake-rotated", expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
  const env = refreshEnv({ ROBINHOOD_MCP_TRADING_ACCESS_TOKEN: makeAccessToken(60) });
  const response = await worker.fetch(new Request("https://worker.test/refresh-token", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.APP_SHARED_SECRET}` }
  }), env as any);
  assert.equal(response.status, 200);
  const body = await response.json() as { outcome: { status: string } };
  assert.equal(body.outcome.status, "refreshed");
  harness.restore();
});

test("POST /refresh-token rejects GET/other methods", async () => {
  const harness = installFetchHarness();
  const env = refreshEnv();
  const response = await worker.fetch(new Request("https://worker.test/refresh-token", {
    method: "GET",
    headers: { Authorization: `Bearer ${env.APP_SHARED_SECRET}` }
  }), env as any);
  assert.equal(response.status, 405);
  harness.restore();
});

test("scheduled handler runs refresh via the same code path", async () => {
  const harness = installFetchHarness();
  harness.setResponder((call) => {
    if (call.url === TOKEN_ENDPOINT) {
      return new Response(JSON.stringify({ access_token: "fake-rotated", expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
  const env = refreshEnv({ ROBINHOOD_MCP_TRADING_ACCESS_TOKEN: makeAccessToken(60) });
  const promises: Array<Promise<unknown>> = [];
  const ctx = { waitUntil: (promise: Promise<unknown>) => { promises.push(promise); } };
  await worker.scheduled({ cron: "*/15 * * * *", scheduledTime: Date.now() }, env as any, ctx);
  await Promise.all(promises);
  const tokenCalls = harness.calls.filter((call) => call.url === TOKEN_ENDPOINT);
  const cfCalls = harness.calls.filter((call) => call.url === CLOUDFLARE_API);
  assert.equal(tokenCalls.length, 1);
  assert.equal(cfCalls.length, 1);
  harness.restore();
});
