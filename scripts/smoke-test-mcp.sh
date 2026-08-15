#!/usr/bin/env bash
# Smoke test the deployed Robinhood ChatGPT MCP Worker.
#
# Verifies (no live Robinhood credentials required):
#   1. GET /                 -> ok payload, serverInfo.version matches --expect-version
#   2. GET /widget           -> HTML with the Guardrail Console title
#   3. POST /mcp initialize  -> result.serverInfo.version matches --expect-version
#   4. POST /mcp tools/list  -> tool catalog contains the P0 v0.2.0 tools
#                               (cancel_equity_order, get_crypto_holdings)
#   5. Optional: if MCP_REQUIRE_AUTH is enabled on the Worker and
#      --shared-secret is passed, the same POST is rejected without the
#      Bearer header and accepted with it.
#
# Usage:
#   scripts/smoke-test-mcp.sh \
#     --url https://robinhood-chatgpt-app.<subdomain>.workers.dev \
#     --expect-version 0.2.0 \
#     [--shared-secret <APP_SHARED_SECRET>]   # only if MCP_REQUIRE_AUTH=true
#
# Exits non-zero on the first failing check. Prints a green PASS or red FAIL
# per check on stdout. Reads no secrets from the environment unless you set
# APP_SHARED_SECRET explicitly.

set -euo pipefail

URL=""
EXPECT_VERSION="0.2.0"
SHARED_SECRET="${APP_SHARED_SECRET:-}"

usage() {
  sed -n '2,25p' "$0"
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    --expect-version) EXPECT_VERSION="$2"; shift 2 ;;
    --shared-secret) SHARED_SECRET="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown argument: $1" >&2; usage ;;
  esac
done

if [[ -z "$URL" ]]; then
  echo "Missing --url" >&2
  usage
fi

URL="${URL%/}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required (install jq)." >&2
  exit 2
fi

GREEN=$'\033[32m'
RED=$'\033[31m'
DIM=$'\033[2m'
RESET=$'\033[0m'
FAIL_COUNT=0

pass() { printf "%s\n" "  ${GREEN}PASS${RESET} $*"; }
fail() { printf "%s\n" "  ${RED}FAIL${RESET} $*"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
step() { printf "%s\n" "${DIM}==>${RESET} $*"; }

request() {
  # $1 method, $2 url, $3 optional body, $4 optional bearer
  local method="$1" target="$2" body="${3:-}" bearer="${4:-}"
  local args=(-sS -o /tmp/smoke-body.$$ -w "%{http_code}" -X "$method")
  args+=(-H "Content-Type: application/json")
  args+=(-H "Accept: application/json, text/event-stream")
  args+=(-H "MCP-Protocol-Version: 2025-03-26")
  if [[ -n "$bearer" ]]; then
    args+=(-H "Authorization: Bearer $bearer")
  fi
  if [[ -n "$body" ]]; then
    args+=(--data "$body")
  fi
  args+=("$target")
  local status
  status=$(curl "${args[@]}" 2>/dev/null || echo 000)
  printf "%s" "$status"
}

# 1. Root health
step "GET $URL/"
status=$(request GET "$URL/")
if [[ "$status" == "200" ]]; then
  version=$(jq -r '.serverInfo.version // empty' /tmp/smoke-body.$$)
  if [[ "$version" == "$EXPECT_VERSION" ]]; then
    pass "root serverInfo.version=$version"
  else
    fail "root serverInfo.version=$version (expected $EXPECT_VERSION)"
  fi
else
  fail "root returned HTTP $status"
fi

# 2. Widget
step "GET $URL/widget"
status=$(request GET "$URL/widget")
if [[ "$status" == "200" ]] && grep -q "Robinhood Guardrail Console" /tmp/smoke-body.$$; then
  pass "widget renders"
else
  fail "widget failed (status=$status)"
fi

# 3. initialize
step "POST $URL/mcp initialize"
status=$(request POST "$URL/mcp" '{"jsonrpc":"2.0","id":1,"method":"initialize"}' "$SHARED_SECRET")
if [[ "$status" == "200" ]]; then
  version=$(jq -r '.result.serverInfo.version // empty' /tmp/smoke-body.$$)
  if [[ "$version" == "$EXPECT_VERSION" ]]; then
    pass "initialize serverInfo.version=$version"
  else
    fail "initialize serverInfo.version=$version (expected $EXPECT_VERSION)"
  fi
else
  fail "initialize returned HTTP $status"
fi

# 4. tools/list
step "POST $URL/mcp tools/list"
status=$(request POST "$URL/mcp" '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' "$SHARED_SECRET")
if [[ "$status" == "200" ]]; then
  missing=""
  for tool in cancel_equity_order get_crypto_holdings prepare_agentic_equity_order place_confirmed_crypto_market_buy; do
    if ! jq -e --arg t "$tool" '.result.tools[] | select(.name==$t)' /tmp/smoke-body.$$ >/dev/null; then
      missing="$missing $tool"
    fi
  done
  if [[ -z "$missing" ]]; then
    pass "tools/list contains all expected P0 tools"
  else
    fail "tools/list missing:$missing"
  fi
else
  fail "tools/list returned HTTP $status"
fi

# 5. Optional auth check (only when a shared secret is provided)
if [[ -n "$SHARED_SECRET" ]]; then
  step "POST $URL/mcp initialize without Authorization (auth check)"
  # Deliberately omit bearer even if secret is set.
  status=$(request POST "$URL/mcp" '{"jsonrpc":"2.0","id":3,"method":"initialize"}')
  if [[ "$status" == "401" ]]; then
    pass "unauthenticated request rejected (MCP_REQUIRE_AUTH=true)"
  elif [[ "$status" == "200" ]]; then
    printf "%s\n" "  ${DIM}SKIP${RESET} MCP_REQUIRE_AUTH is off on the deployment (200 is expected in that mode)"
  else
    fail "unexpected HTTP $status for unauthenticated initialize"
  fi
fi

rm -f /tmp/smoke-body.$$

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  printf "\n%s%d check(s) failed.%s\n" "$RED" "$FAIL_COUNT" "$RESET"
  exit 1
fi

printf "\n%sAll smoke checks passed.%s\n" "$GREEN" "$RESET"
