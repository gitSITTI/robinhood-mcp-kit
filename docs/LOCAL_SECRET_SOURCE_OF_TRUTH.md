# Local Secret Source Of Truth

The local secret source-of-truth bundle lives outside the repo:

```text
C:\Users\edsos\.robinhood\source-of-truth\robinhood-secrets-source-of-truth.json
C:\Users\edsos\.robinhood\source-of-truth\robinhood-secrets-source-of-truth.env
```

These files contain real secrets. Do not commit, paste, screenshot, or share
them.

Regenerate them after any Robinhood OAuth refresh, crypto API key change, or
Cloudflare app-secret rotation:

```powershell
.\scripts\export-local-secret-source-of-truth.ps1
```

Use this local bundle as the one source for:

- Cloudflare Worker secrets.
- Cloudflare account-level Secrets Store migration.
- AWS Secrets Manager once AWS login works.
- Cursor, Claude, Codex, GitHub Actions, and other repo integrations.

Current central metadata:

- Cloudflare Worker: `robinhood-chatgpt-app`
- Cloudflare Worker MCP URL: `https://robinhood-chatgpt-app.edgar-sosa553.workers.dev/mcp`
- Cloudflare Secrets Store: `default_secrets_store`
- Cloudflare Secrets Store ID: `7ae62c5113a54d2b8858a1333ff995ef`
- AWS planned secret: `robinhood/chatgpt-app/config` in `us-east-2`
