# Publish simplebeacon@1.0.0 to npm (requires npm login or NPM_TOKEN first).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Checking npm auth..." -ForegroundColor Cyan
try {
  $user = npm whoami 2>$null
  if (-not $user) { throw "not logged in" }
  Write-Host "Logged in as $user" -ForegroundColor Green
} catch {
  Write-Host @"

Not logged in to npm CLI. Website login at npmjs.com is separate.

Option A — interactive login (recommended):
  npm login
  npm whoami

Option B — granular publish token (bypass 2FA required):
  1. npmjs.com -> Access Tokens -> Granular -> check Bypass 2FA
  2. Edit C:\Users\Trevor\.npmrc (do NOT use npm config set inside this monorepo)
  3. Add line: //registry.npmjs.org/:_authToken=npm_...

Then re-run: .\publish.ps1
"@ -ForegroundColor Yellow
  exit 1
}

Write-Host "Running tests..." -ForegroundColor Cyan
npm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
Write-Host "Publishing simplebeacon@$version..." -ForegroundColor Cyan
npm publish --access public
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nPublished. Verify:" -ForegroundColor Green
Write-Host "  npm view simplebeacon version"
Write-Host "  https://www.npmjs.com/package/simplebeacon"
