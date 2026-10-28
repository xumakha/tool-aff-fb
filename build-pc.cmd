@echo off
setlocal
cd /d "%~dp0"
title Build Reels Desk PC
set "NODE_USE_SYSTEM_CA=1"
where node >nul 2>nul
if errorlevel 1 goto missing_node
node -e "if(Number(process.versions.node.split('.')[0]) < 24) process.exit(1)"
if errorlevel 1 goto missing_node
where npm.cmd >nul 2>nul
if errorlevel 1 goto missing_node
echo [1/3] Installing dependencies...
call npm.cmd ci
if errorlevel 1 goto failed
echo [2/3] Running tests...
call npm.cmd test
if errorlevel 1 goto failed
echo [3/3] Building Windows Setup and Portable...
call npm.cmd run build:win
if errorlevel 1 goto failed
echo.
echo Build complete. Your EXE files are in:
echo %CD%\dist
if not defined REELS_BUILD_NO_PAUSE start "" explorer.exe "%CD%\dist"
if not defined REELS_BUILD_NO_PAUSE pause
exit /b 0

:missing_node
echo Install Node.js 24 or newer with npm, then run this file again.
goto failed

:failed
echo.
echo Build failed. Check the error above. Internet access is required for downloads.
if not defined REELS_BUILD_NO_PAUSE pause
exit /b 1
