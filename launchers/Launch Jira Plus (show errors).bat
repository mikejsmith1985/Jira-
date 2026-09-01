@echo off
:: Launch Jira Plus (show errors).bat — the same thing, with the window visible.
::
:: Most people should double-click "Launch Jira Plus.vbs", which starts hidden and
:: opens the browser for them. This file exists for the moment that one does not
:: work: it resolves the same version pointer and runs the same program with the
:: console left open, so whatever went wrong can be read by the person it went
:: wrong for, or pasted to a help desk.
::
:: Close this window to stop Jira+.

setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "CURRENT_POINTER=current.txt"
set "VERSIONS_DIR=versions"
set "PAYLOAD_EXE=jiraplus.exe"
set "SELECTED_VERSION="
set "PAYLOAD_PATH="

if exist "%CURRENT_POINTER%" (
    set /p SELECTED_VERSION=<"%CURRENT_POINTER%"
)

if defined SELECTED_VERSION (
    set "CANDIDATE_PATH=%VERSIONS_DIR%\!SELECTED_VERSION!\%PAYLOAD_EXE%"
    if exist "!CANDIDATE_PATH!" set "PAYLOAD_PATH=!CANDIDATE_PATH!"
)

:: The pointer is missing or names a version that is not here. Take the highest
:: installed one and repair the pointer, so a half-finished update leaves a
:: working application rather than none.
if not defined PAYLOAD_PATH (
    set "SELECTED_VERSION="
    for /d %%D in ("%VERSIONS_DIR%\*") do (
        if exist "%%~fD\%PAYLOAD_EXE%" (
            set "CANDIDATE_VERSION=%%~nxD"
            call :SelectHigherVersion "!CANDIDATE_VERSION!" "!SELECTED_VERSION!"
            if "!SHOULD_SELECT_VERSION!"=="1" (
                set "SELECTED_VERSION=!CANDIDATE_VERSION!"
                set "PAYLOAD_PATH=%%~fD\%PAYLOAD_EXE%"
            )
        )
    )
    if defined SELECTED_VERSION >"%CURRENT_POINTER%" echo !SELECTED_VERSION!
)

if not defined PAYLOAD_PATH (
    echo.
    echo   Jira+ could not find its program files.
    echo.
    echo   Expected current.txt and %VERSIONS_DIR%\^<version^>\%PAYLOAD_EXE% in:
    echo   %CD%
    echo.
    echo   Extract the whole zip to one folder and try again - the launcher and
    echo   the versions folder have to stay together.
    echo.
    pause
    exit /b 1
)

echo.
echo   Starting Jira+ from: %PAYLOAD_PATH%
echo   Then open http://localhost:5556 in your browser.
echo   Close this window to stop it.
echo.

"%PAYLOAD_PATH%"
echo.
echo   Jira+ has stopped. Anything printed above is the reason.
pause
exit /b %ERRORLEVEL%

:: Compares by version NUMBER rather than by folder timestamp, because an update
:: copied later is not necessarily a later version.
:SelectHigherVersion
set "CANDIDATE_VERSION_VALUE=%~1"
set "CURRENT_BEST_VERSION_VALUE=%~2"
set "SHOULD_SELECT_VERSION=0"
if not defined CURRENT_BEST_VERSION_VALUE (
    set "SHOULD_SELECT_VERSION=1"
    exit /b 0
)
call :ReadVersionParts "%CANDIDATE_VERSION_VALUE%" CANDIDATE_MAJOR CANDIDATE_MINOR CANDIDATE_PATCH
call :ReadVersionParts "%CURRENT_BEST_VERSION_VALUE%" CURRENT_MAJOR CURRENT_MINOR CURRENT_PATCH
if %CANDIDATE_MAJOR% GTR %CURRENT_MAJOR% set "SHOULD_SELECT_VERSION=1"
if %CANDIDATE_MAJOR% LSS %CURRENT_MAJOR% exit /b 0
if %CANDIDATE_MINOR% GTR %CURRENT_MINOR% set "SHOULD_SELECT_VERSION=1"
if %CANDIDATE_MINOR% LSS %CURRENT_MINOR% exit /b 0
if %CANDIDATE_PATCH% GTR %CURRENT_PATCH% set "SHOULD_SELECT_VERSION=1"
exit /b 0

:ReadVersionParts
set "VERSION_TEXT=%~1"
set "VERSION_TEXT=%VERSION_TEXT:v=%"
for /f "tokens=1-3 delims=." %%A in ("%VERSION_TEXT%") do (
    set "%~2=%%A"
    set "%~3=%%B"
    set "%~4=%%C"
)
if not defined %~2 set "%~2=0"
if not defined %~3 set "%~3=0"
if not defined %~4 set "%~4=0"
exit /b 0
