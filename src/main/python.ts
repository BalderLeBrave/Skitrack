import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

/**
 * Localisation de l'interpréteur Python du sidecar.
 *
 * Ordre de recherche, du plus spécifique au plus général :
 *
 * 1. `SKITRACK_PYTHON` — échappatoire explicite (CI, installation exotique).
 * 2. L'environnement virtuel du projet, `sidecar/.venv` — le cas normal en
 *    développement, créé par `scripts/bootstrap.ps1`.
 * 3. Le binaire embarqué dans l'application packagée (`resources/sidecar/`).
 * 4. `python` du PATH — dernier recours, avec un avertissement : sous Windows,
 *    `python` est souvent l'alias du Microsoft Store qui n'exécute rien.
 */
export interface PythonResolution {
  command: string
  args: string[]
  cwd: string
  source: 'env' | 'venv' | 'bundled' | 'path'
  warning?: string
}

function projectRoot(): string {
  // En dev, __dirname pointe vers out/main ; le projet est deux niveaux au-dessus.
  return app.isPackaged ? process.resourcesPath : join(__dirname, '..', '..')
}

/**
 * Extrait le chemin du Python de base d'un `pyvenv.cfg`. **Pure**, testable.
 *
 * Un venv Windows ne contient pas d'interpréteur : `Scripts\python.exe` est un
 * aiguilleur qui lit la ligne `home = …` de ce fichier et délègue au Python qui
 * a servi à créer l'environnement. Si ce Python a été désinstallé ou mis à jour
 * (3.12 → 3.13 change le dossier d'installation), l'aiguilleur échoue avec
 * `No Python at '…'` — le venv existe toujours sur le disque, mais il est mort.
 */
export function venvHome(pyvenvCfg: string): string | null {
  const match = pyvenvCfg.match(/^\s*home\s*=\s*(.+?)\s*$/m)
  return match ? match[1] : null
}

/**
 * Vérifie qu'un venv est encore vivant : son `pyvenv.cfg` doit pointer vers un
 * dossier qui contient toujours `python.exe`. Renvoie un message d'alerte si le
 * Python de base a disparu, `null` si tout va bien ou si on ne peut pas savoir
 * (fichier absent ou illisible — on laisse alors le lancement trancher).
 */
function venvStaleWarning(venvDir: string): string | null {
  const cfgPath = join(venvDir, 'pyvenv.cfg')
  if (!existsSync(cfgPath)) return null
  try {
    const home = venvHome(readFileSync(cfgPath, 'utf-8'))
    if (!home) return null
    if (existsSync(join(home, 'python.exe')) || existsSync(join(home, 'python3.exe'))) return null
    return (
      `L'environnement virtuel du sidecar a été créé avec un Python qui n'existe plus ` +
      `(${home}). Supprimez sidecar\\.venv puis relancez \`npm run bootstrap\`.`
    )
  } catch {
    return null
  }
}

export function resolvePython(): PythonResolution {
  const root = projectRoot()

  const override = process.env.SKITRACK_PYTHON
  if (override && existsSync(override)) {
    return {
      command: override,
      args: ['-m', 'skitrack'],
      cwd: join(root, 'sidecar'),
      source: 'env'
    }
  }

  const venvDir = join(root, 'sidecar', '.venv')
  const venvPython = join(venvDir, 'Scripts', 'python.exe')
  if (existsSync(venvPython)) {
    return {
      command: venvPython,
      args: ['-m', 'skitrack'],
      cwd: join(root, 'sidecar'),
      source: 'venv',
      // Détecté AVANT le lancement : un venv dont le Python de base a disparu
      // échouera de toute façon, mais avec un message cryptique. Autant le dire
      // clairement, dès l'écran Réglages, sans attendre l'échec du handshake.
      warning: venvStaleWarning(venvDir) ?? undefined
    }
  }

  const bundled = join(root, 'sidecar', 'skitrack-sidecar.exe')
  if (existsSync(bundled)) {
    return { command: bundled, args: [], cwd: join(root, 'sidecar'), source: 'bundled' }
  }

  return {
    command: 'python',
    args: ['-m', 'skitrack'],
    cwd: join(root, 'sidecar'),
    source: 'path',
    warning:
      "Aucun environnement virtuel trouvé dans sidecar\\.venv. L'application " +
      'tente `python` du PATH, qui sous Windows 11 est souvent le raccourci ' +
      'Microsoft Store et ne démarrera pas. Lancez `npm run bootstrap`.'
  }
}
