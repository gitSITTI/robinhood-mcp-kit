# Secrets

## What is not a secret

These values are safe to keep in docs or checked-in config:

- `robinhood-banking`
- `https://banking-agent.robinhood.com/mcp/banking`

## What may be a secret

The Robinhood article does not publish a static API token, API key, or client secret for this MCP. Do not invent one. Only store secrets if you create wrapper infrastructure around the MCP, for example:

- `ROBINHOOD_MCP_CLIENT_ID`
- `ROBINHOOD_MCP_CLIENT_SECRET`
- `ROBINHOOD_MCP_SESSION_ENCRYPTION_KEY`
- Any OAuth callback or session secret used by your own proxy or Worker

## Cloudflare recommendation

Use Cloudflare secrets only for values required by your own Cloudflare Worker or edge proxy. Example names:

- `ROBINHOOD_MCP_CLIENT_ID`
- `ROBINHOOD_MCP_CLIENT_SECRET`
- `ROBINHOOD_MCP_SESSION_ENCRYPTION_KEY`

Do not store the MCP URL as a secret unless you want one uniform config path. It is not sensitive.

## AWS recommendation

Use AWS Secrets Manager or SSM Parameter Store for the same optional wrapper secrets. Suggested secret id:

- `robinhood/mcp/config`

Keep non-sensitive values in checked-in config when possible, and reserve secret stores for credentials only.
