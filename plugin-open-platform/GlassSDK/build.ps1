param(
  [ValidateSet('build','inspect','clean','all','toolchain')][string]$Command = 'build',
  [string]$Project = 'GlassSDK/examples/notification_reply',
  [switch]$InsecureDownload
)

# WindowsApps/python.exe is a Microsoft Store alias and can be blocked in
# managed environments. Prefer a real installation.
$candidates = @(
  (Join-Path $env:LOCALAPPDATA 'Python\bin\python.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python313\python.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'),
  (Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1)
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) -and $_ -notlike '*\WindowsApps\*' }

$python = $candidates | Select-Object -First 1
if (-not $python) {
  throw '실행 가능한 Python을 찾지 못했습니다. python.org Python을 설치하거나 LOCALAPPDATA\Python\bin\python.exe를 PATH에 추가하세요.'
}

$args = @('GlassSDK/build.py', $Command)
if ($Command -in @('build','inspect') -and $Project) { $args += @('--project', $Project) }
if ($InsecureDownload) { $args += '--insecure-download' }
& $python @args
exit $LASTEXITCODE
