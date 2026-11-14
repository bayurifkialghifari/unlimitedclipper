param(
  [Parameter(Mandatory = $true)][string]$ArchivePath,
  [Parameter(Mandatory = $true)][string]$DestinationPath
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$destinationRoot = [IO.Path]::GetFullPath($DestinationPath)
$destinationPrefix = $destinationRoot
if (-not $destinationPrefix.EndsWith([IO.Path]::DirectorySeparatorChar)) {
  $destinationPrefix += [IO.Path]::DirectorySeparatorChar
}

# Windows PowerShell and PowerShell 7 expose different ZIP extraction overloads.
$archive = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($ArchivePath))
try {
  [void][IO.Directory]::CreateDirectory($destinationRoot)
  foreach ($entry in $archive.Entries) {
    if ([IO.Path]::IsPathRooted($entry.FullName)) {
      throw 'Archive entries must use relative paths.'
    }
    $targetPath = [IO.Path]::GetFullPath([IO.Path]::Combine($destinationRoot, $entry.FullName))
    if (-not $targetPath.StartsWith($destinationPrefix, [StringComparison]::Ordinal)) {
      throw 'An archive entry escapes the extraction directory.'
    }
    if ([string]::IsNullOrEmpty($entry.Name)) {
      [void][IO.Directory]::CreateDirectory($targetPath)
      continue
    }
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($targetPath))
    $entryStream = $entry.Open()
    try {
      $outputStream = [IO.File]::Open($targetPath, [IO.FileMode]::Create, [IO.FileAccess]::Write)
      try {
        $entryStream.CopyTo($outputStream)
      } finally {
        $outputStream.Dispose()
      }
    } finally {
      $entryStream.Dispose()
    }
    [IO.File]::SetLastWriteTime($targetPath, $entry.LastWriteTime.LocalDateTime)
  }
} finally {
  $archive.Dispose()
}
