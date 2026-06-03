---
name: robinhood-banking
description: >
  Robinhood Agentic Credit Card skill - use whenever the user mentions their
  Robinhood card, agentic card, card balance, card credentials, card spending,
  card transactions, monthly limit, purchase approval, or wants to use their
  Robinhood card to pay for something. Handles all robinhood-banking MCP
  operations.
---

# Robinhood Banking - Agentic Credit Card

Use the `robinhood-banking` MCP server to manage the user's Robinhood Agentic
Credit Card workflows.

## Tools Available

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

### Check Card Health

Call `banking_get_agent_card_status` and `banking_get_agent_card_balance`
together. Convert microdollar amounts to dollars before showing them.

### Make A Purchase

The agentic card can be used for checkout flows. Follow this sequence:

1. Confirm the item and price with the user before fetching credentials.
2. Call `banking_get_agent_card_creds` only when credentials are needed.
3. Use card details at checkout; do not display them unless necessary.
4. If policy requires approval, call `banking_wait_for_agent_card_approval` and tell the user to approve in the Robinhood app.

### Review Spending

Call `banking_get_agent_card_transactions` for transaction history. Present a
clean table with date, merchant, and amount. Convert microdollar amounts to
dollars.

### Handle An Approval Prompt

If a purchase is pending approval, call `banking_wait_for_agent_card_approval`
and tell the user you are waiting for approval in the Robinhood app.

## Authentication

The `robinhood-banking` MCP requires OAuth. In a fresh session it may prompt for
re-authentication. If you get an auth error or the tools are unavailable:

1. Start the MCP client's OAuth flow for `robinhood-banking`.
2. Open the authorization URL in a browser.
3. If the browser redirects to `localhost:PORT/callback?code=...`, copy the full callback URL back into the client when prompted.

## Display Conventions

- Always convert microdollar values by dividing by 1,000,000 before showing the user.
- Mask card credentials and show only what is needed at the moment of checkout.
- Mention when the card is near its monthly limit.
- If `cardStatus` is not `NORMAL`, warn the user before attempting a purchase.
