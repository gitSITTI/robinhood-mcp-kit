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

## Tools available

| Tool | When to use |
|------|-------------|
| `banking_get_agent_card_status` | Card active? Frozen? Any issues? |
| `banking_get_agent_card_balance` | Balance, monthly limit, spend so far |
| `banking_get_agent_card_policy` | Monthly cap and approval settings |
| `banking_get_agent_card_creds` | Card number, CVV, expiry for checkout |
| `banking_get_agent_card_transactions` | Spending history on the agentic card |
| `banking_wait_for_agent_card_approval` | Wait for user to approve a pending purchase |
| `banking_submit_feedback` | Report an issue or submit feedback to Robinhood |

## Workflows

### Check card health
Call `banking_get_agent_card_status` and `banking_get_agent_card_balance`
together. Translate the raw fields into plain language:
- `cardStatus: NORMAL` → card is active and usable
- `monthlyLimit` is in microdollars — divide by 1,000,000 for dollars
- Negative `cash` in balance means the card has an outstanding balance

### Make a purchase
The agentic card is designed for the agent to complete purchases at checkout.
When the user asks you to buy something:
1. Confirm the item and price with the user before fetching credentials
2. Call `banking_get_agent_card_creds` to get the card number, CVV, and expiry
3. Use those details at checkout — do not display them unnecessarily
4. If the card policy requires per-purchase approval, call
   `banking_wait_for_agent_card_approval` and tell the user to approve in
   the Robinhood app before proceeding

### Review spending
Call `banking_get_agent_card_transactions` for the agentic card's transaction
history. Present as a clean table: date, merchant, amount. Convert microdollar
amounts to dollars.

### Handle an approval prompt
If a purchase is pending approval, call `banking_wait_for_agent_card_approval`
and tell the user: "I'm waiting for you to approve this purchase in the
Robinhood Banking app." Keep the user informed while waiting.

## Authentication

The `robinhood-banking` MCP requires OAuth. In a fresh session it will prompt
for re-auth. If you get an auth error or the tools are unavailable:
1. Call `mcp__robinhood-banking__authenticate` to start the OAuth flow
2. Give the user the authorization URL
3. After they authorize, the browser redirects to `localhost:PORT/callback?code=...`
   — the page will error, but the URL is valid. Have them paste it back and call
   `mcp__robinhood-banking__complete_authentication` with the full URL.

## Display conventions
- Always convert microdollar values (divide by 1,000,000) before showing the user
- Mask card credentials — show only what's needed at the moment of checkout
- When the card is at or near its monthly limit, proactively mention it
- If `cardStatus` is anything other than NORMAL, warn the user before attempting a purchase
