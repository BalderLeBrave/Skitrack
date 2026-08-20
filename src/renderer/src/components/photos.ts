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

/** Photo du héro de l'accueil, ou `null` tant qu'elle n'est pas déposée. */
export function heroPhoto(): string | null {
  return urlOf('hero-montblanc.jpg')
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
