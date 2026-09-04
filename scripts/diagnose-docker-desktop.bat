@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul

set "TASK_SCRIPT=%~dp0diagnose-docker-desktop.mjs"
set "TASK_EXIT=1"
set "TASK_MODE=live"

if not exist "%TASK_SCRIPT%" (
  echo {"schema_version":"1.0.0","mode":"live","state":"diagnostic_error","read_only":true,"mutations_performed":[],"error":{"code":"SCRIPT_NOT_FOUND","message":"Docker Desktop diagnostic script was not found."}}
  goto :finish
)

if "%~1"=="" goto :run
if /i "%~1"=="--self-test" if "%~2"=="" (
  set "TASK_MODE=self-test"
  goto :run
)

echo {"schema_version":"1.0.0","mode":"live","state":"diagnostic_error","read_only":true,"mutations_performed":[],"error":{"code":"INVALID_ARGUMENT","message":"BAT wrapper accepts no arguments or --self-test."}}
goto :finish

:run
if "%TASK_MODE%"=="self-test" (
  node "%TASK_SCRIPT%" --self-test
) else (
  node "%TASK_SCRIPT%"
)
set "TASK_EXIT=%ERRORLEVEL%"

:finish
1>&2 echo [Docker Desktop diagnostic] exit=%TASK_EXIT%
endlocal & exit /b %TASK_EXIT%
