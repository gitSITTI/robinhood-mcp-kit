param(
  [Parameter(Mandatory = $true)]
  [string]$Region,

  [Parameter(Mandatory = $true)]
  [string]$SecretId,

  [string]$ClientId,
  [string]$ClientSecret,
  [string]$SessionEncryptionKey
)

$aws = "C:\Users\edsos\AppData\Roaming\Python\Python312\Scripts\aws.cmd"

if (-not (Test-Path $aws)) {
  throw "aws.cmd was not found at $aws"
}

$payload = @{
  ROBINHOOD_MCP_CLIENT_ID = $ClientId
  ROBINHOOD_MCP_CLIENT_SECRET = $ClientSecret
  ROBINHOOD_MCP_SESSION_ENCRYPTION_KEY = $SessionEncryptionKey
} | ConvertTo-Json -Compress

& $aws secretsmanager create-secret --region $Region --name $SecretId --secret-string $payload

if ($LASTEXITCODE -ne 0) {
  & $aws secretsmanager put-secret-value --region $Region --secret-id $SecretId --secret-string $payload
}
