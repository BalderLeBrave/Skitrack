#!/usr/bin/env node
/**
 * Télécharge le binaire Obscura (v0.2.1) dans vendor/obscura/.
 * https://github.com/h4ckf0r0day/obscura/releases
 */
import { createWriteStream, mkdirSync, existsSync, chmodSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const VERSION = 'v0.2.1'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'vendor', 'obscura')

function asset() {
  const p = process.platform
  const a = process.arch
  if (p === 'win32') return { file: 'obscura-x86_64-windows.zip', bin: 'obscura.exe' }
  if (p === 'darwin' && a === 'arm64') return { file: 'obscura-aarch64-macos.tar.gz', bin: 'obscura' }
  if (p === 'darwin') return { file: 'obscura-x86_64-macos.tar.gz', bin: 'obscura' }
  if (a === 'arm64') return { file: 'obscura-aarch64-linux.tar.gz', bin: 'obscura' }
  return { file: 'obscura-x86_64-linux.tar.gz', bin: 'obscura' }
}

/**
 * Extrait l'archive.
 *
 * `unzip` n'existe pas sur Windows. Il est là sous Git Bash, dans `/usr/bin`,
 * mais un script npm passe par `cmd.exe` : le PATH de Git Bash n'y est pas, et
 * l'appel échouait après avoir téléchargé 72 Mo — archive sur le disque,
 * binaire absent, et un message qui ne disait pas pourquoi.
 *
 * Windows 10+ livre bsdtar en `System32\tar.exe`, qui lit le zip aussi bien
 * que le tar.gz. On l'essaie d'abord ; `Expand-Archive` sert de repli si le
 * poste est plus ancien. Ailleurs, `unzip` et GNU tar comme avant.
 */
function extract(archive) {
  if (archive.endsWith('.zip')) {
    if (process.platform === 'win32') {
      try {
        execFileSync('tar', ['-xf', archive, '-C', OUT], { stdio: 'inherit' })
        return
      } catch {
        execFileSync(
          'powershell',
          ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${OUT}' -Force`],
          { stdio: 'inherit' }
        )
        return
      }
    }
    execFileSync('unzip', ['-o', archive, '-d', OUT], { stdio: 'inherit' })
    return
  }
  execFileSync('tar', ['--no-same-owner', '-xzf', archive, '-C', OUT], { stdio: 'inherit' })
}

const { file, bin } = asset()
const dest = join(OUT, bin)
if (existsSync(dest) && !process.argv.includes('--force')) {
  console.log('déjà présent', dest)
  process.exit(0)
}

mkdirSync(OUT, { recursive: true })
const archive = join(OUT, file)
const url = `https://github.com/h4ckf0r0day/obscura/releases/download/${VERSION}/${file}`

// Une extraction ratée laissait l'archive sur le disque et faisait re-télécharger
// 72 Mo au lancement suivant. Si elle est déjà là, on reprend à l'extraction.
if (existsSync(archive) && !process.argv.includes('--force')) {
  console.log('archive déjà téléchargée', archive)
} else {
  console.log('GET', url)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) {
    console.error('échec', res.status, url)
    process.exit(1)
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(archive))
}

extract(archive)

// Sans ce contrôle, le script annonçait « ok » sur un extracteur qui n'avait
// rien produit : `shouldUseObscura()` repartait alors sur Chromium en silence.
if (!existsSync(dest)) {
  console.error('échec : archive extraite mais', dest, 'introuvable')
  process.exit(1)
}

try {
  chmodSync(dest, 0o755)
  const worker = join(OUT, process.platform === 'win32' ? 'obscura-worker.exe' : 'obscura-worker')
  if (existsSync(worker)) chmodSync(worker, 0o755)
} catch {
  /* windows */
}
console.log('ok', dest)
