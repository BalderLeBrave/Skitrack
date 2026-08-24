#!/usr/bin/env node
/**
 * Télécharge le binaire Obscura (v0.2.1) dans vendor/obscura/.
 * https://github.com/h4ckf0r0day/obscura/releases
 */
import { createWriteStream, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const VERSION = 'v0.2.1'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'vendor', 'obscura')

function asset(): { file: string; bin: string } {
  const p = process.platform
  const a = process.arch
  if (p === 'win32') return { file: 'obscura-x86_64-windows.zip', bin: 'obscura.exe' }
  if (p === 'darwin' && a === 'arm64') return { file: 'obscura-aarch64-macos.tar.gz', bin: 'obscura' }
  if (p === 'darwin') return { file: 'obscura-x86_64-macos.tar.gz', bin: 'obscura' }
  if (a === 'arm64') return { file: 'obscura-aarch64-linux.tar.gz', bin: 'obscura' }
  return { file: 'obscura-x86_64-linux.tar.gz', bin: 'obscura' }
}

const { file, bin } = asset()
const dest = join(OUT, bin)
if (existsSync(dest) && !process.argv.includes('--force')) {
  console.log('déjà présent', dest)
  process.exit(0)
}

mkdirSync(OUT, { recursive: true })
const url = `https://github.com/h4ckf0r0day/obscura/releases/download/${VERSION}/${file}`
console.log('GET', url)
const res = await fetch(url, { redirect: 'follow' })
if (!res.ok) {
  console.error('échec', res.status, url)
  process.exit(1)
}
const archive = join(OUT, file)
await pipeline(Readable.fromWeb(res.body), createWriteStream(archive))
if (file.endsWith('.zip')) {
  execFileSync('unzip', ['-o', archive, '-d', OUT], { stdio: 'inherit' })
} else {
  execFileSync('tar', ['-xzf', archive, '-C', OUT], { stdio: 'inherit' })
}
console.log('ok', dest)
