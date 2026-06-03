# Robinhood MCP Kit

Dedicated repo for Robinhood MCP setup notes, client config templates, and secret-management helpers for the `gitSITTI` workspace.

## MCP Servers

| Name | URL | Scope | Status |
|------|-----|-------|--------|
| `robinhood-banking` | `https://banking-agent.robinhood.com/mcp/banking` | `credit-card` | ✅ Authenticated |
| `robinhood-trading` | `https://agent.robinhood.com/mcp/trading` | `internal` | ✅ Authenticated |

### Banking tools
- `banking_get_agent_card_balance`
- `banking_get_agent_card_creds`
- `banking_get_agent_card_policy`
- `banking_get_agent_card_status`
- `banking_get_agent_card_transactions`
- `banking_submit_feedback`
- `banking_wait_for_agent_card_approval`

### Trading tools
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

- `docs/SETUP.md` — platform setup instructions for Claude Code, Desktop, Codex, Cursor, ChatGPT
- `docs/SECRETS.md` — what is and isn't a secret, credential storage location
- `docs/SESSION-LOG.md` — detailed log of the full setup session including issues and fixes
- `configs/` — client-side MCP config examples (Claude Code, Claude Desktop, Codex, Cursor)
- `scripts/` — PowerShell helpers for Cloudflare and AWS secret storage
- `.env.example` — placeholder environment variables

## Quick start (Claude Code)

```powershell
npm install -g @anthropic-ai/claude-code

claude mcp add robinhood-banking --transport http --scope user https://banking-agent.robinhood.com/mcp/banking
claude mcp add robinhood-trading --transport http --scope user https://agent.robinhood.com/mcp/trading
```

Then authenticate each server — Claude starts the OAuth flow automatically on first use.
See `docs/SETUP.md` for full instructions and `docs/SESSION-LOG.md` for troubleshooting.
