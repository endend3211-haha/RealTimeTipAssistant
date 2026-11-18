$ErrorActionPreference = 'Stop'
$studio = Join-Path $PSScriptRoot 'Studio\windows\gm-plugin-studio-desktop.exe'
$package = Join-Path $PSScriptRoot 'dist\MemoMindHUD-Studio-1.0.0.zip'
if (!(Test-Path -LiteralPath $studio)) { throw "Studio not found: $studio" }
if (!(Test-Path -LiteralPath $package)) { throw "Package not found: $package" }

if (!(Get-Process -Name 'gm-plugin-studio-desktop' -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $studio -WorkingDirectory $PSScriptRoot
}
Start-Process -FilePath explorer.exe -ArgumentList ('/select,"' + $package + '"')
Write-Host '=================================================='
Write-Host 'MemoMind HUD Studio 가 실행되었습니다!'
Write-Host '1. Studio 상단 [Import package] 버튼 클릭'
Write-Host "2. dist\MemoMindHUD-Studio-1.0.0.zip 선택"
Write-Host '3. 앱: MemoMind Real-Time HUD 1.0.0'
Write-Host '   글래스: MemoMind One Real-Time Optical HUD'
Write-Host '   실행 확인!'
Write-Host '=================================================='
