@echo off
setlocal
cd /d "%~dp0"
title SKITRACK

where node >nul 2>nul
if errorlevel 1 (
  echo Installe Node.js 20 depuis https://nodejs.org puis relance ce fichier.
  pause
  exit /b 1
)

if not exist node_modules\vite\bin\vite.js (
  echo Installation des dependances — une minute...
  call npm install --ignore-scripts
  if errorlevel 1 (
    echo npm install a echoue.
    pause
    exit /b 1
  )
)

if exist node_modules\electron\install.js if not exist node_modules\electron\path.txt (
  echo Telechargement d'Electron — une minute...
  node node_modules\electron\install.js
)

node scripts\electron-dev.mjs
echo.
pause
