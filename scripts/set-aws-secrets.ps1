param(
  [Parameter(Mandatory = $true)]
  [string]$Region,

  [Parameter(Mandatory = $true)]
  [string]$SecretId,

  [string]$ClientId,
  [string]$ClientSecret,
  [string]$SessionEncryptionKey
)

$aws = Get-Command aws2 -ErrorAction SilentlyContinue
if (-not $aws) {
  $aws = Get-Command aws -ErrorAction SilentlyContinue
}

if (-not $aws) {
  throw "Neither aws2 nor aws was found in PATH"
}

$payload = @{
  ROBINHOOD_MCP_CLIENT_ID = $ClientId
  ROBINHOOD_MCP_CLIENT_SECRET = $ClientSecret
  ROBINHOOD_MCP_SESSION_ENCRYPTION_KEY = $SessionEncryptionKey
} | ConvertTo-Json -Compress

& $aws.Source secretsmanager create-secret --region $Region --name $SecretId --secret-string $payload

if ($LASTEXITCODE -ne 0) {
  & $aws.Source secretsmanager put-secret-value --region $Region --secret-id $SecretId --secret-string $payload
}
