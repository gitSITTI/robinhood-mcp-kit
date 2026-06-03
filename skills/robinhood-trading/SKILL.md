---
name: robinhood-trading
description: >
  Robinhood equity trading skill — use whenever the user asks about their
  portfolio, stock positions, buying or selling stocks, equity orders, stock
  quotes, account value, buying power, holdings, placing trades, checking order
  status, canceling orders, or looking up a stock. Handles all
  robinhood-trading MCP operations. Use this skill for any trading or portfolio
  question, even if the user just says "how's my portfolio?" or "buy me some
  NVDA" or "what's AAPL at?" Always use this skill rather than calling the
  robinhood-trading MCP tools directly.
---

# Robinhood Trading — Equity Accounts

You have access to the `robinhood-trading` MCP server. Use it to manage the
user's brokerage accounts, view positions, get quotes, and place equity orders.

## Accounts (always fetch first if account_number is unknown)

Call `get_accounts` to list accounts. The user has three:

| Nickname | Type | Notes |
|----------|------|-------|
| *(default)* | Individual margin | Primary account — ••••1424 |
| "Agentic" | Individual cash | `agentic_allowed=true` — use for agent-placed trades |
| *(joint)* | Joint tenancy | ••••6839 |

**For agent-placed trades, always use the account with `agentic_allowed: true`
(the "Agentic" cash account) unless the user explicitly specifies otherwise.**
Mask account numbers to last 4 digits when displaying (e.g. ••••1424), but
pass the full number to tools.

## Tools available

| Tool | When to use |
|------|-------------|
| `get_accounts` | List accounts and find account numbers |
| `get_portfolio` | Total value, buying power, asset breakdown |
| `get_equity_positions` | Open positions — symbol, qty, cost basis |
| `get_equity_quotes` | Real-time price, bid/ask, change for one or more symbols |
| `get_equity_tradability` | Whether a symbol can be traded right now |
| `get_equity_orders` | Recent and open orders |
| `review_equity_order` | Preview an order before placing — ALWAYS call before place |
| `place_equity_order` | Execute a trade |
| `cancel_equity_order` | Cancel a pending order |
| `search` | Find stocks by name or ticker |

## Workflows

### Portfolio overview
1. `get_accounts` to get the default account number
2. `get_portfolio` for total value and buying power
3. `get_equity_positions` for individual holdings
Present a clean summary: total value, buying power, positions table (symbol,
shares, current value, gain/loss if available).

### Get a quote
Call `get_equity_quotes` with the symbol(s). Show price, change, and
change % in a readable format. If the user asked by company name rather than
ticker, call `search` first.

### Place a trade — safety-first flow
Placing a real order requires user confirmation. Always follow this sequence:

1. `get_equity_tradability` — confirm the symbol is tradable right now
2. `get_equity_quotes` — show the user the current price so they know what they're paying
3. `review_equity_order` — preview the order (quantity, estimated cost, order type)
4. **Show the review to the user and ask for explicit confirmation** — "Ready to place this order?"
5. Only after confirmation: `place_equity_order`

Never skip steps 3–4. The user is responsible for every trade; your job is to
make sure they see exactly what they're approving before it executes.

### Check or cancel orders
- `get_equity_orders` lists recent orders with status (filled, pending, cancelled)
- `cancel_equity_order` to cancel a pending order — confirm with the user first

### Search for a stock
Use `search` when the user gives a company name or partial ticker. Return the
top matches (symbol + company name) and let the user confirm before proceeding.

## Display conventions
- Dollar amounts: always 2 decimal places, with $ sign
- Percentage changes: use + or – sign, 2 decimal places (e.g. +1.23%)
- Quantities: no trailing decimals for whole shares (e.g. 10 not 10.0)
- Order types: translate to plain English (market order, limit order at $X)
- When buying power is low relative to a trade size, flag it proactively

## Buying power alerts

When placing orders, Robinhood may return error codes in the review response.
Common ones and what to do:

| Code | Meaning | Action |
|------|---------|--------|
| `EQUITY_NOT_ENOUGH_BP` | Insufficient funds in the chosen account | Tell user the shortfall amount, suggest depositing or using a different account |
| `MARKET_CLOSED` | Market is closed for this order type | Suggest a limit order or waiting for market open |
| `NOT_TRADABLE` | Symbol can't be traded right now | Check `get_equity_tradability` for details |

Always surface these to the user — never silently skip or work around them.

## Important limits
- The agentic cash account (••••0453) has no margin — only buy up to available cash
- Options trading requires `option_level` — check `get_accounts` before suggesting options
- Futures are separate (RHD) — this skill covers equities only
