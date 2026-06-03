# Setup

## MCP Servers

| Name | URL |
|------|-----|
| `robinhood-banking` | `https://banking-agent.robinhood.com/mcp/banking` |
| `robinhood-trading` | `https://agent.robinhood.com/mcp/trading` |

---

## Claude Code (recommended — already applied to this workspace)

```powershell
claude mcp add robinhood-banking --transport http --scope user https://banking-agent.robinhood.com/mcp/banking
claude mcp add robinhood-trading --transport http --scope user https://agent.robinhood.com/mcp/trading
```

> Note: Use `--scope user` so the servers appear across all projects, not just the local one.
> Authentication is OAuth — Claude starts the flow automatically. When the localhost redirect fails,
> copy the full `localhost:PORT/callback?code=...` URL from the browser address bar and pass it
> to `complete_authentication`.

## Claude Desktop

1. Open `Settings → Connectors → Add custom connector`
2. Add `https://banking-agent.robinhood.com/mcp/banking`
3. Repeat for `https://agent.robinhood.com/mcp/trading`

## Codex (GUI)

1. Open `Settings → MCP servers`
2. Select `Streamable HTTP`
3. Add `https://banking-agent.robinhood.com/mcp/banking`
4. Repeat for `https://agent.robinhood.com/mcp/trading`

## Codex CLI

```powershell
codex mcp add robinhood-banking --url https://banking-agent.robinhood.com/mcp/banking
codex mcp add robinhood-trading --url https://agent.robinhood.com/mcp/trading
```

## Cursor

Use `configs/cursor/mcp.json` — contains both servers.

## ChatGPT

1. Turn on Developer Mode
2. Open `Settings → Apps → Create app`
3. Add `https://banking-agent.robinhood.com/mcp/banking`
4. Repeat for `https://agent.robinhood.com/mcp/trading`

## Authentication notes

- Card creation and initial agent authentication must be done on desktop.
- If connecting on mobile, copy the onboarding URL and open it in a desktop browser.
- The localhost OAuth redirect will show a connection error — this is expected. Copy the full
  URL from the address bar (including `?code=...`) and pass it back to `complete_authentication`.
