/**
 * Portail de fin de tour : `npm run verify` doit passer avant de conclure.
 *
 * ## Pourquoi un hook et pas une consigne
 *
 * `CLAUDE.md` dit « ne déclare jamais terminé sans preuve d'exécution ». C'est
 * une consigne, donc indicative : elle est suivie la plupart du temps, et « la
 * plupart du temps » n'est pas une garantie. Ce script est la version
 * déterministe de la même phrase — il s'exécute, ou le tour ne se termine pas.
 *
 * ## Ce qu'il coûte, et pourquoi il ne coûte presque rien
 *
 * `npm run verify` prend environ sept secondes sur ce dépôt. C'est assez peu
 * pour être bloquant, mais pas assez peu pour être payé sur un tour de
 * conversation où rien n'a été touché. Le script vérifie donc d'abord si le
 * code a bougé :
 *
 *   * quelque chose de non commité sous `src/`, `scripts/`, `package.json` ou
 *     `tsconfig*.json` — ou
 *   * un `HEAD` différent de celui du dernier portail passé.
 *
 * Sinon il rend la main immédiatement. Une question sur le code ne déclenche
 * rien ; une modification, si.
 *
 * ## Sortie
 *
 * `0` — rien à faire, ou portail vert.
 * `2` — portail rouge : la sortie part sur stderr et revient au modèle, qui
 *       doit corriger avant de pouvoir conclure.
 *
 * `stop_hook_active` coupe court : Claude Code le pose quand le tour a déjà été
 * relancé par ce hook. Sans cette garde, un portail qu'on ne sait pas réparer
 * boucle indéfiniment.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const STAMP = join(ROOT, '.claude', '.verify-stamp')

/** Chemins dont un changement justifie de repasser le portail. */
const WATCHED = ['src', 'scripts', 'package.json', 'tsconfig.json', 'tsconfig.web.json', 'tsconfig.node.json']

/** Lit l'enveloppe du hook sur stdin. Un stdin vide ou illisible n'est pas une
 *  erreur : le script doit rester utilisable à la main, sans enveloppe. */
function hookInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf-8') || '{}')
  } catch {
    return {}
  }
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf-8' }).trim()
}

/** Empreinte de l'état du dépôt : le commit, plus ce qui n'est pas commité. */
function fingerprint() {
  const head = git(['rev-parse', 'HEAD'])
  const dirty = git(['status', '--porcelain', '--', ...WATCHED])
  return { head, dirty, key: `${head}\n${dirty}` }
}

const input = hookInput()
// Le tour a déjà été relancé par ce hook : on ne le bloque pas une seconde fois.
if (input.stop_hook_active) process.exit(0)

let state
try {
  state = fingerprint()
} catch {
  // Hors dépôt git, ou git indisponible : on ne sait pas ce qui a changé, donc
  // on ne prétend pas que rien n'a changé.
  state = null
}

if (state) {
  let stamped = ''
  try {
    stamped = readFileSync(STAMP, 'utf-8')
  } catch {
    /* premier passage : pas de tampon */
  }
  // Rien de neuf sous les chemins surveillés depuis le dernier portail vert.
  if (stamped === state.key) process.exit(0)
  if (!state.dirty && stamped.startsWith(state.head)) process.exit(0)
}

const run = spawnSync('npm', ['run', 'verify'], {
  cwd: ROOT,
  encoding: 'utf-8',
  shell: true,
  // Le portail doit être hermétique : un test appelle le réseau quand cette
  // variable est absente, et un portail qui dépend d'une connexion n'est pas un
  // portail, c'est un pari.
  env: { ...process.env, PROVIDERS_OFFLINE: 'true' }
})

if (run.status === 0) {
  if (state) {
    try {
      writeFileSync(STAMP, state.key, 'utf-8')
    } catch {
      /* tampon non écrit : le portail repassera, c'est tout ce qu'on risque */
    }
  }
  process.exit(0)
}

const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim().split('\n')
process.stderr.write(
  'Le portail `npm run verify` échoue — la tâche ne peut pas être déclarée terminée.\n' +
    'Corrige la cause, relance `PROVIDERS_OFFLINE=true npm run verify`, puis conclus.\n\n' +
    // Les quarante dernières lignes : le début d'une sortie npm est du bruit,
    // la cause est toujours en fin de journal.
    output.slice(-40).join('\n') +
    '\n'
)
process.exit(2)
