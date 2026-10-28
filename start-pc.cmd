@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 or newer.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
echo Reels Desk PC - keep this window open while scheduled jobs are pending.
echo Open the APP_URL configured in .env in your browser. Default: http://localhost:3000
call npm start
pause
