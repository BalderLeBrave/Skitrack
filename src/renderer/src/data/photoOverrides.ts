/**
 * Photos de station corrigées par l'utilisateur.
 *
 * ## Ce qui manquait
 *
 * Le référentiel photo est **généré** : `tools/import-station-photos.mjs` choisit
 * des images sur Wikimedia Commons **par position**, et une candidate prise à
 * quatre kilomètres du front de neige peut montrer autre chose que la station.
 * L'écran de revue des Réglages permettait de *voir* l'erreur ; rien ne
 * permettait de la *corriger*. Une photo fausse se voyait, et restait.
 *
 * ## Ce que cette table porte
 *
 * Trois gestes, et seulement trois :
 *
 *  - **remplacer** une photo par une autre, désignée par son URL ;
 *  - **corriger** sa légende, son auteur, sa licence ;
 *  - **rejeter** une photo qui ne montre pas la station (`rejetee`), auquel cas
 *    la fiche n'affiche plus rien plutôt qu'une image trompeuse.
 *
 * ## Pourquoi une URL et pas un fichier
 *
 * Les photos livrées passent par `import.meta.glob`, résolu **à la compilation** :
 * rien d'ajouté à l'exécution ne peut y entrer. Un fichier local devrait donc
 * être copié dans `userData` par le processus principal, derrière un nouveau
 * contrat IPC — ou stocké en data-URI dans les préférences, où trois images
 * suffiraient à remplir le quota de `localStorage`. L'URL a été retenue le
 * 2026-08-29 : elle marche tout de suite, la CSP autorise déjà `img-src https:`,
 * et elle garde le lien vers la source, ce qui est exactement ce qu'une licence
 * CC BY-SA demande.
 *
 * ## La règle qui ne plie pas
 *
 * **Une photo sans légende ne s'affiche pas.** CC-BY et CC-BY-SA exigent
 * l'auteur et la licence à côté de l'image ; `StationPhotoCard` applique déjà
 * cette règle aux photos livrées, et une photo ajoutée ici n'y échappe pas.
 * `photoOverrideValide` est la porte, et elle est fermée par défaut.
 */

/** Ce que l'utilisateur a décidé pour la photo d'une station. */
export interface PhotoOverride {
  /**
   * La photo livrée ne montre pas cette station : on n'affiche rien.
   *
   * Distinct d'une absence de photo — c'est un constat, et il doit survivre à
   * un réimport du référentiel qui reproposerait la même image.
   */
  rejetee?: boolean
  /** URL de l'image de remplacement. `https:` uniquement. */
  url?: string
  /** Légende. Obligatoire dès qu'une URL est posée. */
  legende?: string
  /** Auteur déclaré. Obligatoire dès qu'une URL est posée. */
  auteur?: string
  /** Licence, telle que la source la nomme : « CC BY-SA 4.0 », « CC0 »… */
  licence?: string
  /** Page de description à citer avec le crédit. Facultative mais recommandée. */
  page?: string
  /** Date de la saisie, AAAA-MM-JJ. */
  saisieLe?: string
}

/** Indexée par `slugStation(nom)`, comme le référentiel généré. */
export type PhotoOverrides = Record<string, PhotoOverride>

/**
 * Une surcharge est-elle affichable ?
 *
 * Le rejet l'est toujours : il ne montre rien, il n'a rien à créditer. Une
 * image, elle, exige les trois champs que la licence impose. Sans eux, la
 * surcharge est ignorée et la photo livrée reprend sa place — plutôt que
 * d'afficher une image sans crédit, ce qui est précisément ce que l'en-tête de
 * `data/stationPhotos.ts` refuse.
 */
export function photoOverrideValide(o: PhotoOverride | undefined): boolean {
  if (!o) return false
  if (o.rejetee) return true
  if (!o.url) return false
  return (
    /^https:\/\//i.test(o.url) &&
    (o.legende ?? '').trim().length > 0 &&
    (o.auteur ?? '').trim().length > 0 &&
    (o.licence ?? '').trim().length > 0
  )
}

/** Ce qui manque pour qu'une surcharge devienne affichable, en clair. */
export function photoOverrideManques(o: PhotoOverride): string[] {
  if (o.rejetee) return []
  const out: string[] = []
  if (!o.url) out.push('url')
  else if (!/^https:\/\//i.test(o.url)) out.push('https')
  if (!(o.legende ?? '').trim()) out.push('legende')
  if (!(o.auteur ?? '').trim()) out.push('auteur')
  if (!(o.licence ?? '').trim()) out.push('licence')
  return out
}
