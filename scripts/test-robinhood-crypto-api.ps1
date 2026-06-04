param(
  [ValidateSet("read", "trade")]
  [string]$Key = "read",

  [string]$KeyDirectory = "$HOME\.robinhood\crypto-api-keys"
)

$ErrorActionPreference = "Stop"

$fileName = if ($Key -eq "read") {
  "read-robinhood-crypto-2026.json"
} else {
  "trade-robinhood-crypto-2026.json"
}

$keyPath = Join-Path $KeyDirectory $fileName
if (-not (Test-Path -LiteralPath $keyPath)) {
  throw "Key file not found: $keyPath"
}

$python = @'
import base64
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization

key_path = Path(sys.argv[1])
data = json.loads(key_path.read_text(encoding="utf-8-sig"))

api_key = data.get("robinhood_api_key")
private_key_b64 = data.get("private_key_base64")

if not api_key:
    raise SystemExit(f"Missing robinhood_api_key in {key_path}")
if not private_key_b64:
    raise SystemExit(f"Missing private_key_base64 in {key_path}")

private_key = ed25519.Ed25519PrivateKey.from_private_bytes(base64.b64decode(private_key_b64))
host = "https://trading.robinhood.com"

checks = [
    ("v1_account", "GET", "/api/v1/crypto/trading/accounts/", ""),
    ("v1_pairs", "GET", "/api/v1/crypto/trading/trading_pairs/?symbol=BTC-USD", ""),
    ("v2_accounts", "GET", "/api/v2/crypto/trading/accounts/", ""),
]

def sign(method, path, body):
    timestamp = str(int(time.time()))
    message = f"{api_key}{timestamp}{path}{method}{body}"
    signature = private_key.sign(message.encode("utf-8"))
    return {
        "x-api-key": api_key,
        "x-timestamp": timestamp,
        "x-signature": base64.b64encode(signature).decode("ascii"),
        "Content-Type": "application/json; charset=utf-8",
    }

for name, method, path, body in checks:
    req = urllib.request.Request(
        host + path,
        data=None if method == "GET" else body.encode("utf-8"),
        method=method,
        headers=sign(method, path, body),
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            payload = response.read()
            parsed = json.loads(payload.decode("utf-8")) if payload else {}
            if isinstance(parsed, dict):
                keys = ",".join(sorted(parsed.keys())[:8])
                count = len(parsed.get("results", [])) if isinstance(parsed.get("results"), list) else ""
            else:
                keys = type(parsed).__name__
                count = ""
            print(f"{name}: ok status={response.status} keys={keys} results={count}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:240]
        print(f"{name}: http_error status={exc.code} detail={detail}")
    except Exception as exc:
        print(f"{name}: error {exc}")
'@

$temp = New-TemporaryFile
try {
  Set-Content -LiteralPath $temp -Value $python -Encoding UTF8
  python $temp $keyPath
} finally {
  Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
}
