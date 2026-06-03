---
name: robinhood-trading
description: >
  Robinhood equity trading skill - use whenever the user asks about their
  portfolio, stock positions, buying or selling stocks, equity orders, stock
  quotes, account value, buying power, holdings, placing trades, checking order
  status, canceling orders, or looking up a stock. Handles all
  robinhood-trading MCP operations.
---

# Robinhood Trading - Equity Accounts

Use the `robinhood-trading` MCP server to manage brokerage account lookups,
positions, equity quotes, and equity order workflows.

## Accounts

Call `get_accounts` first when the target `account_number` is unknown. For
agent-placed trades, use an account with `agentic_allowed: true` unless the user
explicitly specifies otherwise. Mask account numbers to last 4 digits when
displaying them, but pass the full account number to MCP tools.

## Tools Available

| Tool | When to use |
|------|-------------|
| `get_accounts` | List accounts and find account numbers |
| `get_portfolio` | Total value, buying power, asset breakdown |
| `get_equity_positions` | Open positions: symbol, quantity, cost basis |
| `get_equity_quotes` | Real-time price, bid/ask, change for symbols |
| `get_equity_tradability` | Whether a symbol can be traded now |
| `get_equity_orders` | Recent and open orders |
| `review_equity_order` | Preview an order before placing |
| `place_equity_order` | Execute a trade after explicit user confirmation |
| `cancel_equity_order` | Cancel a pending order after confirmation |
| `search` | Find stocks by name or ticker |

## Workflows

### Portfolio Overview

1. Call `get_accounts` to select the right account.
2. Call `get_portfolio` for total value and buying power.
3. Call `get_equity_positions` for individual holdings.
4. Present a clean summary with total value, buying power, and positions.

### Get A Quote

Call `get_equity_quotes` with the requested symbol or symbols. If the user gave
a company name rather than a ticker, call `search` first.

### Place A Trade

Placing a real order requires explicit user confirmation. Always follow this
sequence:

1. Call `get_equity_tradability` to confirm the symbol is tradable.
2. Call `get_equity_quotes` to show the current price.
3. Call `review_equity_order` to preview quantity, estimated cost, and order type.
4. Show the review to the user and ask for explicit confirmation.
5. Only after confirmation, call `place_equity_order`.

Never skip the review and confirmation steps.

### Check Or Cancel Orders

- Call `get_equity_orders` to list recent orders and status.
- Call `cancel_equity_order` only for pending orders and only after user confirmation.

## Display Conventions

- Dollar amounts: always 2 decimal places with a dollar sign.
- Percentage changes: use `+` or `-`, 2 decimal places.
- Quantities: no trailing decimals for whole shares.
- Order types: translate tool values to plain English.
- Low buying power: flag proactively before reviewing an order.

## Buying Power Alerts

Common review response codes:

| Code | Meaning | Action |
|------|---------|--------|
| `EQUITY_NOT_ENOUGH_BP` | Insufficient funds in the chosen account | Tell the user the shortfall and suggest depositing or using a different account |
| `MARKET_CLOSED` | Market is closed for this order type | Suggest a limit order or waiting for market open |
| `NOT_TRADABLE` | Symbol cannot be traded now | Check `get_equity_tradability` for details |

Always surface these errors to the user. Do not silently skip or work around
trading restrictions.

## Important Limits

- Agentic cash accounts may not have margin; only buy up to available cash.
- Options trading requires `option_level`; check `get_accounts` before suggesting options.
- Futures are separate; this skill covers equities only.
