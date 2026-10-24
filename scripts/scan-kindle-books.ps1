param(
  [Parameter(Mandatory=$true)][string]$DestinationDirectory,
  [Parameter(Mandatory=$true)][string]$KnownFile,
  [string]$WantedFile
)
$ErrorActionPreference = 'Stop'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $Utf8
$OutputEncoding = $Utf8
$Known = @{}
$KnownValues = Get-Content -LiteralPath $KnownFile -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($Key in $KnownValues) { $Known[[string]$Key] = $true }
$Wanted = @()
if ($WantedFile) { $Wanted = Get-Content -LiteralPath $WantedFile -Raw -Encoding UTF8 | ConvertFrom-Json }
function Normalize-Title([string]$Value) { return ($Value.Normalize([Text.NormalizationForm]::FormKC).ToLowerInvariant() -replace '[^\p{L}\p{N}]', '') }
$Shell = New-Object -ComObject Shell.Application
$Sha = [Security.Cryptography.SHA256]::Create()
$Files = New-Object System.Collections.Generic.List[object]
$Skipped = New-Object System.Collections.Generic.List[string]
$Observed = New-Object System.Collections.Generic.List[string]
$Connected = $false
$Pending = $false
$Unsupported = 0
$Watch = [Diagnostics.Stopwatch]::StartNew()
$TotalBytes = 0L
try {
  foreach ($Device in @($Shell.Namespace(17).Items())) {
    if (-not $Device.IsFolder -or $Device.Name -notmatch 'Kindle') { continue }
    $Connected = $true
    foreach ($Storage in @($Device.GetFolder.Items())) {
      if (-not $Storage.IsFolder) { continue }
      $Documents = @($Storage.GetFolder.Items()) | Where-Object { $_.IsFolder -and $_.Name -ieq 'documents' } | Select-Object -First 1
      if (-not $Documents) { continue }
      $Queue = New-Object System.Collections.Generic.Queue[object]
      $Queue.Enqueue(@{Folder=$Documents.GetFolder; Depth=0})
      $Visited = 0
      while ($Queue.Count -gt 0) {
        if ($Watch.Elapsed.TotalSeconds -gt 18 -or $Visited -ge 5000) { $Pending = $true; break }
        $Current = $Queue.Dequeue()
        foreach ($Item in @($Current.Folder.Items())) {
          $Visited++
          if ($Item.IsFolder) {
            if ($Current.Depth -lt 5 -and $Item.Name -notmatch '\.sdr$' -and $Item.Name -ne '.cache') {
              $Queue.Enqueue(@{Folder=$Item.GetFolder; Depth=$Current.Depth+1})
            }
            continue
          }
          if ($Wanted.Count -gt 0) {
            $Stem = Normalize-Title $Item.Name
            $Relevant = $false
            foreach ($Book in $Wanted) {
              $Title = Normalize-Title ([string]$Book.title)
              if ($Title.Length -gt 0 -and $Stem.StartsWith($Title.Substring(0,[Math]::Min(8,$Title.Length)))) { $Relevant=$true; break }
            }
            if (-not $Relevant) { continue }
          }
          $Extension = [string]$Item.ExtendedProperty('System.FileExtension')
          if (-not $Extension) { $Extension = [IO.Path]::GetExtension($Item.Name) }
          if ($Extension -notmatch '^\.(epub|mobi|azw|azw3|kfx)$') { continue }
          $Size = [long]$Item.Size
          if ($Size -le 0) { $Size = [long]$Item.ExtendedProperty('System.Size') }
          $Identity = "$($Item.Path)|$Size|$($Item.ModifyDate)"
          $Key = ([BitConverter]::ToString($Sha.ComputeHash($Utf8.GetBytes($Identity)))).Replace('-','').ToLowerInvariant()
          $Observed.Add($Key)
          if ($Known.ContainsKey($Key)) { continue }
          if ($Size -gt 67108864) { $Skipped.Add($Key); continue }
          if ($Files.Count -ge 8 -or $TotalBytes + $Size -gt 134217728 -or $Watch.Elapsed.TotalSeconds -gt 18) { $Pending=$true; continue }
          $Index = [string]$Files.Count
          $Folder = Join-Path $DestinationDirectory $Index
          New-Item -ItemType Directory -Path $Folder -Force | Out-Null
          $Shell.Namespace($Folder).CopyHere($Item, 4+16+512+1024)
          $Copied=$null; $Previous=-1L; $Stable=0
          for ($Attempt=0; $Attempt -lt 80; $Attempt++) {
            Start-Sleep -Milliseconds 100
            $Copied = Get-ChildItem -LiteralPath $Folder -File | Select-Object -First 1
            if (-not $Copied) { continue }
            if ($Copied.Length -eq $Previous -and $Copied.Length -gt 0) { $Stable++ } else { $Stable=0; $Previous=$Copied.Length }
            if ($Copied.Length -gt 67108864) { throw 'Book exceeds 64 MB.' }
            if ($Stable -ge 2 -and ($Size -le 0 -or $Copied.Length -eq $Size)) { break }
          }
          if (-not $Copied -or $Stable -lt 2 -or ($Size -gt 0 -and $Copied.Length -ne $Size)) { throw 'Book copy incomplete. Reconnect Kindle and retry.' }
          $TotalBytes += $Copied.Length
          $Files.Add(@{relativePath="$Index/$($Copied.Name)"; extension=$Extension.ToLowerInvariant(); sourceKey=$Key;sourceName=$Item.Name})
        }
      }
    }
  }
  [Console]::Out.WriteLine((@{ok=$true; connected=$Connected; files=@($Files.ToArray()); observed=@($Observed.ToArray()); skipped=@($Skipped.ToArray()); pending=$Pending; unsupported=$Unsupported} | ConvertTo-Json -Depth 5 -Compress))
} finally { $Sha.Dispose() }
