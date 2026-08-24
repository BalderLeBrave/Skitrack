# Prépare l'environnement Python du sidecar (Windows 11).
#
#   npm run bootstrap
#
# Crée sidecar\.venv, y installe les dépendances, puis vérifie que le paquet
# `skitrack` s'importe. C'est ce venv que le shell Electron cherche en premier.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$sidecar = Join-Path $root 'sidecar'
$venv = Join-Path $sidecar '.venv'
$venvPython = Join-Path $venv 'Scripts\python.exe'

# Sonde un interpreteur candidat et rend sa version, ou $null s'il ne convient
# pas. Sous PowerShell 5.1, rediriger le flux d'erreur d'un .exe emballe chaque
# ligne dans un ErrorRecord ; combine au $ErrorActionPreference='Stop' de
# l'en-tete, un candidat qui echoue devient une erreur bloquante au lieu de
# rendre la main au suivant. C'est exactement ce qui arrive quand `py` pointe
# encore vers un Python desinstalle. On neutralise donc l'arret sur erreur le
# temps de la sonde, et on capture tout dans un try/catch : un candidat mort
# doit mener au candidat suivant, jamais a l'arret du script.
function Get-PythonVersion {
    param([string]$Command, [string[]]$Arguments = @())
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $probe = $Arguments + @('-c', "import sys; print('%d.%d' % sys.version_info[:2])")
        $out = & $Command @probe 2>&1
        if ($LASTEXITCODE -ne 0) { return $null }
        $text = ($out | Select-Object -Last 1 | Out-String).Trim()
        if ($text -notmatch '^(\d+\.\d+)') { return $null }
        if ([version]$matches[1] -lt [version]'3.11') { return $null }
        return $matches[1]
    } catch {
        return $null
    } finally {
        $ErrorActionPreference = $prev
    }
}

function Find-Python {
    # `py -3` est le lanceur officiel : il evite l'alias Microsoft Store qui
    # ouvre le Store au lieu d'executer Python. Mais son defaut peut designer
    # une version desinstallee : on le sonde, on ne le croit pas sur parole.
    $launcher = Get-Command 'py' -ErrorAction SilentlyContinue
    if ($launcher) {
        $version = Get-PythonVersion -Command 'py' -Arguments @('-3')
        if ($version) { return @{ Command = 'py'; Args = @('-3') ; Version = $version } }
    }

    $direct = Get-Command 'python' -ErrorAction SilentlyContinue
    if ($direct) {
        # L'alias du Store vit dans WindowsApps et n'execute rien d'utile.
        if ($direct.Source -notlike '*WindowsApps*') {
            $version = Get-PythonVersion -Command 'python'
            if ($version) { return @{ Command = 'python'; Args = @(); Version = $version } }
        }
    }

    # Dernier recours : demander au lanceur ce qu'il connait et essayer chaque
    # version explicitement, de la plus recente a la plus ancienne. Utile quand
    # seul le defaut du lanceur est casse et qu'aucun `python` n'est au PATH.
    if ($launcher) {
        $listed = @()
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try { $listed = & py -0p 2>&1 } catch { $listed = @() } finally { $ErrorActionPreference = $prev }
        $tags = @()
        foreach ($line in $listed) {
            $found = [regex]::Match(($line | Out-String), '-V:(\d+\.\d+)')
            if ($found.Success) { $tags += $found.Groups[1].Value }
        }
        $tags = $tags | Select-Object -Unique | Sort-Object { [version]$_ } -Descending
        foreach ($tag in $tags) {
            $version = Get-PythonVersion -Command 'py' -Arguments @("-$tag")
            if ($version) { return @{ Command = 'py'; Args = @("-$tag") ; Version = $version } }
        }
    }

    return $null
}

# Note : ce fichier reste volontairement en ASCII pur pour les messages console.
# PowerShell 5.1 (celui livre avec Windows 11) lit un .ps1 UTF-8 sans BOM comme
# de l'ANSI et afficherait des caracteres accentues corrompus.
Write-Host '=== SKITRACK - preparation du sidecar Python ===' -ForegroundColor Cyan

$python = Find-Python
if (-not $python) {
    Write-Host ''
    Write-Host 'Python 3.11 ou plus recent est introuvable.' -ForegroundColor Red
    Write-Host ''
    Write-Host 'Installez-le, puis relancez `npm run bootstrap` :'
    Write-Host '  winget install --id Python.Python.3.12 --source winget'
    Write-Host '  (ou https://www.python.org/downloads/windows/ en cochant'
    Write-Host '   "Add python.exe to PATH")'
    Write-Host ''
    Write-Host 'Note : la commande `python` fournie par defaut sur Windows 11 est'
    Write-Host 'un raccourci vers le Microsoft Store et ne convient pas.'
    Write-Host 'Apres installation, OUVREZ UN NOUVEAU TERMINAL (le PATH n est pas'
    Write-Host 'rafraichi dans une session deja ouverte).'
    exit 1
}

