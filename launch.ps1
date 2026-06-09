$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Url = "http://127.0.0.1:5173/"
$LogPath = Join-Path $ProjectRoot "kindle-memo-server.log"

function Test-LocalApp {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
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

if (-not (Test-LocalApp)) {
  Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList "/c", "node server.mjs --prod > `"$LogPath`" 2>&1" `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden

  $ready = $false
  for ($i = 0; $i -lt 20; $i += 1) {
    Start-Sleep -Milliseconds 500
    if (Test-LocalApp) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    throw "Kindle Memo Cards did not start. See $LogPath"
  }
}

Start-Process $Url
