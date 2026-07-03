#!/usr/bin/env bash
# Smoke test for the deployed Robinhood MCP bridge Worker.
#
# Usage:
#   scripts/smoke-test-mcp.sh https://<worker-host> [shared-secret]
#
# Checks (no Robinhood credentials needed — nothing here touches the account):
#   1. GET  /            -> ok:true + serverInfo
#   2. POST /mcp initialize   -> serverInfo + protocolVersion
#   3. POST /mcp tools/list   -> expected tool names present
#   4. If a shared secret is given, verifies both auth forms work AND that the
#      bare endpoint is rejected (only meaningful when MCP_REQUIRE_AUTH=true).
#
# Never prints the secret. Exit 0 = healthy.
set -euo pipefail

BASE_URL="${1:?Usage: smoke-test-mcp.sh <worker-base-url> [shared-secret]}"
SECRET="${2:-}"
BASE_URL="${BASE_URL%/}"

AUTH_ARGS=()
MCP_PATH="/mcp"
if [ -n "$SECRET" ]; then
  AUTH_ARGS=(-H "Authorization: Bearer $SECRET")
fi

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok   $*"; }

rpc() {
  local method="$1"
  curl -sS --max-time 20 "${AUTH_ARGS[@]}" -X POST "$BASE_URL$MCP_PATH" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"smoke\",\"method\":\"$method\",\"params\":{}}"
}

# 1. Root health
root_json="$(curl -sS --max-time 20 "$BASE_URL/")"
echo "$root_json" | grep -q '"ok": true' || fail "root endpoint unhealthy: $root_json"
pass "root health"

# 2. initialize
init_json="$(rpc initialize)"
echo "$init_json" | grep -q '"protocolVersion"' || fail "initialize failed: $init_json"
version="$(echo "$init_json" | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' | head -1)"
pass "initialize (server version: ${version:-unknown})"

# 3. tools/list — every expected tool must be present
tools_json="$(rpc tools/list)"
for tool in get_agentic_account get_equity_quote prepare_agentic_equity_order \
            place_confirmed_agentic_equity_order cancel_equity_order \
            run_no_trade_audit get_crypto_quote get_crypto_holdings \
            prepare_crypto_market_buy place_confirmed_crypto_market_buy \
            render_dashboard; do
  echo "$tools_json" | grep -q "\"$tool\"" || fail "tools/list is missing: $tool"
done
pass "tools/list (all expected tools present)"

# 4. Auth checks (only when a secret was provided)
if [ -n "$SECRET" ]; then
  bare_status="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/mcp" \
    -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":"x","method":"tools/list"}')"
  if [ "$bare_status" = "401" ]; then
    pass "unauthenticated /mcp correctly rejected (401)"
  else
    echo "warn: bare /mcp returned $bare_status — MCP_REQUIRE_AUTH is not enabled (see docs/runbooks/security-hardening.md)"
  fi
  path_json="$(curl -sS --max-time 20 -X POST "$BASE_URL/mcp/$SECRET" \
    -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":"x","method":"tools/list"}')"
  echo "$path_json" | grep -q '"tools"' || fail "path-secret auth form failed"
  pass "path-secret auth form"
fi

echo "SMOKE TEST PASSED: $BASE_URL"
