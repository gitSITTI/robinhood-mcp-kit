# Secrets

## What is NOT a secret

Safe to keep in docs and checked-in config:

- MCP server names (`robinhood-banking`, `robinhood-trading`)
- MCP URLs (`https://banking-agent.robinhood.com/mcp/banking`, `https://agent.robinhood.com/mcp/trading`)
- OAuth client IDs (`LtLiNmbs9owbYfWgBlC68Z2X-claude` for banking, `LtLiNmbs9owbYfWgBlC68Z2V-claude` for trading)

## What IS a secret

These live in `~/.claude/.credentials.json` and are managed automatically by Claude Code — do not commit them:

- OAuth access tokens
- OAuth refresh tokens
- PKCE code verifiers / challenges

## What may be a secret (wrapper infrastructure only)

Only relevant if you build your own proxy or Cloudflare Worker around these MCPs:

- `ROBINHOOD_MCP_CLIENT_ID`
- `ROBINHOOD_MCP_CLIENT_SECRET`
- `ROBINHOOD_MCP_SESSION_ENCRYPTION_KEY`

Store those in Cloudflare secrets or AWS Secrets Manager (`robinhood/mcp/config`).
Use the scripts in `scripts/` for that.

## Credential storage location

Claude Code stores OAuth tokens at:
```
~/.claude/.credentials.json
```

Format (per server):
```json
{
  "mcpOAuth": {
    "<server-name>|<hash>": {
      "serverUrl": "...",
      "accessToken": "...",
      "refreshToken": "...",
      "clientId": "...",
      "expiresAt": 0,
      "scope": "..."
    }
  }
}
```

If you need to force a re-auth, delete the entry for that server from this file
and restart Claude Code.
