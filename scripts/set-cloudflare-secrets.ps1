param(
  [Parameter(Mandatory = $true)]
  [string]$WorkerName,

  [string]$ClientId,
  [string]$ClientSecret,
  [string]$SessionEncryptionKey
)

$wrangler = "C:\Users\edsos\AppData\Roaming\npm\wrangler.cmd"

if (-not (Test-Path $wrangler)) {
  throw "wrangler.cmd was not found at $wrangler"
}

if ($ClientId) {
  $ClientId | & $wrangler secret put ROBINHOOD_MCP_CLIENT_ID --name $WorkerName
}

if ($ClientSecret) {
  $ClientSecret | & $wrangler secret put ROBINHOOD_MCP_CLIENT_SECRET --name $WorkerName
}

if ($SessionEncryptionKey) {
  $SessionEncryptionKey | & $wrangler secret put ROBINHOOD_MCP_SESSION_ENCRYPTION_KEY --name $WorkerName
}
