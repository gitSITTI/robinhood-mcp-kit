# Session Log - Initial Setup

## Current Summary

This repo now tracks the reusable Robinhood MCP setup for Codex, Claude,
Cursor, ChatGPT Apps, Cloudflare, and future AWS secret storage.

### GitHub

- Repo: `gitSITTI/robinhood-mcp-kit`
- Branch: `main`
- Purpose: sanitized operational scripts, MCP config templates, ChatGPT app
  bridge code, secret-sync helpers, and repeatable Robinhood analysis skills.

### Cloudflare ChatGPT App Bridge

- Worker: `robinhood-chatgpt-app`
- MCP endpoint: `https://robinhood-chatgpt-app.edgar-sosa553.workers.dev/mcp`
- Active secret layer: Cloudflare Worker secrets.
- Central secret-store target: Cloudflare account-level
  `default_secrets_store`.
- AWS target: `robinhood/chatgpt-app/config` in `us-east-2`, pending local AWS
  login.

Remote MCP smoke tests verified:

- `tools/list` returns the bridge tools.
- `run_no_trade_audit` completes without placing orders.
- Crypto quote/prep flow can validate USDC buy spread before any order is
  placed.

Known limitation:

- Robinhood upstream MCP currently exposes accounts, portfolio, positions,
  quotes, and equity orders through the available trading tools, but not
  dividend/transfer history. Broker-confirmed ETF income still requires
  Robinhood activity, statements, or a local actual-income validation CSV.

### Local Secret Source Of Truth

The canonical untracked local secret bundle is outside the repo:

```text
C:\Users\edsos\.robinhood\source-of-truth\robinhood-secrets-source-of-truth.json
C:\Users\edsos\.robinhood\source-of-truth\robinhood-secrets-source-of-truth.env
```

Regenerate after OAuth refresh, crypto API-key rotation, or app-secret
rotation:

```powershell
.\scripts\export-local-secret-source-of-truth.ps1
```

### ETF Income Calculator

Added a reusable workflow for estimating ETF distribution income from purchase
lots and validating it against broker-confirmed activity/balance data.

Primary command:

```powershell
.\scripts\calculate-etf-distribution-income.ps1 `
  -Lots .\my-joint-account-lots.local.csv `
  -ActualIncome .\my-joint-account-income.local.csv `
  -OutputDir .\reports\joint-etf-income `
  -AsOf 2026-06-05 `
  -ValidationTolerance 0.05 `
  -FailOnValidationMismatch `
  -Refresh
```

Important files:

- `scripts/calculate-etf-distribution-income.py`
- `scripts/calculate-etf-distribution-income.ps1`
- `docs/ETF_INCOME_CALCULATOR.md`
- `skills/etf-income-calculator/SKILL.md`
- `examples/etf-lots.example.csv`
- `examples/etf-actual-income.example.csv`

The calculator writes:

- `etf-income-summary.csv` - one row per lot.
- `etf-income-payments.csv` - one row per eligible distribution.
- `etf-income-validation.csv` - estimated vs actual income variance by symbol
  and total, when `-ActualIncome` is provided.

Validation behavior:

- Matching actual income passes.
- Mismatched actual income exits with code `2` when
  `-FailOnValidationMismatch` is enabled.
- Generated reports, cache files, and `*.local.csv` are ignored by git.

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
