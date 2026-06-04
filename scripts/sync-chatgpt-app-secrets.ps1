param(
  [switch]$Cloudflare,
  [switch]$Aws,
  [string]$WorkerName = "robinhood-chatgpt-app",
  [string]$Region = "us-east-2",
  [string]$SecretId = "robinhood/chatgpt-app/config",
  [string]$KeyDirectory = "$HOME\.robinhood\crypto-api-keys",
  [string]$CodexCredentialPath = "$HOME\.codex\.credentials.json"
)

$ErrorActionPreference = "Stop"

function Get-RobinhoodMcpAccessToken {
  if (-not (Test-Path -LiteralPath $CodexCredentialPath)) {
    return $null
  }

  $json = Get-Content -LiteralPath $CodexCredentialPath -Raw | ConvertFrom-Json
  foreach ($property in $json.PSObject.Properties) {
    $value = $property.Value
    if ($value.server_url -eq "https://agent.robinhood.com/mcp/trading" -and $value.access_token) {
      return $value.access_token
    }
  }
  return $null
}

function Read-KeyJson($Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Missing key file: $Path"
  }
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function New-SecretPayload {
  $readKey = Read-KeyJson (Join-Path $KeyDirectory "read-robinhood-crypto-2026.json")
  $tradeKey = Read-KeyJson (Join-Path $KeyDirectory "trade-robinhood-crypto-2026.json")
  $mcpToken = Get-RobinhoodMcpAccessToken

  $appSecretPath = Join-Path $KeyDirectory "chatgpt-app-shared-secret.txt"
  if (Test-Path -LiteralPath $appSecretPath) {
    $appSecret = (Get-Content -LiteralPath $appSecretPath -Raw).Trim()
  } else {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
      $rng.GetBytes($bytes)
    } finally {
      $rng.Dispose()
    }
    $appSecret = [Convert]::ToBase64String($bytes)
    Set-Content -LiteralPath $appSecretPath -Value $appSecret -Encoding UTF8
  }

  return [ordered]@{
    ROBINHOOD_MCP_TRADING_URL = "https://agent.robinhood.com/mcp/trading"
    ROBINHOOD_MCP_TRADING_ACCESS_TOKEN = $mcpToken
    ROBINHOOD_CRYPTO_API_BASE = "https://trading.robinhood.com"
    ROBINHOOD_CRYPTO_READ_API_KEY = $readKey.robinhood_api_key
    ROBINHOOD_CRYPTO_READ_PRIVATE_KEY_BASE64 = $readKey.private_key_base64
    ROBINHOOD_CRYPTO_TRADE_API_KEY = $tradeKey.robinhood_api_key
    ROBINHOOD_CRYPTO_TRADE_PRIVATE_KEY_BASE64 = $tradeKey.private_key_base64
    APP_SHARED_SECRET = $appSecret
  }
}

function Set-CloudflareSecret($Name, $Value) {
  if (-not $Value) {
    Write-Warning "Skipping $Name because it is empty"
    return
  }
  $wrangler = Get-Command wrangler -ErrorAction SilentlyContinue
  if (-not $wrangler) {
    throw "wrangler was not found in PATH"
  }
  $Value | & $wrangler.Source secret put $Name --name $WorkerName
}

function Set-AwsSecret($Payload) {
  $aws = Get-Command aws2 -ErrorAction SilentlyContinue
  if (-not $aws) {
    $aws = Get-Command aws -ErrorAction SilentlyContinue
  }
  if (-not $aws) {
    throw "Neither aws2 nor aws was found in PATH"
  }

  $secretString = $Payload | ConvertTo-Json -Compress
  & $aws.Source secretsmanager create-secret --region $Region --name $SecretId --secret-string $secretString
  if ($LASTEXITCODE -ne 0) {
    & $aws.Source secretsmanager put-secret-value --region $Region --secret-id $SecretId --secret-string $secretString
    if ($LASTEXITCODE -ne 0) {
      throw "AWS Secrets Manager sync failed. Check AWS credentials and region."
    }
  }
}

if (-not $Cloudflare -and -not $Aws) {
  throw "Specify -Cloudflare, -Aws, or both."
}

$payload = New-SecretPayload

if ($Cloudflare) {
  foreach ($entry in $payload.GetEnumerator()) {
    Set-CloudflareSecret $entry.Key $entry.Value
  }
}

if ($Aws) {
  Set-AwsSecret $payload
}

Write-Host "Secret sync complete. No secret values were printed."
