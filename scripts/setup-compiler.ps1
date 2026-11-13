$ErrorActionPreference = 'Stop'
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$compilerRoot = Join-Path $workspaceRoot '.tools/compiler'
New-Item -ItemType Directory -Path $compilerRoot -Force | Out-Null
$archivePath = Join-Path $compilerRoot 'llvm-mingw.zip'
$archiveUrl = 'https://github.com/mstorsjo/llvm-mingw/releases/download/20261104/llvm-mingw-20261104-ucrt-aarch64.zip'
$compilerBin = Join-Path $compilerRoot 'llvm-mingw-20261104-ucrt-aarch64/bin'
if (-not (Test-Path -LiteralPath (Join-Path $compilerBin 'aarch64-w64-mingw32-clang.exe'))) {
  Write-Output 'Downloading the workspace-local ARM64 LLVM toolchain.'
  Invoke-WebRequest -UseBasicParsing -Uri $archiveUrl -OutFile $archivePath
  Expand-Archive -LiteralPath $archivePath -DestinationPath $compilerRoot -Force
}
& rustup toolchain install stable-aarch64-pc-windows-gnullvm --profile minimal
if ($LASTEXITCODE -ne 0) {
  throw 'Rust target installation failed.'
}
Write-Output "Compiler prepared at $compilerBin"
