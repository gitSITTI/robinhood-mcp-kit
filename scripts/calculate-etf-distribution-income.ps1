param(
  [Parameter(Mandatory=$true)]
  [string]$Lots,
  [string]$OutputDir = "reports/etf-income",
  [string]$AsOf,
  [string]$Distributions,
  [switch]$Refresh
)

$ErrorActionPreference = "Stop"

$argsList = @(
  "$PSScriptRoot\calculate-etf-distribution-income.py",
  "--lots", $Lots,
  "--output-dir", $OutputDir
)

if ($AsOf) {
  $argsList += @("--as-of", $AsOf)
}

if ($Distributions) {
  $argsList += @("--distributions", $Distributions)
}

if ($Refresh) {
  $argsList += "--refresh"
}

python @argsList
