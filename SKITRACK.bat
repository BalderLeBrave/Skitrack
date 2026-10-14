@echo off
setlocal
cd /d "%~dp0"
title SKITRACK

where node >nul 2>nul
if errorlevel 1 (
  echo Installe Node.js 24 ^(22.12 au minimum^) depuis https://nodejs.org puis relance ce fichier.
  pause
  exit /b 1
)

rem Met le dossier a jour depuis GitHub (avance rapide seulement, sans toucher
rem aux modifications locales) et reinstalle les dependances si besoin :
rem scripts\mettre-a-jour.mjs. Un seul bloc, que cmd lit en entier avant de
rem l'executer : si la mise a jour a change ce fichier, il se relance au lieu
rem de le relire en cours de route.
(
  node scripts\mettre-a-jour.mjs
  if errorlevel 3 "%~f0"
)

node scripts\electron-dev.mjs
echo.
pause
