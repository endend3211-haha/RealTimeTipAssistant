$ErrorActionPreference = 'Stop'
$platformRoot = $PSScriptRoot
$studioExe = Join-Path $platformRoot 'Studio\windows\gm-plugin-studio-desktop.exe'
$buildScript = Join-Path $platformRoot 'GlassSDK\build.py'
$exampleName = 'messenger_companion_glass'
$buildRoot = Join-Path $platformRoot "GlassSDK\build-host\.build\$exampleName"
$packagePath = Join-Path $platformRoot 'dist\MemoMessengerCompanion-Glass-Studio.zip'

if (!(Test-Path -LiteralPath $studioExe)) { throw "Studio executable missing: $studioExe" }
& python $buildScript build --example $exampleName
if ($LASTEXITCODE -ne 0) { throw 'Glass example build failed.' }

$reviewFile = Join-Path $buildRoot "$exampleName.review.json"
$review = Get-Content -LiteralPath $reviewFile -Raw | ConvertFrom-Json
$gmpPath = Join-Path $buildRoot "$exampleName.gmp"
$sourcePath = Join-Path $buildRoot "$exampleName.review-source.enc"
if ((Get-FileHash -LiteralPath $gmpPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $review.gmp.sha256) { throw 'GMP review hash mismatch.' }
if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $review.source.sha256) { throw 'Source review hash mismatch.' }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$temporaryPackage = "$packagePath.$([Guid]::NewGuid().ToString('N')).tmp"
$stream = [System.IO.File]::Open($temporaryPackage, [System.IO.FileMode]::CreateNew)
try {
    $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $gmpPath, "$exampleName.gmp") | Out-Null
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $reviewFile, 'review.json') | Out-Null
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $sourcePath, 'source.enc') | Out-Null
    } finally { $archive.Dispose() }
} finally { $stream.Dispose() }

$check = [System.IO.Compression.ZipFile]::OpenRead($temporaryPackage)
try {
    if ($check.Entries.Count -ne 3 -or !$check.GetEntry("$exampleName.gmp") -or !$check.GetEntry('review.json') -or !$check.GetEntry('source.enc')) {
        throw 'Unexpected glass-only package composition.'
    }
} finally { $check.Dispose() }
Move-Item -LiteralPath $temporaryPackage -Destination $packagePath -Force

if (!(Get-Process -Name 'gm-plugin-studio-desktop' -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $studioExe -WorkingDirectory $platformRoot
}
Write-Host ''
Write-Host 'Studio example: Memo Messenger Companion Glass (APK)'
Write-Host 'Refresh Glass plugins, select this example, and disable Phone.'
Write-Host 'For an explicit glass-only composition, use Import package:'
Write-Host $packagePath
Write-Host 'Preview: phone companion APK connection waiting screen.'
