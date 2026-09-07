/**
 * Fabrique l'icône d'application à partir de `build/icon.html`.
 *
 * ## Pourquoi un script et pas un fichier binaire committé
 *
 * L'icône reprend le logo typographique de l'interface : mêmes lettres, même
 * graisse, mêmes jetons de couleur. Committer un `.ico` opaque, c'est perdre le
 * lien — la marque changerait à l'écran et l'icône resterait celle d'avant, sans
 * que rien ne le signale. Ici la source est une page lisible et modifiable, et
 * le binaire s'en déduit.
 *
 *   npm run icon:build
 *
 * ## Comment
 *
 * Electron ouvre une fenêtre invisible sur la page, la photographie à sept
 * définitions, et les empaquette dans un `.ico`. Aucune dépendance ajoutée :
 * c'est le Chromium déjà présent qui fait le rendu, donc exactement le moteur
 * qui dessine le logo à l'écran.
 *
 * ## Le format ICO, en trois lignes
 *
 * Un en-tête de 6 octets, puis une entrée de 16 octets par image, puis les
 * images bout à bout. Depuis Windows Vista, une entrée peut contenir un PNG
 * tel quel plutôt qu'un bitmap : on s'en tient à ça, c'est plus court et
 * lisible. Une dimension de 256 s'écrit `0` dans l'entrée — le champ ne fait
 * qu'un octet.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { appendFileSync } from 'node:fs'
import { app, BrowserWindow, nativeImage } from 'electron'

/** Trace de fabrication : la sortie standard d'Electron n'est pas fiable sous
 *  Windows quand le script est lancé depuis un tube. */
const trace = (m) => { try { appendFileSync('C:/Dev/skitrack/build/_trace.txt', `${m}
`) } catch {} }

const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const source = join(racine, 'build', 'icon.html')
const sortie = join(racine, 'build')

/** Les définitions que Windows pioche selon le contexte d'affichage. */
const TAILLES = [16, 24, 32, 48, 64, 128, 256]

/**
 * Assemble des PNG en un fichier ICO.
 *
 * @param {{ taille: number, png: Buffer }[]} images
 */
function assemblerIco(images) {
  const entete = Buffer.alloc(6)
  entete.writeUInt16LE(0, 0) // réservé
  entete.writeUInt16LE(1, 2) // 1 = icône (2 = curseur)
  entete.writeUInt16LE(images.length, 4)

  const entrees = []
  const corps = []
  // Les images commencent après l'en-tête et le répertoire.
  let decalage = 6 + images.length * 16

  for (const { taille, png } of images) {
    const e = Buffer.alloc(16)
    // 256 ne tient pas sur un octet : la convention est d'écrire 0.
    e.writeUInt8(taille >= 256 ? 0 : taille, 0)
    e.writeUInt8(taille >= 256 ? 0 : taille, 1)
    e.writeUInt8(0, 2) // palette : aucune
    e.writeUInt8(0, 3) // réservé
    e.writeUInt16LE(1, 4) // plans de couleur
    e.writeUInt16LE(32, 6) // bits par pixel
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(decalage, 12)
    entrees.push(e)
    corps.push(png)
    decalage += png.length
  }

  return Buffer.concat([entete, ...entrees, ...corps])
}

/*
 * `app.whenReady()` est attendu dans un rappel, jamais en tête de module.
 *
 * Avec un point d'entrée ESM, un `await` de premier niveau posé avant cet
 * appel empêche l'événement `ready` d'être servi : l'évaluation du module ne
 * rend pas la main à la boucle d'événements, et le script reste suspendu pour
 * toujours — sans message, ce qui est le plus déroutant.
 */
app.whenReady().then(async () => {
  try {

  /*
   * Une fenêtre ordinaire, posée hors du bureau visible.
   *
   * Trois tentatives ont échoué avant celle-ci, et la trace vaut d'être gardée
   * — c'est toujours la même cause : **Chromium ne compose aucune trame pour
   * une fenêtre qu'il ne dessine pas**. `offscreen: true` fait que
   * `capturePage()` ne rend jamais la main ; `transparent: true` rend une image
   * vide ; une fenêtre posée à x = -3000 bloque la capture par le débogueur.
   *
   * La fenêtre est donc affichée pour de bon, le temps d'une capture. Elle
   * apparaît une seconde à l'écran : c'est le prix, et il est modeste pour une
   * commande qu'on lance quand on change le logo. Le fond transparent, lui,
   * vient du débogueur, qui sait l'imposer sans que la fenêtre soit
   * transparente.
   */
  const fenetre = new BrowserWindow({
    width: 512,
    height: 512,
    show: true,
    skipTaskbar: true,
    frame: false,
    resizable: false
  })

  await fenetre.loadURL(pathToFileURL(source).href)
  // La police est chargée par `@font-face` : sans cette attente, la première
  // photographie sort en police système et les lettres ne sont pas les bonnes.
  await fenetre.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
  await new Promise((r) => setTimeout(r, 400))

  /*
   * Capture par le protocole de débogage.
   *
   * `Emulation.setDefaultBackgroundColorOverride` avec un alpha nul donne le
   * fond transparent que la fenêtre ne sait pas fournir : les coins arrondis de
   * la tuile restent arrondis au lieu d'être remplis.
   */
  const dbg = fenetre.webContents.debugger
  dbg.attach('1.3')
  await dbg.sendCommand('Page.enable')
  await dbg.sendCommand('Emulation.setDefaultBackgroundColorOverride', {
    color: { r: 0, g: 0, b: 0, a: 0 }
  })
  const capture = await dbg.sendCommand('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: 512, height: 512, scale: 1 }
  })
  dbg.detach()

  const original = nativeImage.createFromBuffer(Buffer.from(capture.data, 'base64'))
  if (original.isEmpty()) throw new Error('la capture est vide')

  const images = TAILLES.map((taille) => ({
    taille,
    png: original.resize({ width: taille, height: taille, quality: 'best' }).toPNG()
  }))

  await mkdir(sortie, { recursive: true })
  await writeFile(join(sortie, 'icon.ico'), assemblerIco(images))
  // Le PNG de 512 sert à Linux et à la fenêtre en développement.
  await writeFile(join(sortie, 'icon.png'), original.toPNG())

  console.log(`build/icon.ico — ${TAILLES.join(', ')} px`)
  console.log('build/icon.png — 512 px')

  // `nativeImage` relit le résultat : un ICO mal assemblé se voit ici et non
  // trois étapes plus loin, au moment où la barre des tâches reste vide.
  const relu = nativeImage.createFromPath(join(sortie, 'icon.ico'))
  if (relu.isEmpty()) {
    console.error('Le fichier .ico produit est illisible.')
    app.exit(1)
  } else {
    const t = relu.getSize()
    console.log(`relu par Electron : ${t.width}×${t.height} px`)
    app.exit(0)
  }

  } catch (err) {
    console.error('Fabrication de l’icône interrompue :', err)
    app.exit(1)
  }
})
