# Setup

## Robinhood Banking MCP

- Server name: `robinhood-banking`
- MCP URL: `https://banking-agent.robinhood.com/mcp/banking`

## Platform setup from the Robinhood article

### Codex

1. Open `Settings -> MCP servers`
2. Select `Streamable HTTP`
3. Add `https://banking-agent.robinhood.com/mcp/banking`

### Codex CLI

```powershell
codex mcp add robinhood-banking --url https://banking-agent.robinhood.com/mcp/banking
```

Then open `/mcp` in Codex CLI and select `robinhood-banking`.

### Claude Code

```powershell
claude mcp add robinhood-banking --transport http https://banking-agent.robinhood.com/mcp/banking
```

Then open `/mcp` in Claude Code and authenticate.

### Claude Desktop

1. Open `Settings -> Connectors -> Add custom connector`
2. Add `https://banking-agent.robinhood.com/mcp/banking`

### ChatGPT

1. Turn on Developer Mode
2. Open `Settings -> Apps -> Create app`
3. Add `https://banking-agent.robinhood.com/mcp/banking`

### Cursor

Use the example in `configs/cursor/mcp.json`.

## Authentication notes

- Robinhood says card creation and agent authentication must be completed on desktop.
- The article describes an interactive authentication flow during MCP connect.
- If you connect on mobile, Robinhood says to copy the onboarding URL into a desktop browser.
