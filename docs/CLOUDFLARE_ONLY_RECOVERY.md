# Cloudflare-Only Recovery

AWS is optional until local AWS login is available. Cloudflare is currently the
working secret store and deployed runtime for the Robinhood ChatGPT app bridge.

## Worker

```text
https://robinhood-chatgpt-app.edgar-sosa553.workers.dev
```

MCP endpoint:

```text
https://robinhood-chatgpt-app.edgar-sosa553.workers.dev/mcp
```

## Refresh Cloudflare Secrets

From the repo root:

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'
.\scripts\sync-chatgpt-app-secrets.ps1 -Cloudflare -WorkerName robinhood-chatgpt-app
```

This reads local Codex Robinhood MCP OAuth credentials and local Robinhood
Crypto API key files, then writes Worker secrets. It does not print secret
values.

## Redeploy

```powershell
cd chatgpt-app
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'
npm run check
npm run deploy
```

## Connect Clients

Codex config:

```toml
[mcp_servers.robinhood-chatgpt-app]
url = "https://robinhood-chatgpt-app.edgar-sosa553.workers.dev/mcp"
enabled = true
startup_timeout_sec = 30
tool_timeout_sec = 60
```

Claude/Cursor custom connector URL:

```text
https://robinhood-chatgpt-app.edgar-sosa553.workers.dev/mcp
```

## AWS Later

When AWS login works, run:

```powershell
.\scripts\aws-login-and-sync-chatgpt-app-secrets.ps1 -Region us-east-2 -SecretId robinhood/chatgpt-app/config
```
