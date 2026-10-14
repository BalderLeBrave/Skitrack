@echo off
setlocal
set "SKITRACK_BAT=%~f0"
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
rem scripts\mettre-a-jour.mjs. Tout le reste tient dans un seul bloc, que cmd
rem lit en entier avant de l'executer et qu'il quitte par exit /b : ni cette
rem fenetre ni une autre deja ouverte ne relisent ce fichier une fois modifie.
rem Code 3 : la mise a jour a change ce fichier, il se relance une fois.
rem Code 4 : l'installation des dependances a echoue, on s'arrete.
(
  node scripts\mettre-a-jour.mjs
  if errorlevel 4 (
    echo Installation des dependances en echec : fermez SKITRACK puis relancez ce fichier.
    pause
    exit /b 1
  )
  if errorlevel 3 if not "%~1"=="relance" (
    call "%SKITRACK_BAT%" relance
    exit /b
  )
  node scripts\electron-dev.mjs
  echo.
  pause
  exit /b
)
