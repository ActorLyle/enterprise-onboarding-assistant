$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$env:PORT = '3000'
Set-Location $projectRoot
& node.exe (Join-Path $PSScriptRoot 'server-manager.mjs') start
if ($LASTEXITCODE -ne 0) {
    Add-Content -LiteralPath (Join-Path $projectRoot '.runtime\autostart.log') -Value "$(Get-Date -Format o) start failed with exit code $LASTEXITCODE"
}
