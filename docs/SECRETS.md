# Secrets

## What Is Not A Secret

Safe to keep in docs and checked-in config:

- MCP server names such as `robinhood-banking` and `robinhood-trading`
- MCP URLs:
  - `https://banking-agent.robinhood.com/mcp/banking`
  - `https://agent.robinhood.com/mcp/trading`
- OAuth client IDs published through official OAuth discovery metadata

## What Is A Secret

Never commit these:

- OAuth access tokens
- OAuth refresh tokens
- PKCE code verifiers and challenges
- Card numbers, CVV, expiration dates, or checkout credentials
- Account numbers, balances, positions, transactions, and order history

## Credential Storage Locations

Claude Code stores OAuth tokens at:

```text
~/.claude/.credentials.json
```

Codex stores OAuth tokens at:

```text
~/.codex/.credentials.json
```

If you need to force re-authentication, delete only the entry for the affected
server from the relevant credentials file and restart the MCP client.

## Optional Wrapper Infrastructure Secrets

Only relevant if you build a proxy or Cloudflare Worker around these MCPs:

- `ROBINHOOD_MCP_CLIENT_ID`
- `ROBINHOOD_MCP_CLIENT_SECRET`
- `ROBINHOOD_MCP_SESSION_ENCRYPTION_KEY`

Store wrapper secrets in Cloudflare secrets or AWS Secrets Manager. The default
AWS secret ID used by this repo is `robinhood/mcp/config`.
