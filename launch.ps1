$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PortCandidates = 5173..5180
$LogPath = Join-Path $ProjectRoot "kindle-memo-server.log"

function Test-LocalApp {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500 -and $response.Content -match "Kindle Memo Cards")
  } catch {
    return $false
  }
}

Set-Location $ProjectRoot

if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
  npm install
}

if (-not (Test-Path (Join-Path $ProjectRoot "dist\index.html"))) {
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
  Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList "/c", "set PORT=$Port&& node server.mjs --prod > `"$LogPath`" 2>&1" `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden

  $ready = $false
  for ($i = 0; $i -lt 20; $i += 1) {
    Start-Sleep -Milliseconds 500
    if (Test-LocalApp -Url $Url) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    throw "Kindle Memo Cards did not start. See $LogPath"
  }
}

Start-Process $Url
