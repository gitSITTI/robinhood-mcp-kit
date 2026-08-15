/**
 * Automated refresh path for the Robinhood MCP OAuth access token.
 *
 * Design goals:
 *   - Pure, testable functions. No dependency on Worker `env` beyond what
 *     is passed in explicitly.
 *   - `fetch` is injected so tests can hit a fake token endpoint and a
 *     fake Cloudflare secrets endpoint. Nothing here talks to production
 *     Robinhood by default.
 *   - Never log the refresh_token or the raw access_token. Redacted
 *     structured outputs only.
 *   - Fail closed: any misconfiguration produces a `skipped` outcome
 *     with a machine-readable reason, not an unhandled exception.
 *
 * This module powers two entrypoints:
 *   - `scheduled(event, env, ctx)` in `src/index.ts` — Cloudflare cron.
 *   - `POST /refresh-token` — operator-triggered refresh, gated by the
 *     same `APP_SHARED_SECRET` used for opt-in MCP auth.
 */

export interface RefreshEnv {
  ROBINHOOD_MCP_TRADING_ACCESS_TOKEN?: string;
  ROBINHOOD_MCP_TRADING_REFRESH_TOKEN?: string;
  ROBINHOOD_MCP_OAUTH_TOKEN_ENDPOINT?: string;
  ROBINHOOD_MCP_OAUTH_CLIENT_ID?: string;
  TOKEN_REFRESH_ENABLED?: string;
  TOKEN_REFRESH_THRESHOLD_SECONDS?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_WORKER_NAME?: string;
  CLOUDFLARE_SECRETS_API_TOKEN?: string;
}

export interface RefreshDeps {
  fetch: typeof fetch;
  nowSeconds?: () => number;
}

export type RefreshOutcome =
  | { status: "disabled"; reason: string }
  | { status: "misconfigured"; reason: string; missing: string[] }
  | { status: "skipped"; reason: string; expiresInSeconds: number | null }
  | { status: "refreshed"; expiresInSeconds: number | null; rotatedRefreshToken: boolean; updatedSecrets: string[] }
  | { status: "failed"; reason: string; stage: "token" | "cloudflare" };

const DEFAULT_THRESHOLD_SECONDS = 1800;
const REFRESH_TOKEN_SECRET_NAME = "ROBINHOOD_MCP_TRADING_REFRESH_TOKEN";
const ACCESS_TOKEN_SECRET_NAME = "ROBINHOOD_MCP_TRADING_ACCESS_TOKEN";

export function isTruthyFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function decodeJwtExp(token: string | undefined): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const claims = JSON.parse(binary) as { exp?: unknown };
    const exp = typeof claims.exp === "number" ? claims.exp : Number.parseInt(String(claims.exp ?? ""), 10);
    return Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

export function shouldRefreshAccessToken(
  token: string | undefined,
  nowSeconds: number,
  thresholdSeconds: number
): { refresh: boolean; reason: string; expiresInSeconds: number | null } {
  if (!token) return { refresh: true, reason: "no-access-token", expiresInSeconds: null };
  const exp = decodeJwtExp(token);
  if (exp === null) {
    // Opaque token — we cannot inspect it. Prefer refreshing on schedule
    // rather than waiting for a live 401 on the trading MCP.
    return { refresh: true, reason: "opaque-token", expiresInSeconds: null };
  }
  const runway = exp - nowSeconds;
  if (runway <= thresholdSeconds) {
    return { refresh: true, reason: runway <= 0 ? "expired" : "near-expiry", expiresInSeconds: runway };
  }
  return { refresh: false, reason: "has-runway", expiresInSeconds: runway };
}

interface TokenEndpointResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

export async function callTokenEndpoint(deps: RefreshDeps, args: {
  tokenEndpoint: string;
  clientId: string;
  refreshToken: string;
}): Promise<TokenEndpointResponse> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
    client_id: args.clientId
  });
  const response = await deps.fetch(args.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: form.toString()
  });
  const text = await response.text();
  if (!response.ok) {
    // Deliberately do NOT include the response body. Some OAuth servers
    // echo the refresh_token or an access_token even on error paths.
    throw new Error(`token endpoint returned HTTP ${response.status}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("token endpoint returned non-JSON body");
  }
  if (!isRecord(parsed) || typeof parsed.access_token !== "string" || !parsed.access_token) {
    throw new Error("token endpoint response missing access_token");
  }
  const result: TokenEndpointResponse = { access_token: parsed.access_token };
  if (typeof parsed.refresh_token === "string" && parsed.refresh_token) {
    result.refresh_token = parsed.refresh_token;
  }
  if (typeof parsed.expires_in === "number" && Number.isFinite(parsed.expires_in)) {
    result.expires_in = parsed.expires_in;
  }
  if (typeof parsed.token_type === "string") result.token_type = parsed.token_type;
  if (typeof parsed.scope === "string") result.scope = parsed.scope;
  return result;
}

export async function putWorkerSecret(deps: RefreshDeps, args: {
  accountId: string;
  scriptName: string;
  apiToken: string;
  name: string;
  value: string;
}): Promise<void> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(args.accountId)}/workers/scripts/${encodeURIComponent(args.scriptName)}/secrets`;
  const response = await deps.fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${args.apiToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: args.name, text: args.value, type: "secret_text" })
  });
  if (!response.ok) {
    const status = response.status;
    // Read (and discard) the body; Cloudflare error payloads contain the
    // secret name we sent, which is fine, but do not include the secret
    // value in any log line.
    await response.text().catch(() => "");
    throw new Error(`Cloudflare secrets API returned HTTP ${status} for secret ${args.name}`);
  }
}

