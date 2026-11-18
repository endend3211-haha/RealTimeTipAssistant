$ErrorActionPreference = 'Stop'
$studio = Join-Path $PSScriptRoot 'Studio\windows\gm-plugin-studio-desktop.exe'
$package = Join-Path $PSScriptRoot 'dist\NaverAlertImage-Studio-1.0.1.zip'
if (!(Test-Path -LiteralPath $studio)) { throw "Studio not found: $studio" }
if (!(Test-Path -LiteralPath $package)) { throw "Package not found: $package" }
# Existing, user-requested interactive application.
if (!(Get-Process -Name 'gm-plugin-studio-desktop' -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $studio -WorkingDirectory $PSScriptRoot
}
Start-Process -FilePath explorer.exe -ArgumentList ('/select,"' + $package + '"')
Write-Host 'Studio: Import package -> dist\NaverAlertImage-Studio-1.0.1.zip'
Write-Host 'Phone: Naver alert image / Glass: Naver Alert Image Receiver'

