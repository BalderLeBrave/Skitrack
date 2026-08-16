/**
 * Génère `src/renderer/src/api/types.gen.ts` depuis l'OpenAPI du sidecar.
 *
 * Aucun serveur n'est démarré : on demande à Python de sérialiser le schéma,
 * ce qui rend la génération utilisable en CI et reproductible.
 *
 *   npm run gen:types
 *
 * Le fichier produit est la référence : si `types.ts` (écrit à la main) diverge,
 * c'est `types.gen.ts` qui a raison.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sidecar = join(root, 'sidecar')
const venvPython = join(sidecar, '.venv', 'Scripts', 'python.exe')

if (!existsSync(venvPython)) {
  console.error(
    "sidecar\\.venv est introuvable. Lancez `npm run bootstrap` avant de générer les types."
  )
  process.exit(1)
}

console.log('Extraction du schéma OpenAPI…')
const openapi = execFileSync(venvPython, ['-m', 'skitrack.tools.dump_openapi'], {
  cwd: sidecar,
  encoding: 'utf-8',
  maxBuffer: 32 * 1024 * 1024
})

const schemaPath = join(root, 'openapi.json')
writeFileSync(schemaPath, openapi, 'utf-8')

console.log('Conversion en TypeScript…')
const outPath = join(root, 'src', 'renderer', 'src', 'api', 'types.gen.ts')
mkdirSync(dirname(outPath), { recursive: true })

// On appelle le CLI par son point d'entrée JS plutôt que par `npx` : depuis
// Node 18.20/20.12, `spawnSync` refuse d'exécuter un `.cmd` sans `shell: true`
// (EINVAL), et passer par un shell rendrait les chemins avec espaces fragiles.
const cli = join(root, 'node_modules', 'openapi-typescript', 'bin', 'cli.js')
if (!existsSync(cli)) {
  console.error('openapi-typescript est introuvable. Lancez `npm install`.')
  process.exit(1)
}

execFileSync(process.execPath, [cli, schemaPath, '-o', outPath], {
  cwd: root,
  stdio: 'inherit'
})

console.log(`Écrit : ${outPath}`)
