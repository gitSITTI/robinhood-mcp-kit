param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("read", "trade")]
  [string]$Key,

  [Parameter(Mandatory = $true)]
  [string]$ApiKey,

  [string]$KeyDirectory = "$HOME\.robinhood\crypto-api-keys"
)

$ErrorActionPreference = "Stop"

if ($ApiKey -notmatch "^rh-api-[0-9a-fA-F-]+$") {
  Write-Warning "API key does not match the current rh-api-* format. Older Robinhood keys may still work."
}

$fileName = if ($Key -eq "read") {
  "read-robinhood-crypto-2026.json"
} else {
  "trade-robinhood-crypto-2026.json"
}

$path = Join-Path $KeyDirectory $fileName
if (-not (Test-Path -LiteralPath $path)) {
  throw "Key file not found: $path"
}

$json = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
$json.robinhood_api_key = $ApiKey
$json | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $path -Encoding UTF8

Write-Host "Stored Robinhood API key for '$Key' credential at $path"
Write-Host "Do not commit or share this file."
