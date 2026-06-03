param(
  [string]$CredentialPath = "$HOME\.codex\.credentials.json"
)

$ErrorActionPreference = "Stop"

$targets = @(
  @{ Name = "robinhood-banking"; Url = "https://banking-agent.robinhood.com/mcp/banking" },
  @{ Name = "robinhood-trading"; Url = "https://agent.robinhood.com/mcp/trading" }
)

function Get-CredentialEntries($Value, [System.Collections.ArrayList]$Out) {
  if ($null -eq $Value) {
    return
  }

  if ($Value -is [System.Array]) {
    foreach ($item in $Value) {
      Get-CredentialEntries $item $Out
    }
    return
  }

  if ($Value -isnot [pscustomobject] -and $Value -isnot [System.Collections.IDictionary]) {
    return
  }

  if ($Value -is [System.Collections.IDictionary] -or $Value.PSObject.Properties.Count -gt 0) {
    $serverUrl = $Value.server_url
    $accessToken = $Value.access_token

    if ($serverUrl -and $accessToken) {
      [void]$Out.Add($Value)
    }

    foreach ($property in $Value.PSObject.Properties) {
      Get-CredentialEntries $property.Value $Out
    }
  }
}

function Convert-McpResponse($Content) {
  $text = [string]$Content
  $trimmed = $text.Trim()

  if ($trimmed.StartsWith("{")) {
    return $trimmed | ConvertFrom-Json
  }

  $dataLine = ($trimmed -split "`r?`n" | Where-Object { $_.StartsWith("data: ") } | Select-Object -First 1)
  if (-not $dataLine) {
    throw "No JSON-RPC data line in MCP response"
  }

  return $dataLine.Substring(6) | ConvertFrom-Json
}

if (-not (Test-Path -LiteralPath $CredentialPath)) {
  throw "Codex credential file not found at $CredentialPath"
}

$credentialJson = Get-Content -LiteralPath $CredentialPath -Raw | ConvertFrom-Json
$entries = [System.Collections.ArrayList]::new()
Get-CredentialEntries $credentialJson $entries

foreach ($target in $targets) {
  $entry = $entries | Where-Object { $_.server_url -eq $target.Url } | Select-Object -First 1
  if (-not $entry) {
    throw "Missing Codex OAuth credential for $($target.Name). Run: codex mcp login $($target.Name)"
  }

  $headers = @{
    Authorization = "Bearer $($entry.access_token)"
    "Content-Type" = "application/json"
    Accept = "application/json, text/event-stream"
    "MCP-Protocol-Version" = "2025-03-26"
  }

  $initBody = @{
    jsonrpc = "2.0"
    id = 1
    method = "initialize"
    params = @{
      protocolVersion = "2025-03-26"
      capabilities = @{}
      clientInfo = @{
        name = "codex-startup-check"
        version = "1.0.0"
      }
    }
  } | ConvertTo-Json -Depth 10

  $toolsBody = @{
    jsonrpc = "2.0"
    id = 2
    method = "tools/list"
    params = @{}
  } | ConvertTo-Json -Depth 10

  $initRaw = Invoke-WebRequest -Uri $target.Url -Method Post -Headers $headers -Body $initBody -UseBasicParsing
  $toolsRaw = Invoke-WebRequest -Uri $target.Url -Method Post -Headers $headers -Body $toolsBody -UseBasicParsing

  $init = Convert-McpResponse $initRaw.Content
  $tools = Convert-McpResponse $toolsRaw.Content
  $toolNames = ($tools.result.tools | ForEach-Object { $_.name }) -join ", "

  Write-Host "$($target.Name): initialized $($init.result.serverInfo.name); tools=$($tools.result.tools.Count); $toolNames"
}
