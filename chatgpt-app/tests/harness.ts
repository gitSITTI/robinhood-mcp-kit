/**
 * Test harness for the Worker.
 *
 * Provides a helper to build a mock Env, install a scriptable fetch mock,
 * and invoke the Worker's default export exactly like Cloudflare would.
 *
 * The harness never touches the real network and never requires live
 * Robinhood credentials. All upstream calls are captured for assertions.
 */

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
};

type FetchResponder = (call: FetchCall) => Response | Promise<Response>;

export interface Harness {
  calls: FetchCall[];
  setResponder(responder: FetchResponder): void;
  restore(): void;
}

const originalFetch = globalThis.fetch;

export function installFetchHarness(defaultResponder: FetchResponder = defaultDeny): Harness {
  const calls: FetchCall[] = [];
  let responder = defaultResponder;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input as RequestInfo, init);
    const bodyText = init?.body === undefined || init.body === null
      ? null
      : typeof init.body === "string"
        ? init.body
        : await request.clone().text();
    const call: FetchCall = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: bodyText
    };
    calls.push(call);
    return responder(call);
  }) as typeof fetch;

  return {
    calls,
    setResponder(next) {
      responder = next;
    },
    restore() {
      globalThis.fetch = originalFetch;
    }
  };
}

function defaultDeny(call: FetchCall): Response {
  return new Response(JSON.stringify({ error: `unhandled fetch to ${call.url}` }), {
    status: 599,
    headers: { "Content-Type": "application/json" }
  });
}

export const testEnvBase = {
  ROBINHOOD_MCP_TRADING_URL: "https://agent.robinhood.com/mcp/trading",
  ROBINHOOD_CRYPTO_API_BASE: "https://trading.robinhood.com",
  APP_SHARED_SECRET: "test-shared-secret-do-not-use"
};

export function makeAccessToken(expSecondsFromNow = 3600): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" })).replace(/=+$/, "");
  const claims = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow })).replace(/=+$/, "");
  return `${header}.${claims}.signature`;
}

export function jsonRpc(method: string, params?: Record<string, unknown>, id: string | number = 1) {
  return { jsonrpc: "2.0", id, method, params };
}

export function mcpToolResult(structuredContent: unknown) {
  return new Response(JSON.stringify({
    jsonrpc: "2.0",
    id: "upstream",
    result: {
      content: [{ type: "text", text: JSON.stringify(structuredContent) }],
      structuredContent
    }
  }), { headers: { "Content-Type": "application/json" } });
}
