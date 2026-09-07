/**
 * Vide les caches qui peuvent laisser l'application sur un écran vide.
 *
 * ## Pourquoi ce script existe
 *
 * Le 2026-08-29, l'application démarrait noire à chaque lancement, en
 * développement. La cause : le cache HTTP de Chromium
 * (`%APPDATA%/skitrack/Cache`) portait une entrée **corrompue** pour l'une des
 * 257 photos de station — il servait des octets nuls là où le serveur de
 * développement avait envoyé un module JavaScript valide. Le fichier sur
 * disque était intact et `curl` recevait le bon contenu ; seul le navigateur
 * embarqué voyait des zéros, et le cache survivait aux redémarrages.
 *
 * Les photos sont chargées par un `import.meta.glob` empressé
 * (`components/photos.ts`) : une seule d'entre elles illisible fait échouer le
 * graphe de modules entier, et l'application n'affiche plus rien — sans
 * message, ce qui rend le diagnostic long. D'où ce script, qui rend le remède
 * immédiat.
 *
 *   npm run cache:clear
 *
 * ## Ce qu'il ne touche pas
 *
 * `Local Storage`, `Session Storage` et `Preferences` restent en place : ce
 * sont les réglages, les annonces relevées, les grilles de forfait saisies. Un
 * dépannage ne doit pas coûter les données de l'utilisateur.
 */

import { rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'

/** Dossier de données de l'application Electron, par système. */
function userDataDir() {
  const home = homedir()
  if (platform() === 'win32') return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'skitrack')
  if (platform() === 'darwin') return join(home, 'Library', 'Application Support', 'skitrack')
  return join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'skitrack')
}

const cibles = [
  // Caches du navigateur embarqué : ce sont eux qui portent la corruption.
  join(userDataDir(), 'Cache'),
  join(userDataDir(), 'Code Cache'),
  join(userDataDir(), 'GPUCache'),
  // Cache de transformation du serveur de développement.
  join(process.cwd(), 'node_modules', '.vite'),
  join(process.cwd(), 'node_modules', '.vite-temp')
]

let vides = 0
for (const cible of cibles) {
  let taille = null
  try {
    await stat(cible)
    taille = true
  } catch {
    console.log(`·  ${cible} — absent`)
    continue
  }
  if (taille) {
    try {
      await rm(cible, { recursive: true, force: true })
      console.log(`✓  ${cible} — vidé`)
      vides++
    } catch (err) {
      // Un cache verrouillé signifie que l'application tourne encore : le dire
      // plutôt que d'échouer en silence sur un dépannage.
      console.error(`✗  ${cible} — ${err instanceof Error ? err.message : String(err)}`)
      console.error('   Fermez l’application puis relancez la commande.')
      process.exitCode = 1
    }
  }
}

console.log(
  vides > 0
    ? `\n${vides} cache(s) vidé(s). Réglages, annonces et grilles saisies sont intacts.`
    : '\nRien à vider.'
)
