#!/usr/bin/env node
/**
 * Après npm install : venv Booking, Chrome de cet OS, clones Git.
 * Non bloquant si Python manque (CI / machine sans scraper).
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const skip = /^(1|true|yes)$/i.test(process.env.SKITRACK_SKIP_SCRAPE_SETUP || '')

const CLONES = [
  {
    url: 'https://github.com/omkarcloud/botasaurus.git',
    dir: join(root, 'scrape/booking/tools/botasaurus')
  },
  {
    url: 'https://github.com/johnbalvin/pyairbnb.git',
    dir: join(root, 'scrape/airbnb/tools/pyairbnb')
  }
]

function run(cmd, args, opts = {}) {
  console.log('+', cmd, args.join(' '))
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32', ...opts })
  return r.status ?? 1
}

function python() {
  if (process.platform === 'win32') {
    const py = spawnSync('py', ['-3', '-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' })
    if (py.status === 0 && py.stdout.trim()) return ['py', '-3']
    return ['python']
  }
  return ['python3']
}

function cloneAll() {
  for (const c of CLONES) {
    if (existsSync(join(c.dir, '.git')) || existsSync(join(c.dir, 'README.md'))) {
      console.log('clone ok', c.dir)
      continue
    }
    mkdirSync(dirname(c.dir), { recursive: true })
    const st = run('git', ['clone', '--depth', '1', c.url, c.dir])
    if (st !== 0) console.warn('clone ignore', c.url)
  }
}

function envExample() {
  const dest = join(root, '.env')
  const src = join(root, '.env.example')
  if (!existsSync(dest) && existsSync(src)) {
    copyFileSync(src, dest)
    console.log('cree .env depuis .env.example — a completer')
  }
}

function main() {
  if (skip) {
    console.log('SKITRACK_SKIP_SCRAPE_SETUP: skip')
    return
  }
  envExample()
  cloneAll()
  const [exe, ...pre] = python()
  const install = join(root, 'scrape/booking/install.py')
  const st = run(exe, [...pre, install])
  if (st !== 0) {
    console.warn('scrapers: Python/Chrome non installes (ok si tu ne lances pas Booking ici)')
    process.exitCode = 0
  }
}

main()
