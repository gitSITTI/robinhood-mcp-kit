# Robinhood MCP Kit

Dedicated repo for Robinhood MCP setup notes, client config templates, and secret-management helpers for the `gitSITTI` workspace.

## MCP Servers

| Name | URL | Status |
|------|-----|--------|
| `robinhood-banking` | `https://banking-agent.robinhood.com/mcp/banking` | ✅ Live — authenticated |
| `robinhood-trading` | `https://agent.robinhood.com/mcp/trading` | ⏳ Endpoint live, OAuth pending Robinhood fix |

### Banking tools (authenticated)
- `banking_get_agent_card_balance`
- `banking_get_agent_card_creds`
- `banking_get_agent_card_policy`
- `banking_get_agent_card_status`
- `banking_get_agent_card_transactions`
- `banking_submit_feedback`
- `banking_wait_for_agent_card_approval`

### Trading tools
- Available once Robinhood resolves the OAuth protected resource metadata mismatch

## What this repo contains

- `docs/SETUP.md`: platform setup instructions
- `docs/SECRETS.md`: what is and is not a secret for this integration
- `configs/`: client-side MCP config examples (Claude Code, Claude Desktop, Codex, Cursor)
- `scripts/`: PowerShell helpers for Cloudflare and AWS secret storage
- `.env.example`: placeholder environment variables

## Claude Code setup (already applied to this workspace)

```powershell
claude mcp add robinhood-banking --transport http --scope user https://banking-agent.robinhood.com/mcp/banking
claude mcp add robinhood-trading --transport http --scope user https://agent.robinhood.com/mcp/trading
```

Authentication is done via OAuth — Claude Code starts the flow automatically on first use.
