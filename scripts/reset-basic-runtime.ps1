param(
  [switch]$RemoveOptionalAssets,
  [switch]$IncludeNodeModules,
  [switch]$WhatIfOnly
)

$ErrorActionPreference = "Stop"

function Remove-Target {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  if ($WhatIfOnly) {
    Write-Host "[DRY] remove $Path"
    return
  }

  Remove-Item -LiteralPath $Path -Recurse -Force
  Write-Host "[OK] removed $Path"
}

function Remove-ByPattern {
  param(
    [Parameter(Mandatory = $true)][string]$BasePath,
    [Parameter(Mandatory = $true)][string]$Pattern
  )

  $items = Get-ChildItem -LiteralPath $BasePath -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like $Pattern }

  foreach ($item in $items) {
    Remove-Target -Path $item.FullName
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "RepoRoot: $repoRoot"

$alwaysRemove = @(
  (Join-Path $repoRoot "dist"),
  (Join-Path $repoRoot "coverage"),
  (Join-Path $repoRoot ".tmp"),
  (Join-Path $repoRoot "logs"),
  (Join-Path $repoRoot "scratch"),
  (Join-Path $repoRoot "tsconfig.app.tsbuildinfo"),
  (Join-Path $repoRoot "tsconfig.node.tsbuildinfo"),
  (Join-Path $repoRoot "tsbuild-errors.log"),
  (Join-Path $repoRoot ".env (1)"),
  (Join-Path $repoRoot "claw-empire.sqlite")
)

foreach ($target in $alwaysRemove) {
  Remove-Target -Path $target
}

Remove-ByPattern -BasePath $repoRoot -Pattern ".tmp*.log"
Remove-ByPattern -BasePath $repoRoot -Pattern ".tmp*.err.log"

if ($IncludeNodeModules) {
  Remove-Target -Path (Join-Path $repoRoot "node_modules")
}

if ($RemoveOptionalAssets) {
  $optionalTargets = @(
    (Join-Path $repoRoot "tools\\ollama-image-local"),
    (Join-Path $repoRoot "Sample_Img")
  )

  foreach ($target in $optionalTargets) {
    Remove-Target -Path $target
  }
}

Write-Host "Done."
Write-Host "Protected paths: data\\, data\\recovery-backups\\, data\\*.invalid-*"
