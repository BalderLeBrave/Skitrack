/**
 * Forme des URL de fiche des centrales Ublo / MSEM.
 *
 * Partagé parce que deux processus en dépendent, et qu'une règle d'URL recopiée
 * est une règle qui se met à diverger :
 *
 * - le **connecteur** (`main/providers/ublo/msem.ts`) la fabrique à partir du
 *   `slug` que rend l'API MSEM ;
 * - le **renderer** répare les URL déjà enregistrées, écrites par une version
 *   qui posait le slug à la racine.
 *
 * L'API MSEM ne rend que le `slug` : elle ne dit nulle part où le site le
 * publie. Le segment est donc relevé, pas déduit — les `sitemap` des trois
 * centrales (`/api/sitemap`, annoncé par leur `robots.txt`) ne publient que
 * `{pathPrefix}/hebergements/{slug}` : 956 URL sur 1096 à l'Alpe d'Huez, 297 à
 * Saint-François-Longchamp, et sous `/fr` à Sainte-Foy.
 */

export const UBLO_LISTING_SEGMENT = 'hebergements'

/**
 * Centrales Ublo qui ne publient **aucune fiche par logement** : hôte → page
 * d'entrée de leur widget.
 *
 * Isola 2000 en est : son catalogue vit dans un widget monopage, la route à
 * dièse est réécrite au chargement, et aucune configuration publiée ne donne de
 * chemin de fiche. Lui fabriquer un `/hebergements/{slug}` rendait une **404**.
 *
 * Cette table est partagée parce qu'elle a deux lecteurs, et que la recopier
 * serait la faire diverger : le **connecteur** l'applique aux offres qu'il
 * relève, le **renderer** réécrit les URL déjà enregistrées sous l'ancienne
 * forme. C'est la même raison d'être que le reste de ce fichier.
 */
export const UBLO_ENTRY_ONLY: Record<string, string> = {
  'isola2000.com': '/reservez-votre-sejour/',
  /*
   * Valberg et Écrins : WordPress + widget, `/hebergements/{slug}` = 404
   * (mesuré 2026-09-01). Même contrat qu'Isola.
   */
  'valberg.com': '/sejourner/reserver-votre-sejour/',
  'paysdesecrins.com': '/hebergements/'
}

/**
 * Lien vers la centrale, pour un logement qui n'a pas de fiche.
 *
 * Le `slug` est accroché en paramètre alors que le site l'ignore, et ce n'est
 * pas décoratif : dans l'application, l'URL **est** l'identité d'une annonce —
 * clé de dédoublonnage du relevé, source de son identifiant, clé de
 * rapprochement au relevé suivant. Une URL commune à treize logements les
 * réduirait à un seul.
 *
 * Les dates ne sont pas accrochées : le widget ne les lit pas, et des
 * paramètres qu'on sait ignorés feraient croire à un lien daté.
 */
export function ubloEntryUrl(origin: string, entryPath: string, slug: string): string {
  const url = new URL(entryPath, origin)
  url.searchParams.set('lodging', slug)
  return url.href
}

/** Chemin de fiche, préfixe de langue compris (`/fr` à Sainte-Foy). */
export function ubloListingPath(pathPrefix: string, slug: string): string {
  return `${pathPrefix}/${UBLO_LISTING_SEGMENT}/${slug}`.replace(/\/{2,}/g, '/')
}

/**
 * Réinsère le segment de fiche dans une URL Ublo qui en manque.
 *
 * **Idempotent** : une URL déjà correcte revient inchangée, et l'appeler à
 * chaque chargement ne dérive pas.
 *
 * Volontairement prudent : on ne touche qu'aux chemins d'un seul segment, la
 * signature exacte du défaut. Une URL de la page d'accueil, d'une activité ou
 * d'un forfait a deux segments ou zéro, et sort d'ici intacte. La chaîne est
 * rendue telle quelle si elle n'est pas analysable — réparer n'autorise pas à
 * casser.
 */
export function repairUbloListingUrl(url: string): string {
  try {
    const u = new URL(url)

    /*
     * Centrale sans fiche : une URL enregistrée sous `/hebergements/{slug}` y
     * rend une 404. On la ramène sur la page d'entrée, en gardant le `slug`
     * comme identité. Sans cette réécriture, l'ancienne annonce et la nouvelle
     * portent deux URL différentes, donc deux identités : elles s'affichent en
     * double, l'une menant à une page d'erreur.
     */
    const entry = UBLO_ENTRY_ONLY[u.hostname.replace(/^www\./, '')]
    if (entry) {
      const parts = u.pathname.split('/').filter(Boolean)
      if (parts[0] !== UBLO_LISTING_SEGMENT) return url
      const slug = parts[1]
      if (!slug) return url
      return ubloEntryUrl(u.origin, entry, slug)
    }

    const parts = u.pathname.split('/').filter(Boolean)
    // Déjà bon, ou pas la forme visée.
    if (parts.length !== 1 || parts[0] === UBLO_LISTING_SEGMENT) return url
    u.pathname = ubloListingPath('', parts[0])
    return u.href
  } catch {
    return url
  }
}
