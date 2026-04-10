# Ollama + Local Image Generation (PowerShell)

## 1) Setup (one-time)

```powershell
cd D:\Donggri_Platform\DonggriCompany
powershell -ExecutionPolicy Bypass -File .\tools\ollama-image-local\setup.ps1 -ModelCacheRoot "D:\AI\ollama-image-models"
```

## 2) Generate image

### Quality-focused (SD 1.5)

```powershell
cd D:\Donggri_Platform\DonggriCompany
powershell -ExecutionPolicy Bypass -File .\tools\ollama-image-local\generate.ps1 `
  -Prompt "portrait photo of a korean man, natural skin, 35mm lens" `
  -Model sd15 `
  -Width 512 -Height 512 -Steps 20
```

### Stylized (OpenJourney)

```powershell
cd D:\Donggri_Platform\DonggriCompany
powershell -ExecutionPolicy Bypass -File .\tools\ollama-image-local\generate.ps1 `
  -Prompt "fantasy city in the sky, detailed matte painting" `
  -Model openjourney `
  -Width 512 -Height 512 -Steps 20
```

## 3) Model options

- `sd15`
- `openjourney`

## 4) Notes for GTX 1660 Ti (6GB)

- Recommended resolution: `512x512` (or lower for faster speed).
- If Ollama prompt rewrite is not needed:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\ollama-image-local\generate.ps1 `
  -Prompt "cinematic street at night" `
  -Model sd15 `
  -SkipPromptEnhance
```

- Output images are saved to:
  - `D:\Donggri_Platform\DonggriCompany\tools\ollama-image-local\outputs`
