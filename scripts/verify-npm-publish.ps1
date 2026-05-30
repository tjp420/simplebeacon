# Post-publish smoke test — run after npm publish succeeds
$ErrorActionPreference = 'Stop'

$testDir = Join-Path $env:TEMP ("sb-npm-verify-" + [guid]::NewGuid().ToString('n').Substring(0, 8))
New-Item -ItemType Directory -Path $testDir | Out-Null
Push-Location $testDir

try {
    Write-Host "Smoke test dir: $testDir"
    npm init -y | Out-Null
    npm install -D simplebeacon
    if ($LASTEXITCODE -ne 0) { throw 'npm install simplebeacon failed' }

    npx simplebeacon init --starter
    if ($LASTEXITCODE -ne 0) { throw 'init --starter failed' }

    npx simplebeacon-mcp --smoke-test
    if ($LASTEXITCODE -ne 0) { throw 'MCP smoke test failed' }

    $version = npm view simplebeacon version
    Write-Host "OK — simplebeacon@$version installed and smoke-tested."
}
finally {
    Pop-Location
    Remove-Item -Recurse -Force $testDir -ErrorAction SilentlyContinue
}
