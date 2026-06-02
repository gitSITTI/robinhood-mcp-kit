# Robinhood MCP Kit

This repo is a dedicated place to store Robinhood Banking MCP setup notes, client config templates, and secret-management helpers for the `gitSITTI` workspace.

## Source

The MCP endpoint and setup flow in this repo were pulled from Robinhood's Agentic Credit Card help article:

- MCP URL: `https://banking-agent.robinhood.com/mcp/banking`
- Server name: `robinhood-banking`

## What this repo contains

- `docs/SETUP.md`: platform setup instructions
- `docs/SECRETS.md`: what is and is not a secret for this integration
- `configs/`: client-side MCP config examples
- `scripts/`: PowerShell helpers for Cloudflare and AWS secret storage
- `.env.example`: placeholder environment variables

## Important constraint

Based on the Robinhood article, this integration uses an interactive authentication flow. No Robinhood API key or static token is documented in the source article. That means:

- The MCP URL is configuration, not a secret.
- The Robinhood login/auth session is handled during MCP connect/authenticate.
- Only optional wrapper app secrets you create around this MCP should be stored in Cloudflare or AWS.

## Suggested repo name on GitHub

`gitSITTI/robinhood-mcp-kit`

## Suggested first steps

1. Create the GitHub repo.
2. Push this folder as its own git repository.
3. Store only optional wrapper secrets in Cloudflare/AWS.
4. Add the MCP URL to the client you want to use.
