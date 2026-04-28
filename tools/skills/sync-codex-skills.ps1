param(
  [string]$SkillName = "",
  [switch]$Validate,
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

function Test-DonggriSkillManifest {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SkillDirectory
  )

  $skillFile = Join-Path $SkillDirectory "SKILL.md"
  if (-not (Test-Path -LiteralPath $skillFile)) {
    throw "SKILL.md not found: $skillFile"
  }

  $content = Get-Content -LiteralPath $skillFile -Raw -Encoding UTF8
  if ($content -notmatch '(?s)^---\r?\n(.+?)\r?\n---') {
    throw "SKILL.md frontmatter missing: $skillFile"
  }

  $frontmatter = $Matches[1]
  $nameMatch = [regex]::Match($frontmatter, '(?m)^name:\s*["'']?([^"''\r\n]+)["'']?\s*$')
  $descriptionMatch = [regex]::Match($frontmatter, '(?m)^description:\s*["'']?(.+?)["'']?\s*$')
  if (-not $nameMatch.Success) {
    throw "SKILL.md frontmatter name missing: $skillFile"
  }
  if (-not $descriptionMatch.Success -or -not $descriptionMatch.Groups[1].Value.Trim()) {
    throw "SKILL.md frontmatter description missing: $skillFile"
  }

  $folderName = Split-Path -Leaf $SkillDirectory
  $manifestName = $nameMatch.Groups[1].Value.Trim()
  if ($manifestName -ne $folderName) {
    throw "SKILL.md frontmatter name '$manifestName' does not match folder '$folderName'"
  }

  Write-Host "Skill is valid: $manifestName"
}

function Copy-SkillDirectoryAtomic {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDir,
    [Parameter(Mandatory = $true)]
    [string]$DestinationDir
  )

  $parentDir = Split-Path -Parent $DestinationDir
  $baseName = Split-Path -Leaf $DestinationDir
  $suffix = [guid]::NewGuid().ToString("N")
  $tempDir = Join-Path $parentDir "$baseName.tmp-$suffix"
  $backupDir = Join-Path $parentDir "$baseName.bak-$suffix"
  $backupCreated = $false

  New-Item -ItemType Directory -Force -Path $parentDir | Out-Null
  Copy-Item -LiteralPath $SourceDir -Destination $tempDir -Recurse -Force

  try {
    if (Test-Path -LiteralPath $DestinationDir) {
      Move-Item -LiteralPath $DestinationDir -Destination $backupDir
      $backupCreated = $true
    }
    Move-Item -LiteralPath $tempDir -Destination $DestinationDir
    if ($backupCreated) {
      Remove-Item -LiteralPath $backupDir -Recurse -Force
    }
  } catch {
    if (Test-Path -LiteralPath $tempDir) {
      Remove-Item -LiteralPath $tempDir -Recurse -Force
    }
    if ($backupCreated -and -not (Test-Path -LiteralPath $DestinationDir) -and (Test-Path -LiteralPath $backupDir)) {
      Move-Item -LiteralPath $backupDir -Destination $DestinationDir
    }
    throw
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$sourceRoot = Join-Path $repoRoot "skills\donggri"
$manifestPath = Join-Path $sourceRoot "catalog.json"

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Donggri skill catalog not found: $manifestPath"
}

$codexHome = $env:CODEX_HOME
if (-not $codexHome) {
  $codexHome = Join-Path $env:USERPROFILE ".codex"
}
$codexSkillsRoot = Join-Path $codexHome "skills"
$resolvedCodexSkillsRoot = [System.IO.Path]::GetFullPath($codexSkillsRoot)

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$entries = @($manifest.skills)
if ($SkillName.Trim()) {
  $entries = @($entries | Where-Object { $_.skillName -eq $SkillName.Trim() })
  if ($entries.Count -eq 0) {
    throw "Skill not found in Donggri catalog: $SkillName"
  }
}

$installed = @()
$skipped = @()

foreach ($entry in $entries) {
  $name = [string]$entry.skillName
  if ($name -notmatch '^[a-z0-9-]{1,80}$') {
    $skipped += [pscustomobject]@{ skillName = $name; reason = "invalid_skill_name" }
    continue
  }

  $sourceDir = Join-Path $sourceRoot $name
  $sourceSkill = Join-Path $sourceDir "SKILL.md"
  if (-not (Test-Path -LiteralPath $sourceSkill)) {
    $skipped += [pscustomobject]@{ skillName = $name; reason = "repo_source_missing" }
    continue
  }

  if ($Validate) {
    Test-DonggriSkillManifest -SkillDirectory $sourceDir
  }

  $destinationDir = Join-Path $codexSkillsRoot $name
  $resolvedDestination = [System.IO.Path]::GetFullPath($destinationDir)
  if (-not $resolvedDestination.StartsWith($resolvedCodexSkillsRoot + [System.IO.Path]::DirectorySeparatorChar)) {
    throw "Unsafe Codex skill destination: $resolvedDestination"
  }

  if (-not $WhatIf) {
    Copy-SkillDirectoryAtomic -SourceDir $sourceDir -DestinationDir $destinationDir
  }

  $installed += [pscustomobject]@{
    skillName = $name
    source = $sourceDir
    destination = $destinationDir
    validated = [bool]$Validate
    whatIf = [bool]$WhatIf
  }
}

[pscustomobject]@{
  ok = $true
  codexSkillsRoot = $codexSkillsRoot
  installed = $installed
  skipped = $skipped
} | ConvertTo-Json -Depth 6
