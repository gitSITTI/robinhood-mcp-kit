#!/usr/bin/env bash
# SessionStart hook for Claude Code on the web.
#
# Goal: make `npm run check` (the Worker type-check CI gates on) work the instant
# a cloud session opens, without a human running install steps.
#
# Must be fast and non-fatal: a failure here should not block the session, so we
# never `exit 1`. Output is informational.
set -uo pipefail

echo "[session-start] robinhood-mcp-kit: installing chatgpt-app dependencies…"

if command -v npm >/dev/null 2>&1; then
  if [ -f chatgpt-app/package-lock.json ]; then
    if ( cd chatgpt-app && npm ci --silent ) >/dev/null 2>&1; then
      echo "[session-start] Worker deps installed (npm ci in chatgpt-app/)."
    else
      echo "[session-start] WARN: npm ci failed (offline?). Run 'cd chatgpt-app && npm ci' manually."
    fi
  else
    echo "[session-start] WARN: chatgpt-app/package-lock.json not found."
  fi
else
  echo "[session-start] WARN: npm not found on PATH."
fi

echo "[session-start] Quick check: 'cd chatgpt-app && npm run check'."
exit 0
