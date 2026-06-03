# Session Log - Initial Setup

## What was configured

### Claude Code

Installed the Claude CLI and added both Robinhood MCP servers at user scope:

```powershell
npm install -g @anthropic-ai/claude-code
claude mcp add robinhood-banking --transport http --scope user https://banking-agent.robinhood.com/mcp/banking
claude mcp add robinhood-trading --transport http --scope user https://agent.robinhood.com/mcp/trading
```

### Codex

Added both Robinhood MCP servers to `~/.codex/config.toml` and authenticated with OAuth:

```powershell
codex mcp login robinhood-banking
codex mcp login robinhood-trading
codex mcp list --json
```

Expected authenticated status:

- `robinhood-banking`: `o_auth`
- `robinhood-trading`: `o_auth`

Operational helpers added:

- `scripts/install-robinhood-mcp.ps1`
- `scripts/test-codex-robinhood-startup.ps1`

## Endpoint Discovery

The correct MCP URLs are:

- Banking: `https://banking-agent.robinhood.com/mcp/banking`
- Trading: `https://agent.robinhood.com/mcp/trading`

The trading endpoint must use the `agent.robinhood.com` host. Using the banking host for trading can produce an OAuth protected-resource mismatch.

## Tools Verified

Banking tools:

- `banking_get_agent_card_balance`
- `banking_get_agent_card_creds`
- `banking_get_agent_card_policy`
- `banking_get_agent_card_status`
- `banking_get_agent_card_transactions`
- `banking_submit_feedback`
- `banking_wait_for_agent_card_approval`

Trading tools:

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

## Sensitive Data Rule

Do not record card status, card credentials, card limits, account numbers, balances, positions, buying power, transaction history, or order history in this public repository.

## Key Local Files

| File | Purpose |
|------|---------|
| `~/.claude.json` | Claude Code user-scope MCP server entries |
| `~/.claude/.credentials.json` | Claude OAuth tokens; never commit |
| `~/.codex/config.toml` | Codex MCP server entries |
| `~/.codex/.credentials.json` | Codex OAuth tokens; never commit |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `/mcp` does not show new Claude servers | Use `--scope user`, then restart Claude Code. |
| `localhost` redirect fails during OAuth | Expected in some desktop flows. Copy the full callback URL including `?code=...` and paste it back into the client. |
| OAuth mismatch error on trading | Remove stale credential entries for the wrong trading URL and use `https://agent.robinhood.com/mcp/trading`. |
| Codex tools do not appear in the current thread | Verify both servers show `o_auth`, then start a fresh Codex session so the tool list initializes. |
