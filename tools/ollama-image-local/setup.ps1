param(
  [string]$PythonExe = "python",
  [string]$VenvDir = "$PSScriptRoot\.venv",
  [string]$ModelCacheRoot = "D:\AI\ollama-image-models",
  [switch]$SkipModelDownload
)

$ErrorActionPreference = "Stop"

function Invoke-NativeOrThrow {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Command,
    [Parameter(Mandatory = $true)]
    [string]$StepName
  )
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$StepName failed with exit code $LASTEXITCODE"
  }
}

Write-Host "[1/5] Create virtual environment: $VenvDir"
Invoke-NativeOrThrow -StepName "venv create" -Command { & $PythonExe -m venv $VenvDir }

$Py = Join-Path $VenvDir "Scripts\python.exe"
if (-not (Test-Path $Py)) {
  throw "Python venv not created: $Py"
}

Write-Host "[2/5] Upgrade pip/setuptools/wheel"
Invoke-NativeOrThrow -StepName "pip upgrade" -Command { & $Py -m pip install --upgrade pip setuptools wheel }

Write-Host "[3/5] Install PyTorch CUDA 12.1 wheels"
Invoke-NativeOrThrow -StepName "pytorch install" -Command {
  & $Py -m pip install --index-url https://download.pytorch.org/whl/cu121 torch torchvision torchaudio
}

Write-Host "[4/5] Install image generation dependencies"
Invoke-NativeOrThrow -StepName "dependency install" -Command {
  & $Py -m pip install -r (Join-Path $PSScriptRoot "requirements.txt")
}

if (-not $SkipModelDownload) {
  Write-Host "[5/5] Preload models to: $ModelCacheRoot"
  Invoke-NativeOrThrow -StepName "model preload" -Command {
    & $Py (Join-Path $PSScriptRoot "preload_models.py") --cache-root $ModelCacheRoot --models sd15 openjourney
  }
} else {
  Write-Host "[5/5] Skip model download"
}

Write-Host ""
Write-Host "[done] Setup completed."
Write-Host "Run image generation:"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$PSScriptRoot\generate.ps1`" -Prompt `"a cyberpunk cat in neon city`" -Model sd15"
