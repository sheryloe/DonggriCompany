[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $CodexArgs
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$ExpectedCodexHome = if ([string]::IsNullOrWhiteSpace($env:DONGGRI_CODEX_HOME)) {
  Join-Path $RepoRoot ".codex-home"
} else {
  $env:DONGGRI_CODEX_HOME
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
