param(
  [string]$Region = "us-east-2",
  [string]$SecretId = "robinhood/chatgpt-app/config"
)

$ErrorActionPreference = "Stop"

$aws = Get-Command aws2 -ErrorAction SilentlyContinue
if (-not $aws) {
  $aws = Get-Command aws -ErrorAction SilentlyContinue
}

if (-not $aws) {
  throw "Neither aws2 nor aws was found in PATH"
}

Write-Host "Starting AWS browser login. If prompted, paste the authorization code shown by AWS."
& $aws.Source login --remote --region $Region --no-cli-pager

if ($LASTEXITCODE -ne 0) {
  throw "AWS login failed."
}

Write-Host "Verifying AWS identity."
& $aws.Source sts get-caller-identity --region $Region --no-cli-pager

if ($LASTEXITCODE -ne 0) {
  throw "AWS identity check failed after login."
}

Write-Host "Syncing Robinhood ChatGPT app secrets to AWS Secrets Manager."
& (Join-Path $PSScriptRoot "sync-chatgpt-app-secrets.ps1") -Aws -Region $Region -SecretId $SecretId