Write-Host "Python detecte : $($python.Version)" -ForegroundColor Green

if (Test-Path $venvPython) {
    # Un venv Windows ne contient pas d'interpreteur : Scripts\python.exe est un
    # aiguilleur vers le Python de base note dans pyvenv.cfg. Si ce Python a ete
    # desinstalle ou mis a jour (3.12 -> 3.13 change le dossier), le venv existe
    # sur le disque mais ne demarre plus ("No Python at ..."). On le teste donc
    # reellement au lieu de croire le systeme de fichiers, et on le recree si
    # necessaire au lieu d echouer trois lignes plus bas sur pip.
    #
    # Le lanceur de venv ecrit son "No Python at ..." sur le flux d'erreur natif
    # de Windows, que `*> $null` seul n'avale pas toujours ; combine a
    # $ErrorActionPreference='Stop' en tete de fichier, cela peut promouvoir ce
    # message en erreur bloquante. On neutralise donc l'arret sur erreur LE TEMPS
    # de la sonde, et on capture tout dans un try/catch : un venv mort doit mener
    # a sa recreation, jamais a l'arret du script.
    $venvOk = $false
    try {
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & $venvPython --version 2>&1 | Out-Null
        $venvOk = ($LASTEXITCODE -eq 0)
    } catch {
        $venvOk = $false
    } finally {
        $ErrorActionPreference = $prev
    }

    if (-not $venvOk) {
        Write-Host 'Environnement virtuel casse (le Python qui l a cree a disparu). Recreation...' -ForegroundColor Yellow
        Remove-Item -Recurse -Force $venv
    } else {
        Write-Host 'Environnement virtuel deja present et fonctionnel.'
    }
}

if (-not (Test-Path $venvPython)) {
    Write-Host "Creation de l'environnement virtuel dans $venv"
    & $python.Command @($python.Args + @('-m', 'venv', $venv))
    if ($LASTEXITCODE -ne 0) { throw "Echec de la creation du venv" }
}

Write-Host 'Mise a jour de pip...'
& $venvPython -m pip install --upgrade pip --quiet
if ($LASTEXITCODE -ne 0) { throw 'Echec de la mise a jour de pip' }

Write-Host 'Installation des dependances...'
# --prefer-binary : sous un Python tres recent (ex. 3.14), pip peut voir une
# version sans roue et tenter de la compiler depuis les sources, ce qui echoue
# sur un poste Windows sans Rust/C++. On privilegie donc les roues. Si l'echec
# survient malgre tout, le message ci-dessous oriente vers la vraie cause.
& $venvPython -m pip install -r (Join-Path $sidecar 'requirements-dev.txt') --quiet --prefer-binary
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host 'Echec de l installation des dependances.' -ForegroundColor Red
    Write-Host 'Cause la plus frequente sous un Python tres recent (3.14+) : une'
    Write-Host 'dependance binaire (pydantic-core, shapely) n a pas encore de roue'
    Write-Host 'pour cette version, et pip tente de la compiler sans compilateur.'
    Write-Host ''
    Write-Host 'Solution simple : installez Python 3.12 (le mieux teste) en parallele,'
    Write-Host '  winget install --id Python.Python.3.12 --source winget'
    Write-Host 'puis forcez le bootstrap a l utiliser :'
    Write-Host '  Remove-Item -Recurse -Force sidecar\.venv'
    Write-Host '  py -3.12 -m venv sidecar\.venv ; npm run bootstrap'
    throw 'Echec de l installation des dependances'
}

Write-Host 'Installation du paquet skitrack en mode editable...'
& $venvPython -m pip install -e $sidecar --quiet --no-deps
if ($LASTEXITCODE -ne 0) { throw 'Echec de l installation du paquet' }

Write-Host 'Verification...'
& $venvPython -c "import skitrack, fastapi, sqlalchemy, ijson, shapely; print('OK', skitrack.__version__)"
if ($LASTEXITCODE -ne 0) { throw 'Le paquet skitrack ne s importe pas' }

Write-Host ''
Write-Host 'Sidecar pret.' -ForegroundColor Green
Write-Host 'Navigateur scrape : Firefox (defaut). Obscura : npm run obscura:fetch puis SKITRACK_BROWSER=obscura (opt-in, 0/104 au sweep 2026-08-24)'
Write-Host 'Etapes suivantes :'
Write-Host '  npm run sidecar:test     # suite de tests Python'
Write-Host '  npm run dev              # lancer l application'
