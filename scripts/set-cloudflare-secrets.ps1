param(
  [Parameter(Mandatory = $true)]
  [string]$WorkerName,

  [string]$ClientId,
  [string]$ClientSecret,
  [string]$SessionEncryptionKey
)

$wrangler = Get-Command wrangler -ErrorAction SilentlyContinue

if (-not $wrangler) {
  throw "wrangler was not found in PATH"
}

if ($ClientId) {
  $ClientId | & $wrangler.Source secret put ROBINHOOD_MCP_CLIENT_ID --name $WorkerName
}

if ($ClientSecret) {
  $ClientSecret | & $wrangler.Source secret put ROBINHOOD_MCP_CLIENT_SECRET --name $WorkerName
}

if ($SessionEncryptionKey) {
  $SessionEncryptionKey | & $wrangler.Source secret put ROBINHOOD_MCP_SESSION_ENCRYPTION_KEY --name $WorkerName
}
