param([Parameter(Mandatory=$true)][string]$DestinationDirectory, [Parameter(Mandatory=$true)][string]$KnownFile)
$ErrorActionPreference = 'Stop'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $Utf8
$OutputEncoding = $Utf8
try {
  $Known = @{}
  foreach ($Key in @(Get-Content -LiteralPath $KnownFile -Raw | ConvertFrom-Json)) { $Known[$Key] = $true }
  $Shell = New-Object -ComObject Shell.Application
  $Files = New-Object System.Collections.Generic.List[object]
  $Warnings = New-Object System.Collections.Generic.List[string]
  $Connected = $false
  $Watch = [Diagnostics.Stopwatch]::StartNew()
  $Sha = [Security.Cryptography.SHA256]::Create()
  foreach ($Device in @($Shell.Namespace(17).Items())) {
    if (-not $Device.IsFolder -or $Device.Name -notmatch 'Kindle') { continue }
    $Connected = $true
    foreach ($Storage in @($Device.GetFolder.Items())) {
      if (-not $Storage.IsFolder) { continue }
      $Root = $Storage.GetFolder
      $Folders = @([pscustomobject]@{Folder=$Root; Root=$true})
      foreach ($Item in @($Root.Items())) {
        if ($Item.IsFolder -and $Item.Name -ieq 'screenshots') { $Folders += [pscustomobject]@{Folder=$Item.GetFolder; Root=$false} }
        if ($Item.IsFolder -and $Item.Name -ieq 'documents') {
          foreach ($Sub in @($Item.GetFolder.Items())) {
            if ($Sub.IsFolder -and $Sub.Name -ieq 'screenshots') { $Folders += [pscustomobject]@{Folder=$Sub.GetFolder; Root=$false} }
          }
        }
      }
      foreach ($Candidate in $Folders) {
        foreach ($Item in @($Candidate.Folder.Items())) {
          if ($Item.IsFolder) { continue }
          $Extension = [IO.Path]::GetExtension([string]$Item.Path)
          if ($Extension -notmatch '^\.(png|jpg|jpeg)$') { $Extension = [IO.Path]::GetExtension([string]$Item.Name) }
          if ($Extension -notmatch '^\.(png|jpg|jpeg)$' -or ($Candidate.Root -and $Item.Name -notmatch '^screenshot')) { continue }
          $Identity = "$($Item.Path)|$($Item.Size)|$($Item.ModifyDate)"
          $Key = ([BitConverter]::ToString($Sha.ComputeHash($Utf8.GetBytes($Identity)))).Replace('-','').ToLowerInvariant()
          if ($Known.ContainsKey($Key) -or $Files.Count -ge 12 -or $Watch.Elapsed.TotalSeconds -gt 15) { continue }
          if ([long]$Item.Size -gt 20971520) { $Warnings.Add("$($Item.Name): exceeds 20 MB"); continue }
          $Subdirectory = Join-Path $DestinationDirectory ([string]$Files.Count)
          New-Item -ItemType Directory -Path $Subdirectory -Force | Out-Null
          $Shell.Namespace($Subdirectory).CopyHere($Item, 4+16+512+1024)
          $Copied = $null
          $Previous = -1L
          $Stable = 0
          for ($Attempt=0; $Attempt -lt 80; $Attempt++) {
            Start-Sleep -Milliseconds 100
            $Copied = Get-ChildItem -LiteralPath $Subdirectory -File | Select-Object -First 1
            if (-not $Copied) { continue }
            if ($Copied.Length -eq $Previous -and $Copied.Length -gt 0) { $Stable++ } else { $Stable=0; $Previous=$Copied.Length }
            if ($Stable -ge 2 -and ([long]$Item.Size -le 0 -or $Copied.Length -eq [long]$Item.Size)) { break }
          }
          if (-not $Copied -or $Stable -lt 2 -or ([long]$Item.Size -gt 0 -and $Copied.Length -ne [long]$Item.Size)) { throw 'Screenshot copy incomplete. Reconnect Kindle and retry.' }
          $Files.Add(@{relativePath="$($Files.Count)/$($Copied.Name)";name=$Copied.Name;sourceKey=$Key})
          $Known[$Key] = $true
        }
      }
    }
  }
  $Sha.Dispose()
  [Console]::Out.WriteLine((@{ok=$true;connected=$Connected;files=@($Files.ToArray());warnings=@($Warnings.ToArray())} | ConvertTo-Json -Depth 5 -Compress))
} catch {
  [Console]::Out.WriteLine((@{ok=$false;message=$_.Exception.Message} | ConvertTo-Json -Compress))
}
