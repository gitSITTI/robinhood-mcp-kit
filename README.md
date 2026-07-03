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
- `docs/CHATGPT_APP.md` - Cloudflare-hosted ChatGPT app bridge setup
- `docs/CLOUDFLARE_ONLY_RECOVERY.md` - Cloudflare-only recovery and reuse path while AWS login is unavailable
- `docs/LOCAL_SECRET_SOURCE_OF_TRUTH.md` - local untracked secret bundle location and regeneration command
- `configs/` - client-side MCP config examples
- `scripts/` - PowerShell helpers for MCP install/startup checks and Cloudflare/AWS secret storage
- `chatgpt-app/` - Cloudflare Worker MCP bridge for ChatGPT Apps
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

Or use the helper:

```powershell
.\scripts\install-robinhood-mcp.ps1 -Client Codex -Login
.\scripts\test-codex-robinhood-startup.ps1
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

## Operations & Planning

- `docs/runbooks/` — deploy the Worker, rotate secrets / refresh the OAuth
  token, enable inbound `/mcp` auth, and **AGENT_HANDOFF.md** (owner-only
  tasks written so any coding agent can execute them).
- `scripts/smoke-test-mcp.sh <worker-url> [secret]` — post-deploy health check.
- `BACKLOG.md` — ticket registry, mirrored to GitHub issues.
- `docs/EXPANSION.md` — Firebase / Cloudflare free tier / sosaclaw plan.
- Worker bridge tools (v0.2.0): `get_agentic_account`, `get_equity_quote`,
  `prepare_agentic_equity_order`, `place_confirmed_agentic_equity_order`,
  `cancel_equity_order`, `run_no_trade_audit`, `get_crypto_quote`,
  `get_crypto_holdings`, `prepare_crypto_market_buy`,
  `place_confirmed_crypto_market_buy`, `render_dashboard`.
