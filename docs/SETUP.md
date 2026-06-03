# Setup

## MCP Servers

| Name | URL | Scope | Status |
|------|-----|-------|--------|
| `robinhood-banking` | `https://banking-agent.robinhood.com/mcp/banking` | `credit-card` | Configured |
| `robinhood-trading` | `https://agent.robinhood.com/mcp/trading` | Robinhood-enabled account access | Configured |

## Claude Code

```powershell
npm install -g @anthropic-ai/claude-code

claude mcp add robinhood-banking --transport http --scope user https://banking-agent.robinhood.com/mcp/banking
claude mcp add robinhood-trading --transport http --scope user https://agent.robinhood.com/mcp/trading
```

Use `--scope user`, not the default local scope, so the servers are available across Claude Code sessions.

### Claude Authentication

Claude Code starts the OAuth flow automatically when the server is first used. The flow redirects to `http://localhost:<PORT>/callback`. A browser connection error on that URL can be expected; copy the full URL from the address bar, including `?code=...&state=...`, and paste it back into Claude Code when prompted.

## Claude Desktop

1. Open `Settings -> Connectors -> Add custom connector`.
2. Add `https://banking-agent.robinhood.com/mcp/banking`.
3. Repeat for `https://agent.robinhood.com/mcp/trading`.

## Codex Desktop

Add the entries from `configs/codex/robinhood-mcp.toml` to `~/.codex/config.toml`, then authenticate both servers from the Codex CLI.

```toml
[mcp_servers.robinhood-banking]
url = "https://banking-agent.robinhood.com/mcp/banking"
enabled = true
startup_timeout_sec = 30
tool_timeout_sec = 60

[mcp_servers.robinhood-trading]
url = "https://agent.robinhood.com/mcp/trading"
enabled = true
startup_timeout_sec = 30
tool_timeout_sec = 60
```

## Codex CLI

```powershell
codex mcp add robinhood-banking --url https://banking-agent.robinhood.com/mcp/banking
codex mcp add robinhood-trading --url https://agent.robinhood.com/mcp/trading
codex mcp login robinhood-banking
codex mcp login robinhood-trading
codex mcp list --json
```

The expected authenticated status is `o_auth` for both servers. Start a fresh Codex session after login so the MCP tool list initializes from the updated config.

## Cursor

Use `configs/cursor/mcp.json`.

## ChatGPT

1. Enable Developer Mode.
2. Open `Settings -> Apps -> Create app`.
3. Add `https://banking-agent.robinhood.com/mcp/banking`.
4. Repeat for `https://agent.robinhood.com/mcp/trading`.

## Notes

- Card creation and initial banking agent auth may require a desktop browser.
- If connecting on mobile, copy the onboarding URL and open it in a desktop browser.
- The trading MCP requires Robinhood-side account eligibility.
- Do not document account numbers, balances, card limits, positions, transactions, or order history in this public repo.
