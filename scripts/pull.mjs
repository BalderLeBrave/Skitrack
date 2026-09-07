#!/usr/bin/env node
/**
 * Une commande : git pull + npm install + Chrome OS + clones + venv.
 *
 *   npm run pull
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function run(cmd, args) {
  console.log('+', cmd, args.join(' '))
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: root,
    shell: process.platform === 'win32',
    env: { ...process.env, SKITRACK_SKIP_SCRAPE_SETUP: '' }
  })
  if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1)
}

run('git', ['pull', '--ff-only', 'origin', 'master'])
run('npm', ['install'])
run(process.execPath, [join(root, 'scripts/setup-scrapers.mjs')])
console.log('pret — Chrome, clones et venv Booking sont locaux')
