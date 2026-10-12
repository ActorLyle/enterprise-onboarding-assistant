param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$shortcutName = 'Codex-Onboarding-Assistant-Local-3000.lnk'
$startup = [Environment]::GetFolderPath([Environment+SpecialFolder]::Startup)
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$shortcutPath = Join-Path $startup $shortcutName

if ($Remove) {
    Remove-Item -LiteralPath $shortcutPath -Force -ErrorAction SilentlyContinue
    Write-Output "Removed per-user Startup shortcut: $shortcutPath"
    exit 0
}

if (-not (Test-Path -LiteralPath $startup -PathType Container)) {
    throw "Windows Startup folder was not found: $startup"
}
$powershell = Join-Path $PSHOME 'powershell.exe'
$runner = Join-Path $PSScriptRoot 'start-on-login.ps1'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershell
$shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'Start the local onboarding assistant on Windows login.'
$shortcut.Save()

$env:PORT = '3000'
& node.exe (Join-Path $PSScriptRoot 'server-manager.mjs') start
if ($LASTEXITCODE -ne 0) { throw 'The Startup shortcut was created, but the local server did not start. Check .runtime/server.log.' }
Write-Output "Installed per-user Startup shortcut: $shortcutPath"
Write-Output "Local app: http://localhost:3000"
Write-Output 'To remove it: powershell -ExecutionPolicy Bypass -File scripts/install-autostart.ps1 -Remove'
