param(
  [ValidateSet("read", "trade")]
  [string]$Key = "read",

  [int]$IntervalSeconds = 10,
  [int]$TimeoutSeconds = 300,
  [string]$KeyDirectory = "$HOME\.robinhood\crypto-api-keys"
)

$ErrorActionPreference = "Stop"

$fileName = if ($Key -eq "read") {
  "read-robinhood-crypto-2026.json"
} else {
  "trade-robinhood-crypto-2026.json"
}

$path = Join-Path $KeyDirectory $fileName
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

while ((Get-Date) -lt $deadline) {
  if (Test-Path -LiteralPath $path) {
    $json = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if ($json.robinhood_api_key) {
      Write-Host "API key found for '$Key'. Running read-only crypto API checks."
      & (Join-Path $PSScriptRoot "test-robinhood-crypto-api.ps1") -Key $Key -KeyDirectory $KeyDirectory
      exit $LASTEXITCODE
    }
  }

  Write-Host "Waiting for Robinhood-issued API key in $path"
  Start-Sleep -Seconds $IntervalSeconds
}

throw "Timed out waiting for Robinhood-issued API key in $path"
