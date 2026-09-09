@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 22.13 or later is required. & pause & exit /b 1)
if not exist node_modules\ws\package.json call npm ci --ignore-scripts
if errorlevel 1 exit /b 1
if not exist client\dist\index.html call npm run build
if errorlevel 1 exit /b 1
start "" http://127.0.0.1:8178
call npm start
