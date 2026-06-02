param(
  [string]$RemoteUrl = "git@github.com:gitSITTI/robinhood-mcp-kit.git"
)

git init
git checkout -b main
git add .
git commit -m "Initial Robinhood MCP kit scaffold"
git remote add origin $RemoteUrl
