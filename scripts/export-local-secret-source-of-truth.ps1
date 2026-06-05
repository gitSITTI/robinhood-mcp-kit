param(
  [string]$OutputDirectory = "$HOME\.robinhood\source-of-truth",
  [string]$CryptoKeyDirectory = "$HOME\.robinhood\crypto-api-keys",
  [string]$CodexCredentialPath = "$HOME\.codex\.credentials.json"
)

$ErrorActionPreference = "Stop"

$python = @'
import json
import os
import sys
from pathlib import Path
from datetime import datetime, timezone

output_dir = Path(sys.argv[1])
crypto_dir = Path(sys.argv[2])
codex_credentials_path = Path(sys.argv[3])
output_dir.mkdir(parents=True, exist_ok=True)

def load_json(path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8-sig"))

def find_codex_robinhood_entries():
    data = load_json(codex_credentials_path) or {}
    out = {}
    for key, value in data.items():
        if not isinstance(value, dict):
            continue
        name = value.get("server_name")
        if name in {"robinhood-banking", "robinhood-trading"}:
            out[name] = {
                "credential_key": key,
                "server_name": value.get("server_name"),
                "server_url": value.get("server_url"),
                "client_id": value.get("client_id"),
                "access_token": value.get("access_token"),
                "refresh_token": value.get("refresh_token"),
                "expires_at": value.get("expires_at"),
                "scopes": value.get("scopes"),
            }
    return out

read_crypto = load_json(crypto_dir / "read-robinhood-crypto-2026.json") or {}
trade_crypto = load_json(crypto_dir / "trade-robinhood-crypto-2026.json") or {}
app_secret_path = crypto_dir / "chatgpt-app-shared-secret.txt"
app_secret = app_secret_path.read_text(encoding="utf-8-sig").strip() if app_secret_path.exists() else None

bundle = {
    "schema_version": 1,
    "generated_at_utc": datetime.now(timezone.utc).isoformat(),
    "warning": "LOCAL SECRET SOURCE OF TRUTH. Do not commit, paste, screenshot, or share this file.",
    "local_paths": {
        "source_of_truth_json": str(output_dir / "robinhood-secrets-source-of-truth.json"),
        "source_of_truth_env": str(output_dir / "robinhood-secrets-source-of-truth.env"),
        "codex_credentials": str(codex_credentials_path),
        "crypto_key_directory": str(crypto_dir),
    },
    "cloudflare": {
        "account_id": "d1ef200da61cc67c8c6399fc3b8ff5d8",
        "secrets_store": {
            "name": "default_secrets_store",
            "id": "7ae62c5113a54d2b8858a1333ff995ef",
        },
        "worker": {
            "name": "robinhood-chatgpt-app",
            "url": "https://robinhood-chatgpt-app.edgar-sosa553.workers.dev",
            "mcp_url": "https://robinhood-chatgpt-app.edgar-sosa553.workers.dev/mcp",
        },
    },
    "aws": {
        "status": "pending_login",
        "region": "us-east-2",
        "secret_id": "robinhood/chatgpt-app/config",
    },
    "robinhood_mcp": find_codex_robinhood_entries(),
    "robinhood_crypto": {
        "read": {
            "credential_name": read_crypto.get("credential_name", "READ Robinhood Crypto 2026"),
            "api_key": read_crypto.get("robinhood_api_key"),
            "public_key_base64": read_crypto.get("public_key_base64"),
            "private_key_base64": read_crypto.get("private_key_base64"),
            "intended_actions": read_crypto.get("intended_actions"),
        },
        "trade": {
            "credential_name": trade_crypto.get("credential_name", "TRADE Robinhood Crypto 2026"),
            "api_key": trade_crypto.get("robinhood_api_key"),
            "public_key_base64": trade_crypto.get("public_key_base64"),
            "private_key_base64": trade_crypto.get("private_key_base64"),
            "intended_actions": trade_crypto.get("intended_actions"),
        },
    },
    "chatgpt_app": {
        "app_shared_secret": app_secret,
        "worker_secret_names": [
            "ROBINHOOD_MCP_TRADING_URL",
            "ROBINHOOD_MCP_TRADING_ACCESS_TOKEN",
            "ROBINHOOD_CRYPTO_API_BASE",
            "ROBINHOOD_CRYPTO_READ_API_KEY",
            "ROBINHOOD_CRYPTO_READ_PRIVATE_KEY_BASE64",
            "ROBINHOOD_CRYPTO_TRADE_API_KEY",
            "ROBINHOOD_CRYPTO_TRADE_PRIVATE_KEY_BASE64",
            "APP_SHARED_SECRET",
        ],
    },
}

json_path = output_dir / "robinhood-secrets-source-of-truth.json"
env_path = output_dir / "robinhood-secrets-source-of-truth.env"
json_path.write_text(json.dumps(bundle, indent=2) + "\n", encoding="utf-8")

def env_line(name, value):
    value = "" if value is None else str(value)
    escaped = value.replace("`", "``").replace('"', '`"')
    return f'{name}="{escaped}"'

env_lines = [
    "# LOCAL SECRET SOURCE OF TRUTH. Do not commit or share.",
    env_line("ROBINHOOD_MCP_TRADING_URL", bundle["robinhood_mcp"].get("robinhood-trading", {}).get("server_url")),
    env_line("ROBINHOOD_MCP_TRADING_ACCESS_TOKEN", bundle["robinhood_mcp"].get("robinhood-trading", {}).get("access_token")),
    env_line("ROBINHOOD_MCP_TRADING_REFRESH_TOKEN", bundle["robinhood_mcp"].get("robinhood-trading", {}).get("refresh_token")),
    env_line("ROBINHOOD_MCP_BANKING_URL", bundle["robinhood_mcp"].get("robinhood-banking", {}).get("server_url")),
    env_line("ROBINHOOD_MCP_BANKING_ACCESS_TOKEN", bundle["robinhood_mcp"].get("robinhood-banking", {}).get("access_token")),
    env_line("ROBINHOOD_MCP_BANKING_REFRESH_TOKEN", bundle["robinhood_mcp"].get("robinhood-banking", {}).get("refresh_token")),
    env_line("ROBINHOOD_CRYPTO_API_BASE", "https://trading.robinhood.com"),
    env_line("ROBINHOOD_CRYPTO_READ_API_KEY", read_crypto.get("robinhood_api_key")),
    env_line("ROBINHOOD_CRYPTO_READ_PUBLIC_KEY_BASE64", read_crypto.get("public_key_base64")),
    env_line("ROBINHOOD_CRYPTO_READ_PRIVATE_KEY_BASE64", read_crypto.get("private_key_base64")),
    env_line("ROBINHOOD_CRYPTO_TRADE_API_KEY", trade_crypto.get("robinhood_api_key")),
    env_line("ROBINHOOD_CRYPTO_TRADE_PUBLIC_KEY_BASE64", trade_crypto.get("public_key_base64")),
    env_line("ROBINHOOD_CRYPTO_TRADE_PRIVATE_KEY_BASE64", trade_crypto.get("private_key_base64")),
    env_line("APP_SHARED_SECRET", app_secret),
    env_line("CLOUDFLARE_ACCOUNT_ID", bundle["cloudflare"]["account_id"]),
    env_line("CLOUDFLARE_SECRETS_STORE_ID", bundle["cloudflare"]["secrets_store"]["id"]),
    env_line("CLOUDFLARE_SECRETS_STORE_NAME", bundle["cloudflare"]["secrets_store"]["name"]),
    env_line("CLOUDFLARE_WORKER_NAME", bundle["cloudflare"]["worker"]["name"]),
    env_line("CLOUDFLARE_WORKER_MCP_URL", bundle["cloudflare"]["worker"]["mcp_url"]),
    env_line("AWS_REGION", bundle["aws"]["region"]),
    env_line("AWS_SECRET_ID", bundle["aws"]["secret_id"]),
]
env_path.write_text("\n".join(env_lines) + "\n", encoding="utf-8")

print(json.dumps({
    "json_path": str(json_path),
    "env_path": str(env_path),
    "mcp_entries": sorted(bundle["robinhood_mcp"].keys()),
    "read_crypto_api_key_present": bool(read_crypto.get("robinhood_api_key")),
    "trade_crypto_api_key_present": bool(trade_crypto.get("robinhood_api_key")),
    "app_shared_secret_present": bool(app_secret),
}, indent=2))
'@

$temp = New-TemporaryFile
try {
  Set-Content -LiteralPath $temp -Value $python -Encoding UTF8
  python $temp $OutputDirectory $CryptoKeyDirectory $CodexCredentialPath
} finally {
  Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
}

$user = "$env:USERDOMAIN\$env:USERNAME"
icacls $OutputDirectory /inheritance:r | Out-Null
icacls $OutputDirectory /grant:r "${user}:(OI)(CI)F" | Out-Null

Write-Host "Local secret source of truth exported. Do not commit files from $OutputDirectory."
