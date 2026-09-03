param(
  [Parameter(Mandatory = $true)]
  [string]$DestinationDirectory
)

$ErrorActionPreference = "Stop"
$Utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $Utf8
$OutputEncoding = $Utf8

function Write-JsonResult {
  param([hashtable]$Value)
  [Console]::Out.WriteLine(($Value | ConvertTo-Json -Compress))
}

try {
  $ResolvedDestination = [IO.Path]::GetFullPath($DestinationDirectory)
  New-Item -ItemType Directory -Path $ResolvedDestination -Force | Out-Null

  $Shell = New-Object -ComObject Shell.Application
  $ThisPc = $Shell.Namespace(17)
  if (-not $ThisPc) {
    throw "Windows Shell could not open This PC."
  }

  $Match = $null
  foreach ($Device in @($ThisPc.Items())) {
    if (-not $Device.IsFolder -or $Device.Name -notmatch "Kindle") {
      continue
    }

    foreach ($Storage in @($Device.GetFolder.Items())) {
      if (-not $Storage.IsFolder) {
        continue
      }

      $Documents = @($Storage.GetFolder.Items()) |
        Where-Object { $_.IsFolder -and $_.Name -ieq "documents" } |
        Select-Object -First 1
      if (-not $Documents) {
        continue
      }

      $DocumentsFolder = $Documents.GetFolder
      $Clippings = @($DocumentsFolder.Items()) |
        Where-Object {
          -not $_.IsFolder -and
          ($_.Name -ieq "My Clippings" -or $_.Name -ieq "My Clippings.txt")
        } |
        Select-Object -First 1
      if ($Clippings) {
        $Match = [pscustomobject]@{
          Device = $Device
          Folder = $DocumentsFolder
          File = $Clippings
        }
        break
      }
    }

    if ($Match) {
      break
    }
  }

  if (-not $Match) {
    Write-JsonResult @{ ok = $false; reason = "not_found" }
    exit 0
  }

  $Destination = $Shell.Namespace($ResolvedDestination)
  if (-not $Destination) {
    throw "Windows Shell could not open the temporary destination."
  }

  # WPD/MTP items do not expose a normal filesystem path. CopyHere asks the
  # Windows Shell to make a local, read-only snapshot that Node can parse.
  $CopyFlags = 4 + 16 + 512 + 1024
  $Destination.CopyHere($Match.File, $CopyFlags)

  $CopiedFile = $null
  $LastLength = -1L
  $StableChecks = 0
  for ($Attempt = 0; $Attempt -lt 100; $Attempt += 1) {
    Start-Sleep -Milliseconds 100
    $CopiedFile = Get-ChildItem -LiteralPath $ResolvedDestination -File |
      Where-Object { $_.BaseName -ieq "My Clippings" } |
      Select-Object -First 1
    if (-not $CopiedFile) {
      continue
    }

    if ($CopiedFile.Length -eq $LastLength) {
      $StableChecks += 1
    } else {
      $LastLength = $CopiedFile.Length
      $StableChecks = 0
    }
    if ($StableChecks -ge 2) {
      break
    }
  }

  if (-not $CopiedFile -or $StableChecks -lt 2) {
    throw "Copying My Clippings.txt from the Kindle timed out."
  }

  Write-JsonResult @{
    ok = $true
    deviceName = [string]$Match.Device.Name
    fileName = [string]$CopiedFile.Name
    size = [long]$CopiedFile.Length
    modified = [string]$Match.Folder.GetDetailsOf($Match.File, 3)
  }
} catch {
  Write-JsonResult @{
    ok = $false
    reason = "read_failed"
    message = $_.Exception.Message
  }
  exit 0
}
