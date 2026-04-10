param(
  [Parameter(Mandatory = $true)]
  [string]$Prompt,

  [ValidateSet("sd15", "openjourney")]
  [string]$Model = "sd15",

  [string]$NegativePrompt = "",
  [string]$OutputDir = "",
  [int]$Width = 512,
  [int]$Height = 512,
  [int]$Steps = 0,
  [double]$GuidanceScale = -1,
  [int]$Seed = -1,
  [string]$OllamaModel = "qwen2.5:3b",
  [string]$OllamaHost = "http://127.0.0.1:11434",
  [switch]$SkipPromptEnhance,
  [string]$ModelCacheRoot = "D:\AI\ollama-image-models",
  [string]$VenvDir = ""
)

$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $PSCommandPath
if ([string]::IsNullOrWhiteSpace($VenvDir)) {
  $VenvDir = Join-Path $ScriptRoot ".venv"
}
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Join-Path $ScriptRoot "outputs"
}

$Py = Join-Path $VenvDir "Scripts\python.exe"
if (-not (Test-Path $Py)) {
  throw "Missing venv python: $Py. Run setup.ps1 first."
}

$Args = @(
  (Join-Path $ScriptRoot "generate_image.py"),
  "--prompt", $Prompt,
  "--model-alias", $Model,
  "--cache-root", $ModelCacheRoot,
  "--output-dir", $OutputDir,
  "--width", "$Width",
  "--height", "$Height",
  "--seed", "$Seed",
  "--ollama-model", $OllamaModel,
  "--ollama-host", $OllamaHost
)

if (-not [string]::IsNullOrWhiteSpace($NegativePrompt)) {
  $Args += @("--negative-prompt", $NegativePrompt)
}

if ($Steps -gt 0) {
  $Args += @("--steps", "$Steps")
}
if ($GuidanceScale -ge 0) {
  $Args += @("--guidance-scale", "$GuidanceScale")
}
if ($SkipPromptEnhance) {
  $Args += "--skip-prompt-enhance"
}

& $Py @Args
