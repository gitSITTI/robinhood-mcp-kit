param(
  [Parameter(Mandatory=$true)]
  [string]$Lots,
  [string]$OutputDir = "reports/etf-income",
  [string]$AsOf,
  [string]$Distributions,
  [string]$ActualIncome,
  [decimal]$ValidationTolerance = 0.05,
  [switch]$FailOnValidationMismatch,
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

if ($ActualIncome) {
  $argsList += @("--actual-income", $ActualIncome)
  $argsList += @("--validation-tolerance", $ValidationTolerance.ToString([Globalization.CultureInfo]::InvariantCulture))
}

if ($FailOnValidationMismatch) {
  $argsList += "--fail-on-validation-mismatch"
}

if ($Refresh) {
  $argsList += "--refresh"
}

python @argsList
