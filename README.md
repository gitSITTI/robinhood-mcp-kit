# Robinhood MCP Kit

Dedicated repo for Robinhood MCP setup notes, client config templates, and secret-management helpers for the `gitSITTI` workspace.

## MCP Servers

| Name | URL | Status |
|------|-----|--------|
| `robinhood-banking` | `https://banking-agent.robinhood.com/mcp/banking` | ✅ Live — authenticated |

> Note: A `/mcp/trading` endpoint was probed and found to exist (HTTP 405) but has a server-side OAuth misconfiguration and is not officially documented by Robinhood. Removed from config until Robinhood publishes it.

### Banking tools (authenticated)
- `banking_get_agent_card_balance`
- `banking_get_agent_card_creds`
- `banking_get_agent_card_policy`
- `banking_get_agent_card_status`
- `banking_get_agent_card_transactions`
- `banking_submit_feedback`
- `banking_wait_for_agent_card_approval`

## What this repo contains

- `docs/SETUP.md`: platform setup instructions
- `docs/SECRETS.md`: what is and is not a secret for this integration
- `configs/`: client-side MCP config examples (Claude Code, Claude Desktop, Codex, Cursor)
- `scripts/`: PowerShell helpers for Cloudflare and AWS secret storage
- `.env.example`: placeholder environment variables

## Claude Code setup (already applied to this workspace)

```powershell
claude mcp add robinhood-banking --transport http --scope user https://banking-agent.robinhood.com/mcp/banking
```

Authentication is done via OAuth — Claude Code starts the flow automatically on first use.
