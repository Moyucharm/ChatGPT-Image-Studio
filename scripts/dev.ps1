Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot "web"
$backendDir = Join-Path $repoRoot "backend"

function Assert-LastExitCode {
  param(
    [string]$CommandName
  )

  if ($LASTEXITCODE -ne 0) {
    throw "$CommandName failed with exit code $LASTEXITCODE"
  }
}

Write-Host "[1/3] Building frontend static assets..."
Push-Location $webDir
npm ci
Assert-LastExitCode "npm ci"
npm run build
Assert-LastExitCode "npm run build"
Pop-Location

Write-Host "[2/3] Watching frontend changes and auto-syncing to backend/static..."
$watchOut = Join-Path $webDir "vite-watch.out.log"
$watchErr = Join-Path $webDir "vite-watch.err.log"
if (Test-Path $watchOut) {
  Remove-Item $watchOut -Force
}
if (Test-Path $watchErr) {
  Remove-Item $watchErr -Force
}
$watcher = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "build:watch") -WorkingDirectory $webDir -PassThru -RedirectStandardOutput $watchOut -RedirectStandardError $watchErr
Start-Sleep -Seconds 2
if ($watcher.HasExited) {
  throw "frontend watcher exited early, see $watchErr"
}

Write-Host "[3/3] Starting backend on configured port..."
Push-Location $backendDir
$env:SERVER_PORT = "7001"
try {
  go run .
  Assert-LastExitCode "go run ."
} finally {
  if ($watcher -and -not $watcher.HasExited) {
    Stop-Process -Id $watcher.Id -Force
  }
  Pop-Location
}
