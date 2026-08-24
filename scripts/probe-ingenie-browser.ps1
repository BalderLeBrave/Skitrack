# A/B Chromium / Firefox / Obscura sur la homepage 2 Alpes (Windows).
#
#   npm run scrape:probe-browser:win
#   powershell -ExecutionPolicy Bypass -File scripts\probe-ingenie-browser.ps1
#
# GET / seulement (robots.txt interdit /*?cid=* et /*?action=*).
# Ne remplit pas le formulaire, n'appelle pas searchAjax.
#
# ASCII volontaire : PowerShell 5.1 lit un .ps1 UTF-8 sans BOM comme de l'ANSI.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host '=== SKITRACK - probe moteurs (2 Alpes homepage) ===' -ForegroundColor Cyan

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host 'Node.js introuvable. Installez-le puis relancez.' -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $root 'node_modules\playwright'))) {
    Write-Host 'playwright manquant. Lancez d abord `npm install`.' -ForegroundColor Red
    exit 1
}

$installFf = $args -contains '-InstallFirefox' -or $args -contains '--install-firefox'
if ($installFf) {
    Write-Host 'npx playwright install firefox ...'
    & npx --yes playwright install firefox
    if ($LASTEXITCODE -ne 0) { throw 'Echec playwright install firefox' }
}

$probe = Join-Path $root 'tools\probe-ingenie-browser.mjs'
if (-not (Test-Path $probe)) { throw "Fichier manquant : $probe" }

Write-Host 'Lancement Chromium / Firefox / Obscura ...'
$raw = & node $probe 2>&1
$code = $LASTEXITCODE
Write-Host ''

foreach ($line in $raw) {
    $text = "$line"
    if ($text -notmatch '^\s*\{') {
        Write-Host $text
        continue
    }
    try {
        $row = $text | ConvertFrom-Json
    } catch {
        Write-Host $text
        continue
    }
    $name = $row.name
    if ($row.ok) {
        Write-Host ("  OK  {0,-10}  datedeb={1}  {2} ms  HTTP {3}" -f $name, $row.datedebTag, $row.ms, $row.status) -ForegroundColor Green
    } else {
        $err = "$($row.err)"
        if ($err.Length -gt 160) { $err = $err.Substring(0, 160) }
        Write-Host ("  KO  {0,-10}  {1}" -f $name, $err) -ForegroundColor Yellow
    }
}

Write-Host ''
if ($code -ne 0) {
    Write-Host 'Chromium n a pas vu le formulaire. Le defaut Skitrack est casse.' -ForegroundColor Red
    exit $code
}
Write-Host 'Moteurs Skitrack : Firefox defaut. Obscura opt-in (SKITRACK_BROWSER=obscura,' -ForegroundColor Green
Write-Host '0/104 au sweep du 2026-08-24). Chromium force par SKITRACK_BROWSER=chromium.'
Write-Host 'Firefox absent ? npx playwright install firefox'
Write-Host 'Ce probe ne voit que la homepage : le sweep (npm run centrales:sweep) fait foi.'
Write-Host 'Comparer les ms au-dessus, pas les promesses : un seul tour ne prouve rien,'
Write-Host 'relancer 3 fois avant de conclure quoi que ce soit sur la vitesse.'
exit 0
