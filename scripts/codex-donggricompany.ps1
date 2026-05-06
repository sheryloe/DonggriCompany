[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $CodexArgs
)

$ErrorActionPreference = "Stop"

$ExpectedRepoRoot = "<PROJECT_ROOT>"
$ExpectedCodexHome = "G:\LOCAL_DEV_DRIVE\repos\.codex-homes\DonggriCompany"

$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$ExpectedRepoRootResolved = (Resolve-Path -LiteralPath $ExpectedRepoRoot).Path

if ($RepoRoot -ne $ExpectedRepoRootResolved) {
  throw "This wrapper must run from $ExpectedRepoRootResolved, but resolved $RepoRoot."
}

$AgentsPath = Join-Path $RepoRoot "AGENTS.md"
$ConfigPath = Join-Path $ExpectedCodexHome "config.toml"
$MultiAuthPath = Join-Path $ExpectedCodexHome "multi-auth"

if (-not (Test-Path -LiteralPath $AgentsPath -PathType Leaf)) {
  throw "AGENTS.md was not found at $AgentsPath."
}

if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
  throw "Project Codex config was not found at $ConfigPath."
}

if (-not (Test-Path -LiteralPath $MultiAuthPath -PathType Container)) {
  throw "Shared Codex multi-auth link was not found at $MultiAuthPath."
}

$env:CODEX_HOME = $ExpectedCodexHome
Set-Location -LiteralPath $RepoRoot

Write-Host "CODEX_HOME=$env:CODEX_HOME"
Write-Host "CWD=$(Get-Location)"
Write-Host "AGENTS.md=$AgentsPath"

& codex @CodexArgs
exit $LASTEXITCODE
