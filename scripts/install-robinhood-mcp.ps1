param(
  [ValidateSet("Codex", "Claude", "Both")]
  [string]$Client = "Both",

  [switch]$Login,
  [switch]$SkipList
)

$ErrorActionPreference = "Stop"

$servers = @(
  @{ Name = "robinhood-banking"; Url = "https://banking-agent.robinhood.com/mcp/banking" },
  @{ Name = "robinhood-trading"; Url = "https://agent.robinhood.com/mcp/trading" }
)

function Get-RequiredCommand($Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "$Name was not found in PATH"
  }
  return $cmd.Source
}

function Install-CodexMcp {
  $codex = Get-RequiredCommand "codex"

  foreach ($server in $servers) {
    & $codex mcp add $server.Name --url $server.Url 2>$null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Codex MCP '$($server.Name)' may already exist; continuing."
    }

    if ($Login) {
      & $codex mcp login $server.Name
    }
  }

  if (-not $SkipList) {
    & $codex mcp list --json
  }
}

function Install-ClaudeMcp {
  $claude = Get-RequiredCommand "claude"

  foreach ($server in $servers) {
    & $claude mcp add $server.Name --transport http --scope user $server.Url 2>$null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Claude MCP '$($server.Name)' may already exist; continuing."
    }
  }

  if (-not $SkipList) {
    & $claude mcp list
  }
}

if ($Client -in @("Codex", "Both")) {
  Install-CodexMcp
}

if ($Client -in @("Claude", "Both")) {
  Install-ClaudeMcp
}

Write-Host "Robinhood MCP install complete. Start a fresh client session after login so tools initialize."
