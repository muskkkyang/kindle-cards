param(
  [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) "release"),
  [string]$NodeVersion = "22.22.2",
  [string]$NodeArchivePath,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Package = Get-Content -Raw (Join-Path $ProjectRoot "package.json") | ConvertFrom-Json

if ($Package.name -ne "kindle-cards") {
  throw "Portable packaging must run from the Kindle Cards project root."
}

if (-not [Environment]::Is64BitOperatingSystem) {
  throw "The portable package currently supports 64-bit Windows only."
}

function Copy-RequiredFile {
  param(
    [string]$RelativePath,
    [string]$DestinationRoot
  )

  $Source = Join-Path $ProjectRoot $RelativePath
  if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
    throw "Required package file is missing: $RelativePath"
  }

  $Destination = Join-Path $DestinationRoot $RelativePath
  $Parent = Split-Path -Parent $Destination
  New-Item -ItemType Directory -Path $Parent -Force | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Get-Sha256 {
  param([string]$Path)

  $Lines = @(& certutil.exe -hashfile $Path SHA256)
  if ($LASTEXITCODE -ne 0) {
    throw "Calculating SHA-256 failed for: $Path"
  }

  $HashLine = $Lines | Where-Object { $_ -match "^[0-9A-Fa-f\s]{64,}$" } | Select-Object -First 1
  if (-not $HashLine) {
    throw "certutil did not return a SHA-256 value for: $Path"
  }
  return ($HashLine -replace "\s", "").ToUpperInvariant()
}

function Get-NodeArchive {
  param(
    [string]$Version,
    [string]$ArchiveOverride
  )

  $FileName = "node-v$Version-win-x64.zip"
  $BaseUrl = "https://nodejs.org/dist/v$Version"
  $CacheDirectory = Join-Path ([IO.Path]::GetTempPath()) "kindle-cards-node-cache"
  New-Item -ItemType Directory -Path $CacheDirectory -Force | Out-Null
  $Archive = if ($ArchiveOverride) {
    [IO.Path]::GetFullPath($ArchiveOverride)
  } else {
    Join-Path $CacheDirectory $FileName
  }

  if ($ArchiveOverride -and -not (Test-Path -LiteralPath $Archive -PathType Leaf)) {
    throw "Node archive not found: $Archive"
  }

  if (-not $ArchiveOverride -and -not (Test-Path -LiteralPath $Archive -PathType Leaf)) {
    & curl.exe --fail --location --silent --show-error --output $Archive "$BaseUrl/$FileName"
    if ($LASTEXITCODE -ne 0) {
      throw "Downloading the official Node.js archive failed."
    }
  }

  $ChecksumLines = @(& curl.exe --fail --location --silent --show-error "$BaseUrl/SHASUMS256.txt")
  if ($LASTEXITCODE -ne 0) {
    throw "Downloading the official Node.js checksum file failed."
  }
  $Checksums = $ChecksumLines -join "`n"
  $ExpectedLine = $Checksums -split "`n" | Where-Object { $_ -match "\s$([regex]::Escape($FileName))$" } | Select-Object -First 1
  if (-not $ExpectedLine) {
    throw "Could not find the official checksum for $FileName."
  }

  $ExpectedHash = ($ExpectedLine -split "\s+")[0].Trim().ToUpperInvariant()
  $ActualHash = Get-Sha256 -Path $Archive
  if ($ActualHash -ne $ExpectedHash) {
    throw "The downloaded Node.js archive did not match its official SHA-256 checksum."
  }

  return $Archive
}

Push-Location $ProjectRoot
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Production build failed." }
} finally {
  Pop-Location
}

$ResolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $ResolvedOutput -Force | Out-Null

$ArchiveName = "kindle-cards-$($Package.version)-windows-x64.zip"
$ArchivePath = Join-Path $ResolvedOutput $ArchiveName
$HashPath = "$ArchivePath.sha256"

if ((Test-Path -LiteralPath $ArchivePath) -or (Test-Path -LiteralPath $HashPath)) {
  if (-not $Force) {
    throw "Release output already exists. Use -Force to replace: $ArchivePath"
  }
  if (Test-Path -LiteralPath $ArchivePath) { Remove-Item -LiteralPath $ArchivePath -Force }
  if (Test-Path -LiteralPath $HashPath) { Remove-Item -LiteralPath $HashPath -Force }
}

$StagingRoot = Join-Path ([IO.Path]::GetTempPath()) "kindle-cards-portable-$([guid]::NewGuid().ToString('N'))"
$ExtractRoot = Join-Path ([IO.Path]::GetTempPath()) "kindle-cards-node-$([guid]::NewGuid().ToString('N'))"

