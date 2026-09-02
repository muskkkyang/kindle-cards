param(
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PortCandidates = 4310..4319

function Test-LocalApp {
  param(
    [string]$Url,
    [string]$ExpectedBuildId
  )

  try {
    $HealthUrl = "$($Url.TrimEnd('/'))/api/health"
    $Response = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2
    return (
      $Response.ok -eq $true -and
      $Response.app -eq "kindle-flomo-cards" -and
      $Response.buildId -eq $ExpectedBuildId
    )
  } catch {
    return $false
  }
}

Set-Location $ProjectRoot

$NodePath = (Get-Command node -ErrorAction Stop).Source
$NodeVersionText = (& $NodePath --version).TrimStart("v")
$NodeVersion = [Version]::Parse($NodeVersionText)
if ($NodeVersion -lt [Version]"22.22.2") {
  throw "Kindle Flomo Cards requires Node.js 22.22.2 or newer. Current version: $NodeVersionText"
}

$NodeModulesPath = Join-Path $ProjectRoot "node_modules"
$NeedsInstall = -not (Test-Path -LiteralPath $NodeModulesPath)
if (-not $NeedsInstall) {
  npm ls --depth=0 --silent *> $null
  $NeedsInstall = $LASTEXITCODE -ne 0
}

if ($NeedsInstall) {
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }
}

$DistIndex = Join-Path $ProjectRoot "dist\index.html"
$BuildInputs = @(
  (Join-Path $ProjectRoot "src"),
  (Join-Path $ProjectRoot "index.html"),
  (Join-Path $ProjectRoot "package.json"),
  (Join-Path $ProjectRoot "package-lock.json"),
  (Join-Path $ProjectRoot "server.mjs"),
  (Join-Path $ProjectRoot "tsconfig.json"),
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

$NeedsBuild = -not (Test-Path -LiteralPath $DistIndex)
if (-not $NeedsBuild -and $LatestInput) {
  $NeedsBuild = $LatestInput.LastWriteTimeUtc -gt (Get-Item -LiteralPath $DistIndex).LastWriteTimeUtc
}

if ($NeedsBuild) {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Production build failed." }
}

$IndexHash = (Get-FileHash -LiteralPath $DistIndex -Algorithm SHA256).Hash.Substring(0, 8)
$ServerHash = (Get-FileHash -LiteralPath (Join-Path $ProjectRoot "server.mjs") -Algorithm SHA256).Hash.Substring(0, 8)
$BuildId = "$IndexHash$ServerHash".ToLowerInvariant()

$Port = $null
foreach ($Candidate in $PortCandidates) {
  $CandidateUrl = "http://127.0.0.1:$Candidate/"
  if (Test-LocalApp -Url $CandidateUrl -ExpectedBuildId $BuildId) {
    $Port = $Candidate
    break
  }

  $Connection = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $Candidate -State Listen -ErrorAction SilentlyContinue
  if (-not $Connection) {
    $Port = $Candidate
    break
  }
}

if (-not $Port) {
  throw "No available local port found in 4310-4319. Close an older Kindle Flomo Cards window and retry."
}

$Url = "http://127.0.0.1:$Port/"

if (-not (Test-LocalApp -Url $Url -ExpectedBuildId $BuildId)) {
  $LogPath = Join-Path $ProjectRoot "kindle-memo-server-$Port.log"
  $ErrorLogPath = Join-Path $ProjectRoot "kindle-memo-server-$Port-error.log"
  Start-Process `
    -FilePath $NodePath `
    -ArgumentList @("server.mjs", "--prod", "--port=$Port", "--build-id=$BuildId") `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $LogPath `
    -RedirectStandardError $ErrorLogPath

  $Ready = $false
  for ($Attempt = 0; $Attempt -lt 24; $Attempt += 1) {
    Start-Sleep -Milliseconds 500
    if (Test-LocalApp -Url $Url -ExpectedBuildId $BuildId) {
      $Ready = $true
      break
    }
  }

  if (-not $Ready) {
    throw "Kindle Flomo Cards did not start. See $LogPath and $ErrorLogPath"
  }
}

if (-not $NoOpen) {
  Start-Process $Url
}

Write-Host "Kindle Flomo Cards ready at $Url"
