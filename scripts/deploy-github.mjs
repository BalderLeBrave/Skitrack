#!/usr/bin/env node
/**
 * Déploiement vers GitHub via l'API Contents (pas de `git push` local).
 *
 * Prérequis :
 *   export GITHUB_TOKEN=github_pat_…   # fine-grained : Contents Read and write
 *
 * Usage :
 *   node scripts/deploy-github.mjs
 *   node scripts/deploy-github.mjs --dry-run
 *   node scripts/deploy-github.mjs --only src/main/providers/ceto/
 *   node scripts/deploy-github.mjs --message "feat: …"
 *
 * Ne jamais coller le token dans le chat / le code / le dépôt.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..')

const OWNER = process.env.GITHUB_OWNER || 'BalderLeBrave'
const REPO = process.env.GITHUB_REPO || 'Skitrack'
const BRANCH = process.env.GITHUB_BRANCH || 'master'

const DEFAULT_PATHS = [
  'src/main/providers/ceto',
  'src/main/providers/index.ts',
  'src/main/providers/station/station.ts',
  'src/renderer/src/data/runProviderSearch.ts',
  'src/renderer/src/data/deeplinks.ts',
  'docs/diagnostics/sprint1-ceto-status.md',
  'docs/diagnostics/chamonix-orchestra.md',
  'scripts/deploy-github.mjs',
  '.github/workflows/ci.yml'
]

function parseArgs(argv) {
  const out = { dryRun: false, only: null, message: null }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--only') out.only = argv[++i]
    else if (a === '--message') out.message = argv[++i]
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: node scripts/deploy-github.mjs [--dry-run] [--only path] [--message msg]\nEnv: GITHUB_TOKEN (required)`)
      process.exit(0)
    }
  }
  return out
}

function listFiles(relPath) {
  const abs = join(ROOT, relPath)
  if (!existsSync(abs)) {
    console.warn(`skip missing: ${relPath}`)
    return []
  }
  const st = statSync(abs)
  if (st.isFile()) return [relPath]
  const out = []
  for (const name of readdirSync(abs)) {
    if (name === '.cache' || name.startsWith('.')) continue
    out.push(...listFiles(join(relPath, name)))
  }
  return out
}

function collectTargets(opts) {
  if (opts.only) return listFiles(opts.only.replace(/^\.\//, ''))
  const files = []
  for (const p of DEFAULT_PATHS) files.push(...listFiles(p))
  return [...new Set(files)]
}

async function gh(path, { method = 'GET', body } = {}) {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error(
      'GITHUB_TOKEN manquant. Fine-grained PAT (Contents: Read and write) puis:\n  export GITHUB_TOKEN=…'
    )
  }
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'skitrack-deploy',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { message: text }
  }
  if (!res.ok) {
    const err = new Error(`GitHub ${res.status}: ${data.message || text.slice(0, 200)}`)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

async function getSha(filePath) {
  try {
    const data = await gh(
      `/repos/${OWNER}/${REPO}/contents/${filePath}?ref=${encodeURIComponent(BRANCH)}`
    )
    return data.sha
  } catch (e) {
    if (e.status === 404) return null
    throw e
  }
}

async function putFile(filePath, content, message) {
  const sha = await getSha(filePath)
  const body = {
    message,
    content: Buffer.from(content).toString('base64'),
    branch: BRANCH
  }
  if (sha) body.sha = sha
  const data = await gh(`/repos/${OWNER}/${REPO}/contents/${filePath}`, {
    method: 'PUT',
    body
  })
  return data.commit?.sha?.slice(0, 10) || 'ok'
}

async function main() {
  const opts = parseArgs(process.argv)
  const files = collectTargets(opts)
  if (files.length === 0) {
    console.error('Aucun fichier à déployer.')
    process.exit(1)
  }

  console.log(`→ ${OWNER}/${REPO}@${BRANCH} (${files.length} fichier(s))`)
  if (opts.dryRun) {
    for (const f of files) console.log('  dry-run', f)
    return
  }

  const msgBase =
    opts.message || `chore(deploy): sync ${files.length} file(s) ${new Date().toISOString().slice(0, 10)}`

  let ok = 0
  let fail = 0
  for (const filePath of files) {
    const abs = join(ROOT, filePath)
    const content = readFileSync(abs)
    const message = `${msgBase} — ${filePath}`
    try {
      const sha = await putFile(filePath, content, message)
      console.log('OK', filePath, sha)
      ok++
    } catch (e) {
      console.error('ERR', filePath, e.message)
      fail++
      if (e.status === 401 || e.status === 403) {
        console.error('Token refusé. Vérifie Contents: Read and write sur le repo.')
        process.exit(1)
      }
    }
    await new Promise((r) => setTimeout(r, 350))
  }

  console.log(`done ok=${ok} fail=${fail}`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