try {
  New-Item -ItemType Directory -Path $StagingRoot -Force | Out-Null
  foreach ($File in @("package.json", "package-lock.json", "server.mjs", "src/lib/kindleParser.js")) {
    Copy-RequiredFile -RelativePath $File -DestinationRoot $StagingRoot
  }
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "dist") -Destination (Join-Path $StagingRoot "dist") -Recurse -Force

  Push-Location $StagingRoot
  try {
    npm ci --omit=dev --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw "Installing the portable runtime dependencies failed." }
  } finally {
    Pop-Location
  }

  $NodeArchive = Get-NodeArchive -Version $NodeVersion -ArchiveOverride $NodeArchivePath

  Expand-Archive -LiteralPath $NodeArchive -DestinationPath $ExtractRoot -Force
  $NodeRoot = Get-ChildItem -LiteralPath $ExtractRoot -Directory | Select-Object -First 1
  if (-not $NodeRoot) { throw "The Node.js archive did not contain a runtime directory." }
  $Runtime = Join-Path $StagingRoot "runtime"
  New-Item -ItemType Directory -Path $Runtime -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $NodeRoot.FullName "node.exe") -Destination (Join-Path $Runtime "node.exe") -Force
  Copy-Item -LiteralPath (Join-Path $NodeRoot.FullName "LICENSE") -Destination (Join-Path $Runtime "NODE-LICENSE") -Force

  @'
import { createServer } from "node:net";
import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const nodePath = path.join(appRoot, "runtime", "node.exe");
const host = "127.0.0.1";

function checkHealth(port) {
  return fetch(`http://${host}:${port}/api/health`)
    .then((response) => response.json())
    .then((payload) => payload.ok === true && payload.app === "kindle-cards")
    .catch(() => false);
}

function findFreePort(port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (error) => {
      if (error.code === "EADDRINUSE") resolve(null);
      else reject(error);
    });
    probe.listen(port, host, () => probe.close(() => resolve(port)));
  });
}

async function openBrowser(url) {
  await new Promise((resolve) => execFile("cmd.exe", ["/d", "/s", "/c", "start", "", url], resolve));
}

for (let port = 4310; port <= 4319; port += 1) {
  if (await checkHealth(port)) {
    await openBrowser(`http://${host}:${port}/`);
    process.exit(0);
  }

  if (!(await findFreePort(port))) continue;
  const server = spawn(nodePath, ["server.mjs", "--prod", `--port=${port}`, "--build-id=portable"], {
    cwd: appRoot,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  server.unref();

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (await checkHealth(port)) {
      await openBrowser(`http://${host}:${port}/`);
      process.exit(0);
    }
  }

  process.stderr.write("Kindle Cards did not become ready. Please try opening Kindle Cards.cmd again.\n");
  process.exit(1);
}

process.stderr.write("No available local port was found in 4310-4319.\n");
process.exit(1);
'@ | Set-Content -LiteralPath (Join-Path $StagingRoot "launcher.mjs") -Encoding utf8

@'
@echo off
setlocal
"%~dp0runtime\node.exe" "%~dp0launcher.mjs"
if errorlevel 1 pause
'@ | Set-Content -LiteralPath (Join-Path $StagingRoot "Kindle Cards.cmd") -Encoding ascii

  @'
Kindle Cards for Windows

1. Extract this ZIP to a writable folder.
2. Double-click "Kindle Cards.cmd".
3. Your browser will open automatically at a local address.

This portable package includes its own Node.js runtime. You do not need to install Node.js, Git, or npm.
All reading data remains in the browser storage on this computer.
'@ | Set-Content -LiteralPath (Join-Path $StagingRoot "README-START-HERE.txt") -Encoding utf8

  @'
This package includes Node.js. Its license is included at runtime/NODE-LICENSE.
All JavaScript dependencies are installed from the project's locked npm dependency set.
'@ | Set-Content -LiteralPath (Join-Path $StagingRoot "THIRD-PARTY-NOTICES.txt") -Encoding utf8

  if (Get-Command tar.exe -ErrorAction SilentlyContinue) {
    & tar.exe -a -c -f $ArchivePath -C $StagingRoot .
    if ($LASTEXITCODE -ne 0) { throw "Creating the portable ZIP failed." }
  } else {
    Compress-Archive -Path (Join-Path $StagingRoot "*") -DestinationPath $ArchivePath -CompressionLevel Optimal
  }
  $Hash = Get-Sha256 -Path $ArchivePath
  "$Hash *$ArchiveName" | Set-Content -LiteralPath $HashPath -Encoding ascii

  Write-Host "Created portable package: $ArchivePath"
  Write-Host "Created checksum: $HashPath"
} finally {
  if (Test-Path -LiteralPath $StagingRoot) { Remove-Item -LiteralPath $StagingRoot -Recurse -Force }
  if (Test-Path -LiteralPath $ExtractRoot) { Remove-Item -LiteralPath $ExtractRoot -Recurse -Force }
}
