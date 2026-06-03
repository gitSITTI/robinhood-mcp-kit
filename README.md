# Robinhood MCP Kit

Dedicated repo for Robinhood MCP setup notes, client config templates, and secret-management helpers for the `gitSITTI` workspace.

## MCP Servers

| Name | URL | Scope | Status |
|------|-----|-------|--------|
| `robinhood-banking` | `https://banking-agent.robinhood.com/mcp/banking` | `credit-card` | Configured |
| `robinhood-trading` | `https://agent.robinhood.com/mcp/trading` | Robinhood-enabled account access | Configured |

## Tools

### Banking

- `banking_get_agent_card_balance`
- `banking_get_agent_card_creds`
- `banking_get_agent_card_policy`
- `banking_get_agent_card_status`
- `banking_get_agent_card_transactions`
- `banking_submit_feedback`
- `banking_wait_for_agent_card_approval`

### Trading

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

## What this repo contains

- `docs/SETUP.md` - platform setup instructions for Claude Code, Desktop, Codex, Cursor, and ChatGPT
- `docs/SECRETS.md` - what is and is not a secret, plus credential storage locations
- `docs/SESSION-LOG.md` - sanitized setup session notes and troubleshooting
- `configs/` - client-side MCP config examples
- `scripts/` - PowerShell helpers for Cloudflare and AWS secret storage
- `.env.example` - placeholder environment variables

## Quick Start: Codex

Add both MCP servers, authenticate them, then start a fresh Codex session so the MCP tool list initializes from the updated config.

```powershell
codex mcp add robinhood-banking --url https://banking-agent.robinhood.com/mcp/banking
codex mcp add robinhood-trading --url https://agent.robinhood.com/mcp/trading
codex mcp login robinhood-banking
codex mcp login robinhood-trading
codex mcp list --json
```

For Desktop config, use `configs/codex/robinhood-mcp.toml`.

## Quick Start: Claude Code

```powershell
npm install -g @anthropic-ai/claude-code

claude mcp add robinhood-banking --transport http --scope user https://banking-agent.robinhood.com/mcp/banking
claude mcp add robinhood-trading --transport http --scope user https://agent.robinhood.com/mcp/trading
```

Then authenticate each server. Claude starts the OAuth flow automatically on first use.
See `docs/SETUP.md` for full instructions and `docs/SESSION-LOG.md` for troubleshooting.
