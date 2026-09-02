param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "Kindle Memo Cards.lnk"
$LaunchScript = Join-Path $ProjectRoot "launch.ps1"
$IconPath = Join-Path $ProjectRoot "assets\kindle-memo-icon.ico"

if ((Test-Path -LiteralPath $ShortcutPath) -and -not $Force) {
  Write-Host "Shortcut already exists: $ShortcutPath"
  Write-Host "Use -Force only when you want to update it to this project path."
  exit 0
}

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$LaunchScript`""
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.IconLocation = $IconPath
$Shortcut.Description = "Launch Kindle Memo Cards"
$Shortcut.Save()

Write-Host "Created shortcut: $ShortcutPath"
