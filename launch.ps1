param(
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PortCandidates = 4310..4319
$LogPath = Join-Path $ProjectRoot "kindle-memo-server.log"
$ErrorLogPath = Join-Path $ProjectRoot "kindle-memo-server-error.log"

function Test-LocalApp {
  param([string]$Url)

  try {
    $HealthUrl = "$($Url.TrimEnd('/'))/api/health"
    $response = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2
    return ($response.ok -eq $true -and $response.app -eq "kindle-flomo-cards")
  } catch {
    return $false
  }
}

Set-Location $ProjectRoot

if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
  npm install
}

$DistIndex = Join-Path $ProjectRoot "dist\index.html"
$BuildInputs = @(
  (Join-Path $ProjectRoot "src"),
  (Join-Path $ProjectRoot "index.html"),
  (Join-Path $ProjectRoot "package.json"),
  (Join-Path $ProjectRoot "vite.config.ts")
)
$LatestInput = $BuildInputs |
  ForEach-Object {
    if (Test-Path -LiteralPath $_ -PathType Container) {
      Get-ChildItem -LiteralPath $_ -Recurse -File
    } elseif (Test-Path -LiteralPath $_ -PathType Leaf) {
      Get-Item -LiteralPath $_
    }
  } |
  Sort-Object LastWriteTimeUtc -Descending |
  Select-Object -First 1

if (-not (Test-Path -LiteralPath $DistIndex) -or $LatestInput.LastWriteTimeUtc -gt (Get-Item -LiteralPath $DistIndex).LastWriteTimeUtc) {
  npm run build
}

$Port = $null
foreach ($Candidate in $PortCandidates) {
  $CandidateUrl = "http://127.0.0.1:$Candidate/"
  if (Test-LocalApp -Url $CandidateUrl) {
    $Port = $Candidate
    break
  }

  $connection = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $Candidate -State Listen -ErrorAction SilentlyContinue
  if (-not $connection) {
    $Port = $Candidate
    break
  }
}

if (-not $Port) {
  throw "No available local port found for Kindle Memo Cards."
}

$Url = "http://127.0.0.1:$Port/"

if (-not (Test-LocalApp -Url $Url)) {
  $NodePath = (Get-Command node -ErrorAction Stop).Source
  Start-Process `
    -FilePath $NodePath `
    -ArgumentList "server.mjs", "--prod", "--port=$Port" `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $LogPath `
    -RedirectStandardError $ErrorLogPath

  $ready = $false
  for ($i = 0; $i -lt 20; $i += 1) {
    Start-Sleep -Milliseconds 500
    if (Test-LocalApp -Url $Url) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    throw "Kindle Flomo Cards did not start. See $LogPath and $ErrorLogPath"
  }
}

if (-not $NoOpen) {
  Start-Process $Url
}

Write-Host "Kindle Flomo Cards ready at $Url"