export async function runScheduledRefresh(
  env: RefreshEnv,
  deps: RefreshDeps
): Promise<RefreshOutcome> {
  if (!isTruthyFlag(env.TOKEN_REFRESH_ENABLED)) {
    return { status: "disabled", reason: "TOKEN_REFRESH_ENABLED is not true" };
  }

  const missing: string[] = [];
  if (!env.ROBINHOOD_MCP_TRADING_REFRESH_TOKEN) missing.push("ROBINHOOD_MCP_TRADING_REFRESH_TOKEN");
  if (!env.ROBINHOOD_MCP_OAUTH_TOKEN_ENDPOINT) missing.push("ROBINHOOD_MCP_OAUTH_TOKEN_ENDPOINT");
  if (!env.ROBINHOOD_MCP_OAUTH_CLIENT_ID) missing.push("ROBINHOOD_MCP_OAUTH_CLIENT_ID");
  if (!env.CLOUDFLARE_ACCOUNT_ID) missing.push("CLOUDFLARE_ACCOUNT_ID");
  if (!env.CLOUDFLARE_WORKER_NAME) missing.push("CLOUDFLARE_WORKER_NAME");
  if (!env.CLOUDFLARE_SECRETS_API_TOKEN) missing.push("CLOUDFLARE_SECRETS_API_TOKEN");
  if (missing.length > 0) {
    return { status: "misconfigured", reason: "required env values missing", missing };
  }

  const nowSeconds = deps.nowSeconds ? deps.nowSeconds() : Math.floor(Date.now() / 1000);
  const thresholdSeconds = parseThreshold(env.TOKEN_REFRESH_THRESHOLD_SECONDS);
  const decision = shouldRefreshAccessToken(env.ROBINHOOD_MCP_TRADING_ACCESS_TOKEN, nowSeconds, thresholdSeconds);
  if (!decision.refresh) {
    return { status: "skipped", reason: decision.reason, expiresInSeconds: decision.expiresInSeconds };
  }

  let tokenResponse: TokenEndpointResponse;
  try {
    tokenResponse = await callTokenEndpoint(deps, {
      tokenEndpoint: env.ROBINHOOD_MCP_OAUTH_TOKEN_ENDPOINT as string,
      clientId: env.ROBINHOOD_MCP_OAUTH_CLIENT_ID as string,
      refreshToken: env.ROBINHOOD_MCP_TRADING_REFRESH_TOKEN as string
    });
  } catch (error) {
    return { status: "failed", stage: "token", reason: errorMessage(error) };
  }

  const updates: Array<{ name: string; value: string }> = [
    { name: ACCESS_TOKEN_SECRET_NAME, value: tokenResponse.access_token }
  ];
  if (tokenResponse.refresh_token) {
    updates.push({ name: REFRESH_TOKEN_SECRET_NAME, value: tokenResponse.refresh_token });
  }

  const cfArgs = {
    accountId: env.CLOUDFLARE_ACCOUNT_ID as string,
    scriptName: env.CLOUDFLARE_WORKER_NAME as string,
    apiToken: env.CLOUDFLARE_SECRETS_API_TOKEN as string
  };
  const updated: string[] = [];
  for (const secret of updates) {
    try {
      await putWorkerSecret(deps, { ...cfArgs, name: secret.name, value: secret.value });
      updated.push(secret.name);
    } catch (error) {
      return {
        status: "failed",
        stage: "cloudflare",
        reason: errorMessage(error)
      };
    }
  }

  return {
    status: "refreshed",
    expiresInSeconds: tokenResponse.expires_in ?? null,
    rotatedRefreshToken: Boolean(tokenResponse.refresh_token),
    updatedSecrets: updated
  };
}

function parseThreshold(value: string | undefined): number {
  if (!value) return DEFAULT_THRESHOLD_SECONDS;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_THRESHOLD_SECONDS;
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
