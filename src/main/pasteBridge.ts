/**
 * Réception directe des relevés du marque-page.
 *
 * ## Pourquoi ce petit serveur
 *
 * Le marque-page Airbnb collecte ce que la page affiche, puis doit le remettre à
 * SKITRACK. Passer par le presse-papiers marche, mais oblige l'utilisateur à
 * revenir dans l'application pour déclencher l'import. En ouvrant une toute
 * petite oreille locale, le marque-page dépose directement sa moisson : les prix
 * apparaissent à l'instant du clic, sans changer de fenêtre.
 *
 * Ce que ça ne change **pas** : c'est toujours l'utilisateur qui ouvre la page
 * Airbnb et clique le marque-page. L'application n'émet aucune requête vers
 * Airbnb ; elle se contente de recevoir ce qu'on lui apporte.
 *
 * ## Les précautions prises
 *
 * * **Écoute sur 127.0.0.1 uniquement** : rien n'est joignable depuis le réseau.
 * * **Port fixe** : le marque-page est installé une fois pour toutes et doit
 *   continuer à fonctionner après un redémarrage, ce qu'un port aléatoire
 *   interdirait.
 * * **Jeton d'appairage dans l'URL** : un port local ouvert est joignable par
 *   n'importe quelle page web du navigateur. Le jeton, tiré au sort à la
 *   première utilisation et conservé dans le dossier utilisateur, fait que seule
 *   *votre* copie du marque-page est acceptée. Comparaison en temps constant.
 * * **Corps `text/plain` et réponse opaque** : la requête reste « simple » au
 *   sens CORS (aucune requête préliminaire), et le navigateur ne peut rien lire
 *   de la réponse. Une page tierce ne peut donc pas se servir de ce point
 *   d'entrée pour sonder la machine.
 * * **Taille plafonnée** : un corps trop gros est rejeté avant lecture complète.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, type BrowserWindow } from 'electron'

/** Port d'écoute. Fixe pour que le marque-page installé reste valable. */
export const PASTE_PORT = 47653

/** Au-delà, ce n'est plus un relevé de page mais un abus : on coupe. */
const MAX_BODY_BYTES = 4 * 1024 * 1024

let server: Server | null = null
let pairingToken = ''

/** Chemin du jeton d'appairage, dans le dossier de données de l'application. */
function tokenPath(): string {
  return join(app.getPath('userData'), 'paste-pairing.token')
}

/**
 * Jeton d'appairage, créé au premier appel puis réutilisé.
 *
 * Il doit survivre aux redémarrages : le marque-page l'embarque dans son URL, et
 * en changer obligerait l'utilisateur à le réinstaller à chaque lancement.
 */
export function getPairingToken(): string {
  if (pairingToken) return pairingToken
  const file = tokenPath()
  try {
    if (existsSync(file)) {
      const saved = readFileSync(file, 'utf-8').trim()
      if (saved.length >= 32) {
        pairingToken = saved
        return pairingToken
      }
    }
  } catch {
    // Fichier illisible : on en régénère un plutôt que d'échouer.
  }
  pairingToken = randomBytes(24).toString('hex')
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, pairingToken, { encoding: 'utf-8', mode: 0o600 })
  } catch {
    // Sans persistance, le jeton vaudra pour cette session seulement.
  }
  return pairingToken
}

/** Comparaison en temps constant, longueurs différentes comprises. */
function tokenMatches(supplied: string): boolean {
  const expected = getPairingToken()
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Démarre l'oreille locale. Le contenu reçu est transmis au renderer par
 * l'événement `airbnb:paste`, qui déclenche la fusion habituelle.
 */
export function startPasteBridge(getWindow: () => BrowserWindow | null): void {
  if (server) return

  server = createServer((req, res) => {
    // Réponse volontairement muette : le marque-page l'ignore (mode `no-cors`)
    // et une page tierce ne doit rien pouvoir déduire.
    const end = (status: number): void => {
      res.statusCode = status
      res.setHeader('Content-Type', 'text/plain')
      res.end('')
    }

    if (req.method !== 'POST') return end(405)

    const match = (req.url ?? '').match(/^\/paste\/([a-f0-9]{32,})$/i)
    if (!match || !tokenMatches(match[1])) return end(404)

    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8')
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('airbnb:paste', body)
        // La fenêtre passe devant : l'utilisateur voit le résultat arriver.
        if (win.isMinimized()) win.restore()
        win.focus()
      }
      end(204)
    })
    req.on('error', () => end(400))
  })

  server.on('error', () => {
    // Port déjà pris (une autre instance ?) : on renonce silencieusement, le
    // presse-papiers reste le chemin de repli.
    server = null
  })

  server.listen(PASTE_PORT, '127.0.0.1')
}

export function stopPasteBridge(): void {
  server?.close()
  server = null
}
