---
name: robinhood-banking
description: >
  Robinhood Agentic Credit Card skill — use whenever the user mentions their
  Robinhood card, agentic card, card balance, card credentials, card spending,
  card transactions, monthly limit, purchase approval, or wants to use their
  Robinhood card to pay for something. Handles all robinhood-banking MCP
  operations: checking card status and balance, fetching card credentials for
  checkout, reviewing transaction history, managing purchase approvals, and
  inspecting card policy. Always use this skill instead of calling the
  robinhood-banking MCP tools directly.
---

# Robinhood Banking — Agentic Credit Card

You have access to the `robinhood-banking` MCP server. Use it to manage the
user's Robinhood Agentic Credit Card on their behalf.

## Card Summary (as of Jun 2, 2026)
- Status: Active (Normal)
- Monthly limit: $110.00
- Spent this month: $0.00
- Card type: Agentic virtual card linked to Robinhood Gold Card

## Tools

| Tool | When to use |
|------|-------------|
| `banking_get_agent_card_status` | Card active? Frozen? Any issues? |
| `banking_get_agent_card_balance` | Balance, monthly limit, spend so far |
| `banking_get_agent_card_policy` | Monthly cap and approval settings |
| `banking_get_agent_card_creds` | Card number, CVV, expiry for checkout |
| `banking_get_agent_card_transactions` | Spending history on the agentic card |
| `banking_wait_for_agent_card_approval` | Wait for user to approve a pending purchase |
| `banking_submit_feedback` | Report an issue or submit feedback |

## Workflows

### Check card health
Call `banking_get_agent_card_status` + `banking_get_agent_card_balance` together.
- `cardStatus: NORMAL` → active and usable
- `monthlyLimit` in microdollars — divide by 1,000,000
- Negative cash = outstanding balance

### Make a purchase
1. Confirm item and price with user
2. Call `banking_get_agent_card_creds` for card number, CVV, expiry
3. Use at checkout — don't display unnecessarily
4. If policy requires approval → call `banking_wait_for_agent_card_approval`

### Review spending
Call `banking_get_agent_card_transactions`. Present as table: date, merchant, amount (convert microdollars).

## Authentication
The MCP requires OAuth per session. If tools are unavailable:
1. Call `mcp__robinhood-banking__authenticate` to start OAuth flow
2. Give user the authorization URL
3. After they authorize, browser redirects to `localhost:PORT/callback?code=...` — page will error, that's expected
4. Have them copy the full URL and call `mcp__robinhood-banking__complete_authentication`

## Display Conventions
- Always convert microdollars (÷ 1,000,000) before showing user
- Mask card credentials — show only at moment of checkout
- Warn if near monthly limit
- Warn if `cardStatus` is not NORMAL before attempting purchase
