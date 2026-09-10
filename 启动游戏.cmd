@echo off
cd /d "%~dp0"
if not exist node_modules (
  call npm.cmd install
  if errorlevel 1 exit /b 1
)
call npm.cmd run dev
if errorlevel 1 (
  pause
  exit /b 1
)
start "" "http://127.0.0.1:4322/"
