# Session Log — Initial Setup

## What we did

### 1. Installed Claude CLI

```powershell
npm install -g @anthropic-ai/claude-code
# → v2.1.161
```

Claude CLI was not in the system PATH. Found Node.js v22.12.0 / npm 10.9.0 already installed.

---

### 2. Added `robinhood-banking` MCP

First attempt used the default `--scope local` (only applies to one directory):
```powershell
claude mcp add robinhood-banking --transport http https://banking-agent.robinhood.com/mcp/banking
```

Re-added at `--scope user` so it appears across all sessions:
```powershell
claude mcp remove robinhood-banking -s local
claude mcp add robinhood-banking --transport http --scope user https://banking-agent.robinhood.com/mcp/banking
```

---

### 3. Authenticated `robinhood-banking`

OAuth flow via `mcp__robinhood-banking__authenticate`. The localhost redirect fails
(expected on remote/desktop sessions) — copied the `localhost:PORT/callback?code=...`
URL from the browser address bar and passed it to `complete_authentication`.

**Banking tools unlocked:**
- `banking_get_agent_card_balance`
- `banking_get_agent_card_creds`
- `banking_get_agent_card_policy`
- `banking_get_agent_card_status`
- `banking_get_agent_card_transactions`
- `banking_submit_feedback`
- `banking_wait_for_agent_card_approval`

**Card status at time of setup:**
- Status: Active (Normal)
- Monthly limit: $110.00
- Spent this month: $0.00

---

### 4. Discovered `robinhood-trading` endpoint

Probed `banking-agent.robinhood.com` for additional MCP paths:

```
[405] https://banking-agent.robinhood.com/mcp/banking   ← known
[405] https://banking-agent.robinhood.com/mcp/trading   ← found
[404] https://banking-agent.robinhood.com/mcp/crypto
[404] https://banking-agent.robinhood.com/mcp/investing
... (all others 404)
```

HTTP 405 on GET = endpoint exists but requires POST (standard for MCP).

---

### 5. Fixed the trading URL

Initially added trading as `banking-agent.robinhood.com/mcp/trading` — same domain as banking.
This caused an OAuth protected resource mismatch error:

```
Protected resource https://agent.robinhood.com/mcp/trading does not match
expected https://banking-agent.robinhood.com/mcp/trading
```

Fetched OAuth discovery docs to find the canonical URL:

```
GET https://agent.robinhood.com/.well-known/oauth-protected-resource/mcp/trading
→ { "resource": "https://agent.robinhood.com/mcp/trading", "scopes_supported": ["internal"] }
```

Correct URL is `https://agent.robinhood.com/mcp/trading` (different subdomain).

```powershell
claude mcp remove robinhood-trading -s user
claude mcp add robinhood-trading --transport http --scope user https://agent.robinhood.com/mcp/trading
```

---

### 6. Cleared stale OAuth credentials

During URL correction, a stale credentials entry with the old URL was cached at
`~/.claude/.credentials.json` and kept being restored by Claude Code on each
auth attempt, causing repeated failures. Manually deleted the `robinhood-trading|*`
entry, then restarted Claude Code for a clean credential discovery pass.

After restart, credentials file showed the correct entry:
```json
"robinhood-trading|5cbe81c78ff5ae58": {
  "serverUrl": "https://agent.robinhood.com/mcp/trading",
  "discoveryState": {
    "authorizationServerUrl": "https://agent.robinhood.com/mcp/trading",
    "resourceMetadataUrl": "https://agent.robinhood.com/.well-known/oauth-protected-resource/mcp/trading"
  }
}
```

---

### 7. Authenticated `robinhood-trading`

Same OAuth flow. Scope is `internal` — requires agentic trading to be enabled on
the account. Auth succeeded.

**Trading tools unlocked:**
- `get_accounts`
- `get_portfolio`
- `get_equity_positions`
- `get_equity_quotes`
- `get_equity_tradability`
- `get_equity_orders`
- `place_equity_order`
- `review_equity_order`
- `cancel_equity_order`
- `search`

---

### 8. Verified account data

```
Accounts found:
  ••••1424  individual / margin        default
  ••••6839  joint_tenancy_with_ros
  ••••0453  individual / cash          agentic_allowed=true  nickname="Agentic"

Portfolio (••••1424):
  Total value:   $5,407.31
  Equities:     $12,358.29
  Options:        $278.00
  Crypto:         $100.21
  Cash:         -$7,329.19
  Buying power:  $5,941.79
```

---

## Key files modified

| File | What changed |
|------|-------------|
| `~/.claude.json` | Added `robinhood-banking` and `robinhood-trading` to `mcpServers` at user scope |
| `~/.claude/.credentials.json` | OAuth tokens written by Claude Code after each successful auth |
| `~/.claude/.mcp.json` | Untouched — only contains plugin-managed servers |

## Troubleshooting notes

| Problem | Fix |
|---------|-----|
| `/mcp` doesn't show new servers | Must use `--scope user`, not default `--scope local`. Restart Claude Code after adding. |
| `localhost` redirect fails during OAuth | Expected. Copy full URL from browser address bar including `?code=...` and pass to `complete_authentication`. |
| OAuth mismatch error on trading | Stale credential with old URL cached in `~/.claude/.credentials.json`. Delete the `robinhood-trading\|*` entry and restart. |
| Trading tools not appearing after auth | Banking token had also expired — both MCPs needed re-auth after the credential file was cleared. |
