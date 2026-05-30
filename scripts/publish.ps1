# Publish simplebeacon to npm (requires npm login as tjp88 + 2FA OTP)
# Usage: .\scripts\publish.ps1 -Otp 123456

param(
    [Parameter(Mandatory = $true)]
    [string]$Otp
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host 'Running pre-flight checks...'
npm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run pack:check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node bin/simplebeacon-mcp.js --smoke-test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Publishing to npm...'
npm publish --access public --otp=$Otp
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Post-publish smoke (run in a clean temp dir):'
Write-Host '  mkdir $env:TEMP\sb-test; cd $env:TEMP\sb-test'
Write-Host '  npm init -y'
Write-Host '  npm install -D simplebeacon'
Write-Host '  npx simplebeacon init --starter'
Write-Host '  npx simplebeacon-mcp --smoke-test'
