/**
 * Photos locales de l'accueil.
 *
 * Les sept images de l'annexe A se déposent dans `src/renderer/src/assets/img/`
 * (un héro et six tuiles de massif). Elles ne sont pas au dépôt : la liaison
 * passe donc par `import.meta.glob`, qui renvoie une table vide tant que le
 * dossier est absent, là où un `import` statique casserait le build. Le jour où
 * les fichiers arrivent, les tuiles prennent leur photo sans qu'une ligne
 * change ici.
 *
 * Aucune URL distante : ces images sont empaquetées avec l'application, comme
 * les polices — la CSP du renderer n'autorise rien d'autre.
 */

/**
 * Les 257 photos, résolues **à la compilation**.
 *
 * ## Le piège du chargement empressé
 *
 * `eager: true` fait de chaque image un import statique : elles entrent toutes
 * dans le graphe de modules, et **une seule illisible fait échouer le graphe
 * entier** — l'application démarre alors sur un écran vide, sans message.
 *
 * C'est arrivé le 2026-08-29 : le cache HTTP de Chromium
 * (`%APPDATA%/skitrack/Cache`) portait une entrée corrompue pour l'une d'elles
 * et servait des octets nuls là où Vite avait envoyé un module valide. Le
 * fichier sur disque était intact, `curl` recevait le bon contenu, et
 * l'application restait noire à chaque lancement, le cache survivant aux
 * redémarrages.
 *
 * Le remède est `npm run cache:clear`. Le symptôme, lui, ne se produit qu'en
 * développement : l'application construite embarque les images dans son
 * paquet, sans requête ni cache.
 *
 * Le chargement empressé n'est pas une erreur pour autant — `stationPhoto()`
 * rend une chaîne, appelée en plein rendu, et la version paresseuse rendrait
 * des promesses qu'il faudrait attendre dans chaque vignette. Mais la
 * fragilité mérite d'être écrite là où elle vit.
 */
const IMAGES = import.meta.glob<string>('../assets/img/*.{jpg,jpeg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default'
})

/** Index par nom de fichier (sans chemin), pour absorber les variantes de clé Vite. */
const BY_FILE: Record<string, string> = {}
for (const [key, url] of Object.entries(IMAGES)) {
  const base = key.split('/').pop()
  if (base) BY_FILE[base.toLowerCase()] = url
}

function urlOf(file: string): string | null {
  return BY_FILE[file.toLowerCase()] ?? null
}

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Un fichier par massif de la table fermée de `massifColor()`.
 *
 * Les clés sont normalisées (casse / accents) : « Massif Central » et
 * « Massif central » pointent sur la même image.
 */
const MASSIF_FILES: Record<string, string> = {
  [fold('Alpes du Nord')]: 'massif-alpes-nord.jpg',
  [fold('Alpes du Sud')]: 'massif-alpes-sud.jpg',
  [fold('Pyrénées')]: 'massif-pyrenees.jpg',
  [fold('Massif central')]: 'massif-massif-central.jpg',
  [fold('Vosges')]: 'massif-vosges.jpg',
  [fold('Jura')]: 'massif-jura.jpg'
}

export function massifPhoto(name: string): string | null {
  if (!name) return null
  const file = MASSIF_FILES[fold(name)]
  return file ? urlOf(file) : null
}

/**
 * Photo d'une station, par son `slug` de référentiel.
 *
 * Le dossier n'en contient aucune aujourd'hui : la fonction rend `null`, et
 * l'accueil retombe sur la photo du massif — en le disant dans le texte de
 * remplacement, parce qu'une photo de Val Thorens sous le nom « La Daille »
 * serait une légende fausse, pas un repli.
 *
 * Le jour où `station-<slug>.jpg` arrive dans `assets/img/`, la vignette prend
 * sa photo sans qu'une ligne change ici. C'est le même mécanisme que les
 * massifs, et pour la même raison : la liste des images n'a pas à vivre dans le
 * code.
 */
/**
 * Index secondaire : le nom de fichier sans tirets ni ponctuation.
 *
 * L'outil d'import nomme ses fichiers d'après le classeur France Montagnes
 * (« Praloup »), l'application d'après son nom d'affichage (« Pra-Loup »). Les
 * deux graphies désignent la même station et ne divergent que par les tirets :
 * un index qui les ignore rapproche les deux sans table à entretenir — une
 * table se désynchroniserait à la première correction de graphie du
 * référentiel, silencieusement.
 *
 * L'exact passe d'abord ; l'index dégradé ne sert qu'en repli, et une
 * collision y est théorique — il faudrait deux stations dont les noms ne
 * diffèrent que par la ponctuation.
 */
const BY_SQUASH: Record<string, string> = {}
for (const [file, url] of Object.entries(BY_FILE)) {
  const m = file.match(/^station-(.+)\.(?:jpe?g|png|webp)$/)
  if (m) BY_SQUASH[m[1].replace(/[^a-z0-9]/g, '')] ??= url
}

export function stationPhoto(slug: string | null | undefined): string | null {
  if (!slug) return null
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const hit = urlOf(`station-${slug}.${ext}`)
    if (hit) return hit
  }
  return BY_SQUASH[slug.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? null
}
