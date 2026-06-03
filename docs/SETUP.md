# Setup

## MCP Servers

| Name | URL | Scope | Status |
|------|-----|-------|--------|
| `robinhood-banking` | `https://banking-agent.robinhood.com/mcp/banking` | `credit-card` | ✅ Authenticated |
| `robinhood-trading` | `https://agent.robinhood.com/mcp/trading` | `internal` | ✅ Authenticated |

---

## Claude Code (already applied to this workspace)

```powershell
# Install Claude CLI first if not already installed
npm install -g @anthropic-ai/claude-code

# Add both MCP servers at user scope (available across all projects)
claude mcp add robinhood-banking --transport http --scope user https://banking-agent.robinhood.com/mcp/banking
claude mcp add robinhood-trading --transport http --scope user https://agent.robinhood.com/mcp/trading
```

> **Important — use `--scope user`**, not the default `--scope local`.
> Local scope only applies to the directory you ran the command from.
> User scope makes the servers available in every Claude Code session.

### Authentication

Claude Code starts the OAuth flow automatically when the server is first used.
The flow redirects to `http://localhost:<PORT>/callback` which will show a
connection error in the browser — **this is expected**. Copy the full URL
from the address bar (including `?code=...&state=...`) and paste it back into
Claude Code when prompted.

---

## Claude Desktop

1. Open `Settings → Connectors → Add custom connector`
2. Add `https://banking-agent.robinhood.com/mcp/banking`
3. Repeat for `https://agent.robinhood.com/mcp/trading`

---

## Codex (GUI)

1. Open `Settings → MCP servers → Streamable HTTP`
2. Add `https://banking-agent.robinhood.com/mcp/banking`
3. Repeat for `https://agent.robinhood.com/mcp/trading`

## Codex CLI

```powershell
codex mcp add robinhood-banking --url https://banking-agent.robinhood.com/mcp/banking
codex mcp add robinhood-trading --url https://agent.robinhood.com/mcp/trading
```

---

## Cursor

Use `configs/cursor/mcp.json` — contains both servers.

---

## ChatGPT

1. Enable Developer Mode
2. `Settings → Apps → Create app`
3. Add `https://banking-agent.robinhood.com/mcp/banking`, repeat for trading

---

## Other notes

- Card creation and initial banking agent auth must be done on desktop.
- If connecting on mobile, copy the onboarding URL and open it in a desktop browser.
- The trading MCP uses `scope=internal` — your Robinhood account must have
  agentic trading enabled. Look for an account with `agentic_allowed: true`
  in `get_accounts`.
