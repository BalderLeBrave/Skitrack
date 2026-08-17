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

const IMAGES = import.meta.glob<string>('../assets/img/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default'
})

function urlOf(file: string): string | null {
  return IMAGES[`../assets/img/${file}`] ?? null
}

/** Photo du héro de l'accueil, ou `null` tant qu'elle n'est pas déposée. */
export function heroPhoto(): string | null {
  return urlOf('hero-montblanc.jpg')
}

/**
 * Un fichier par massif de la table fermée de `massifColor()`.
 *
 * Tout autre massif — un référentiel maison en apporte — n'a pas de photo et
 * reçoit la tuile générique : mieux vaut un dégradé assumé qu'une image prise
 * pour un autre endroit.
 */
const MASSIF_FILES: Record<string, string> = {
  'Alpes du Nord': 'massif-alpes-nord.jpg',
  'Alpes du Sud': 'massif-alpes-sud.jpg',
  Pyrénées: 'massif-pyrenees.jpg',
  'Massif central': 'massif-massif-central.jpg',
  Vosges: 'massif-vosges.jpg',
  Jura: 'massif-jura.jpg'
}

export function massifPhoto(name: string): string | null {
  const file = MASSIF_FILES[name]
  return file ? urlOf(file) : null
}
