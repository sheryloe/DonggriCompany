[CmdletBinding()]
param(
  [string]$BaseUrl = "http://127.0.0.1:8900",
  [string]$ProjectRoot = "",
  [switch]$SkipTaskStop
)

$ErrorActionPreference = "Stop"
$script:ApiSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
}

function Invoke-ApiJson {
  param(
    [Parameter(Mandatory = $true)][ValidateSet("GET", "POST", "PUT", "PATCH", "DELETE")] [string]$Method,
    [Parameter(Mandatory = $true)] [string]$Path,
    [object]$Body = $null
  )

  $uri = "$($BaseUrl.TrimEnd('/'))$Path"
  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -TimeoutSec 30 -WebSession $script:ApiSession
  }

  $json = $Body | ConvertTo-Json -Depth 20 -Compress
  return Invoke-RestMethod -Method $Method -Uri $uri -TimeoutSec 30 -ContentType "application/json" -Body $json -WebSession $script:ApiSession
}

function Get-TaskListByStatus {
  param([string]$Status)

  try {
    $response = Invoke-ApiJson -Method GET -Path "/api/tasks?status=$Status"
    if ($response -and $response.tasks) {
      return @($response.tasks)
    }
  } catch {
    Write-Warning "Failed to query task list for status '$Status': $($_.Exception.Message)"
  }

  return @()
}

Write-Host "[reset-workforce] BaseUrl: $BaseUrl"
Write-Host "[reset-workforce] ProjectRoot: $ProjectRoot"

try {
  $health = Invoke-ApiJson -Method GET -Path "/api/health"
  Write-Host "[health] ok=$($health.ok)"
  $session = Invoke-ApiJson -Method GET -Path "/api/auth/session"
  Write-Host "[session] ok=$($session.ok)"
} catch {
  throw "Server health/session check failed: $($_.Exception.Message)"
}

if (-not $SkipTaskStop) {
  $runningTasks = @()
  $runningTasks += Get-TaskListByStatus -Status "in_progress"
  $runningTasks += Get-TaskListByStatus -Status "collaborating"
  $runningTasks = $runningTasks | Group-Object id | ForEach-Object { $_.Group[0] }

  foreach ($task in $runningTasks) {
    if (-not $task.id) {
      continue
    }

    try {
      Invoke-ApiJson -Method POST -Path "/api/tasks/$($task.id)/stop" | Out-Null
      Write-Host "[task-stop] $($task.id) ($($task.status))"
    } catch {
      Write-Warning "Failed to stop task '$($task.id)': $($_.Exception.Message)"
    }
  }
}

try {
  $agentResponse = Invoke-ApiJson -Method GET -Path "/api/agents?include_seed=1"
  $agents = @($agentResponse.agents)
} catch {
  throw "Failed to query agents: $($_.Exception.Message)"
}

foreach ($agent in $agents) {
  if (-not $agent.id) {
    continue
  }

  try {
    Invoke-ApiJson -Method DELETE -Path "/api/agents/$($agent.id)" | Out-Null
    Write-Host "[agent-delete] $($agent.id) / $($agent.name)"
  } catch {
    Write-Warning "Failed to delete agent '$($agent.id)': $($_.Exception.Message)"
  }
}

$settingsPayload = @{
  officePackProfiles              = @{}
  officePackHydratedPacks         = @()
  officePackSeedAgentsInitialized = $false
  officeWorkflowPack              = "development"
}

try {
  Invoke-ApiJson -Method PUT -Path "/api/settings" -Body $settingsPayload | Out-Null
  Write-Host "[settings-reset] office workflow profile keys reset"
} catch {
  $statusCode = $null
  if ($_.Exception.Response) {
    $statusCode = [int]$_.Exception.Response.StatusCode
  }

  if ($statusCode -eq 409) {
    Write-Warning "Office settings reset skipped due to HTTP 409 conflict; continuing canonical reset."
  } else {
    throw "Failed to reset office settings: $($_.Exception.Message)"
  }
}

try {
  $resetResult = Invoke-ApiJson -Method POST -Path "/api/ops/canonical-reset-organization" -Body @{
    mode                = "apply"
    target_seed_version = "org-v3"
  }
  Write-Host "[canonical-reset] seed_version=$($resetResult.seed_version) inserted=$($resetResult.inserted_agents) migrated=$($resetResult.migrated_agents)"
} catch {
  throw "Failed to apply canonical organization reset: $($_.Exception.Message)"
}

$agentsRoot = Join-Path $ProjectRoot "agents"
$classesRoot = Join-Path $agentsRoot "classes"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$tempBackup = Join-Path $ProjectRoot "agents_reset_$stamp"
$classesBackup = Join-Path $ProjectRoot "agents_classes_$stamp"

if (Test-Path -LiteralPath $tempBackup) {
  Remove-Item -LiteralPath $tempBackup -Recurse -Force
}

if (Test-Path -LiteralPath $classesBackup) {
  Remove-Item -LiteralPath $classesBackup -Recurse -Force
}

if (Test-Path -LiteralPath $classesRoot) {
  Copy-Item -LiteralPath $classesRoot -Destination $classesBackup -Recurse -Force
}

if (Test-Path -LiteralPath $agentsRoot) {
  Rename-Item -LiteralPath $agentsRoot -NewName ("agents_reset_{0}" -f $stamp)
}

New-Item -ItemType Directory -Force -Path $agentsRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $agentsRoot "archive") | Out-Null
New-Item -ItemType Directory -Force -Path $classesRoot | Out-Null

if (Test-Path -LiteralPath $classesBackup) {
  Copy-Item -Path (Join-Path $classesBackup "*") -Destination $classesRoot -Recurse -Force
  Remove-Item -LiteralPath $classesBackup -Recurse -Force
  Write-Host "[classes-restore] $classesRoot"
}

$departments = @("pmo", "planning", "dev", "design", "qa", "devsecops", "operations")
foreach ($department in $departments) {
  New-Item -ItemType Directory -Force -Path (Join-Path $agentsRoot $department) | Out-Null
}

$guideSyncScript = Join-Path $ProjectRoot "tools\agents\sync-workforce-guides.ts"
if (Test-Path -LiteralPath $guideSyncScript) {
  Push-Location -LiteralPath $ProjectRoot
  try {
    & corepack pnpm exec tsx $guideSyncScript
    if ($LASTEXITCODE -ne 0) {
      throw "Guide sync script exited with code $LASTEXITCODE"
    }
    Write-Host "[guide-sync] active workforce guide bundles synced"
  } finally {
    Pop-Location
  }
} else {
  Write-Warning "Guide sync script not found: $guideSyncScript"
}

if (Test-Path -LiteralPath $tempBackup) {
  $archiveTarget = Join-Path $agentsRoot ("archive\reset_{0}" -f $stamp)
  Move-Item -LiteralPath $tempBackup -Destination $archiveTarget
  Write-Host "[agents-archive] $archiveTarget"
}

Write-Host "[done] workforce reset complete"
