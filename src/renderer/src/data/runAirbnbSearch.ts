/**
 * Lance la recherche Airbnb automatisée et fusionne le résultat dans la liste.
 * Inclut un timeout global côté renderer (Promise.race).
 */

import { parseAirbnbClipboard } from './airbnbClip'
import type { RawListing } from './bulkImport'
import { mergeAirbnbPaste } from './airbnbMerge'
import { enrichWithAccess } from './lodgingAccess'
import type { Lodging } from './lodgings'
import { stationNameOf } from './stations'
import type { SearchZone } from '@shared/geo'
import { filterToZone } from '@shared/geo'

/** Délai max d'**une** passe (ms). Couvre les retries Playwright de cette passe. */
export const AIRBNB_PASS_TIMEOUT_MS = 120_000

/**
 * Budget total du relevé (ms) — plusieurs passes, voir `PriceBand`.
 *
 * C'est aussi ce que la barre de progression de l'écran Logements affiche
 * comme durée attendue : une valeur plus courte que le travail réel ferait
 * stagner la barre à 95 % pendant deux minutes, ce qui se lit comme un
 * blocage. Épuisé, le budget n'annule rien : le relevé fusionne les passes
 * déjà obtenues.
 */
export const AIRBNB_SEARCH_TIMEOUT_MS = 300_000

export interface RunAirbnbSearchParams {
  domainId: number
  /** Identifiant du domaine côté moteur local — voir `Domain.engineId`. */
  engineDomainId?: number
  domainName: string
  /** Département de la station, pour lever l'ambiguïté du nom. Voir
   *  `airbnbPlaceName` : sans lui, « Arc 2000 » devient Arcachon. */
  departement?: string | null
  villageOrMinAlt: number
  checkIn: string
  checkOut: string
  adults: number
  children?: number
  capacity: number
  nights: number
  imported: Lodging[]
  /**
   * Zone du domaine. Les annonces dont Airbnb publie une position hors de cette
   * zone sont écartées avant fusion.
   *
   * Le relevé part d'un **nom** de station, seul format qu'Airbnb accepte dans
   * son chemin d'URL, et un nom a des homonymes. Le scraper n'a aucun moyen de
   * le savoir ; c'est ici, où le domaine est connu, que la question se tranche.
   * Absente si le domaine n'a pas de coordonnées : on ne rejette rien sur une
   * zone qu'on ne sait pas tracer.
   */
  zone?: SearchZone | null
  /** Override timeout global (ms). */
  timeoutMs?: number
}

export interface RunAirbnbSearchOk {
  ok: true
  imported: Lodging[]
  added: number
  updated: number
  count: number
  /**
   * Annonces déjà connues que ce relevé n'a pas retrouvées à ces dates.
   *
   * Un compte, pas une phrase : la mise en mots appartient à l'écran, qui a la
   * langue courante sous la main. Voir `LodgingsPage`.
   */
  missing: number
  message: string
}

export interface RunAirbnbSearchFail {
  ok: false
  error: string
  timedOut?: boolean
}

export type RunAirbnbSearchResult = RunAirbnbSearchOk | RunAirbnbSearchFail

function timeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    window.setTimeout(() => {
      const err = new Error(
        `Délai dépassé (${Math.round(ms / 1000)}s). La recherche Airbnb a été interrompue. ` +
          'Réessayez, vérifiez le proxy, ou validez un CAPTCHA s’il était ouvert.'
      )
      ;(err as Error & { timedOut?: boolean }).timedOut = true
      reject(err)
    }, ms)
  })
}


/**
 * Lieu envoyé à Airbnb, département compris.
 *
 * ## Le bogue que cette fonction répare
 *
 * Airbnb ne prend pas de coordonnées dans son URL de recherche : il prend un
 * nom, et il le géocode. Envoyer « Arc 2000 » tout seul ramenait des
 * appartements d'**Arcachon** — le géocodeur avait trouvé mieux ailleurs, et
 * rien dans le nom ne disait que la station est en Savoie.
 *
 * La table ci-dessous ne couvrait que quinze stations sur deux cent
 * quatre-vingt-trois. Les deux cent soixante-huit autres partaient en nom nu,
 * chacune exposée au même sort qu'Arc 2000.
 *
 * Le département lève l'ambiguïté, et il est déjà dans le catalogue —
 * `catalogue.ts` le range dans `Domain.region`. Airbnb écrit lui-même ses
 * lieux ainsi, « Ville--Département--France », et `citySegment` produit
 * exactement cette forme à partir des virgules.
 *
 * La table reste pour les **graphies** qu'Airbnb écrit autrement (« Les 2
 * Alpes », « Meribel » sans accent). Elle ne sert plus à désambiguïser : c'est
 * le département qui s'en charge, pour toutes les stations sans exception.
 */
function airbnbPlaceName(domainName: string, departement?: string | null): string {
  const nom = airbnbPlaceLabel(domainName)
  const dep = (departement ?? '').trim()
  // Un département déjà présent dans le nom ne se répète pas.
  if (!dep || nom.toLowerCase().includes(dep.toLowerCase())) return `${nom}, France`
  return `${nom}, ${dep}, France`
}

/** Graphie de la station telle qu'Airbnb l'écrit, quand elle diffère. */
function airbnbPlaceLabel(domainName: string): string {
  const key = domainName.trim().toLowerCase()
  const map: Record<string, string> = {
    'les 2 alpes': 'Les 2 Alpes',
    'les deux alpes': 'Les 2 Alpes',
    "val d'isère": "Val d'Isère",
    'val d isere': "Val d'Isère",
    'tignes': 'Tignes',
    'serre chevalier': 'Serre Chevalier',
    'val thorens': 'Val Thorens',
    'courchevel': 'Courchevel',
    'la plagne': 'La Plagne',
    'les arcs': 'Les Arcs',
    'chamonix': 'Chamonix',
    'megève': 'Megève',
    'megeve': 'Megève',
    'méribel': 'Meribel',
    'meribel': 'Meribel'
  }
  for (const [k, v] of Object.entries(map)) {
    if (key === k || key.startsWith(k + ' ') || key.includes(k)) return v
  }
  return stationNameOf(domainName) || domainName
}

/**
 * Une tranche de prix, bornes du site : `price_min` / `price_max`, **par nuit**.
 *
 * ## Pourquoi le relevé se fait en plusieurs passes
 *
 * Airbnb pagine : dix-huit annonces par page, la suite derrière un curseur.
 * Le relevé ne suit pas ce curseur — il ne l'a jamais suivi —, si bien qu'une
 * station de plusieurs milliers de locations se résumait à une vingtaine
 * d'annonces, toujours les mêmes. Ce n'était pas un filtre trop serré : la
 * collecte s'arrêtait au premier écran, et l'écran affichait ce plafond comme
 * s'il était le marché.
 *
 * On ne contourne pas la pagination, **on repose la question**. Bornée par le
 * prix, chaque tranche rend sa propre première page : quatre tranches
 * disjointes valent quatre pages, et rien n'est lu qu'Airbnb ne montrerait à
 * quelqu'un qui cherche dans cette fourchette.
 *
 * Le prix est le seul axe disponible ici : `AirbnbScrapeParams` n'expose que
 * `minPrice`/`maxPrice` — et le relevé lui-même vit dans
 * `providers/airbnb/**`, qui ne se corrige pas d'ici. Le découpage est donc
 * fait **en aval**, comme le veut la règle de cette zone.
 */
interface PriceBand {
  minPrice?: number
  maxPrice?: number
}

/**
 * Annonces qu'Airbnb pose sur une page de résultats.
 *
 * Sert de seuil, pas de promesse : une passe qui en rend moins a montré tout
 * ce qu'elle avait, et il n'y a rien à aller chercher au-delà. C'est ce qui
 * garde une petite station à une seule passe.
 */
const AIRBNB_PAGE_SIZE = 18

/**
 * Tranches de repli, en euros par nuit, quand la passe libre ne rend aucun
 * prix exploitable. Grossières et assumées : elles ne servent qu'à partager
 * l'inventaire en quatre, pas à décrire un marché.
 */
const FALLBACK_BANDS: PriceBand[] = [
  { maxPrice: 90 },
  { minPrice: 90, maxPrice: 150 },
  { minPrice: 150, maxPrice: 250 },
  { minPrice: 250 }
]

/**
 * Découpe l'inventaire en quatre tranches, sur les prix **observés**.
 *
 * Les quartiles de la passe libre valent mieux qu'une échelle écrite en dur :
 * une nuit à Val Thorens et une nuit dans le Jura n'ont pas le même ordre de
 * grandeur, et des bornes fixes y placeraient les quatre tranches du même côté
 * du marché. Trois quartiles confondus — un inventaire trop uniforme pour
 * qu'on le découpe ainsi — font retomber sur les bornes fixes.
 */
export function priceBands(listings: RawListing[], nights: number): PriceBand[] {
  // Les quartiles sont calculés sur le total relevé ramené à la nuit, quand
  // `price_min` d'Airbnb porte sur le tarif nuitée hors frais : les bornes sont
  // donc un peu hautes, et les tranches se recouvrent ou se frôlent aux bords.
  // Le recouvrement ne coûte rien — la fusion se fait par URL — et l'écart aux
  // bords coûte quelques annonces, pas la moitié du marché.
  const nightly = listings
    .map((l) => l.total)
    .filter((total): total is number => typeof total === 'number' && total > 0)
    .map((total) => Math.round(total / Math.max(1, nights)))
    .sort((a, b) => a - b)

  if (nightly.length < 4) return FALLBACK_BANDS
  const at = (part: number): number => nightly[Math.min(nightly.length - 1, Math.floor(nightly.length * part))]
  const q1 = at(0.25)
  const q2 = at(0.5)
  const q3 = at(0.75)
  if (!(q1 < q2 && q2 < q3)) return FALLBACK_BANDS

  return [
    { maxPrice: q1 },
    { minPrice: q1, maxPrice: q2 },
    { minPrice: q2, maxPrice: q3 },
    { minPrice: q3 }
  ]
}

async function scrapeOnce(params: RunAirbnbSearchParams, band: PriceBand = {}) {
  return window.skitrack.airbnbScrape({
    // Airbnb range la destination dans le chemin de l'URL et ne connaît que
    // des noms de lieux : « Les Arcs », pas « Les Arcs – Peisey-Vallandry ».
    city: airbnbPlaceName(params.domainName, params.departement),
    // La boîte du domaine, celle-là même que `filterToZone` appliquera au
    // retour. Le nom reste, comme étiquette lisible dans l'URL et comme repli
    // si Airbnb ignorait un jour le rectangle.
    bounds: params.zone
      ? {
          north: params.zone.north,
          south: params.zone.south,
          east: params.zone.east,
          west: params.zone.west
        }
      : null,
    checkIn: params.checkIn || undefined,
    checkOut: params.checkOut || undefined,
    adults: params.adults,
    children: params.children ?? 0,
    minPrice: band.minPrice,
    maxPrice: band.maxPrice,
    scrollCount: 3,
    maxRetries: 3,
    // Headed (défaut main) : meilleur score reCAPTCHA. Ne pas forcer headless.
    timeoutMs: 60_000
  })
}

interface PassResult {
  listings: RawListing[]
  meta: { destination?: string; checkIn?: string; checkOut?: string; count: number }
  captchaSolved: boolean
  attempts: number
}

/** Une passe, son délai propre. `null` = rien d'exploitable de ce côté-là. */
async function runPass(
  params: RunAirbnbSearchParams,
  band: PriceBand,
  timeoutMs: number
): Promise<PassResult | { error: string; timedOut: boolean }> {
  let outcome: Awaited<ReturnType<typeof window.skitrack.airbnbScrape>>
  try {
    outcome = await Promise.race([scrapeOnce(params, band), timeoutPromise(timeoutMs)])
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      timedOut: Boolean(err && typeof err === 'object' && (err as { timedOut?: boolean }).timedOut)
    }
  }

  if (!outcome.ok) {
    return {
      error: outcome.error + (outcome.attempts ? ` (${outcome.attempts} essai(s))` : ''),
      timedOut: /timeout|délai|timed out/i.test(outcome.error)
    }
  }

  const { listings, errors, meta } = parseAirbnbClipboard(outcome.payloadJson)
  if (listings.length === 0) {
    return { error: errors[0] ?? 'Aucune annonce exploitable dans la page Airbnb.', timedOut: false }
  }
  return {
    listings,
    meta,
    captchaSolved: Boolean(outcome.captchaSolved),
    attempts: outcome.attempts ?? 1
  }
}

/**
 * Relève Airbnb automatisée (Playwright), en parallèle des autres sources.
 * En cas d’échec (CAPTCHA, robots, timeout), l’UI conserve le lien de redirection.
 */
export async function runAirbnbSearch(
  params: RunAirbnbSearchParams
): Promise<RunAirbnbSearchResult> {
  const budgetMs = params.timeoutMs ?? AIRBNB_SEARCH_TIMEOUT_MS
  const startedAt = Date.now()
  const timeLeft = (): number => budgetMs - (Date.now() - startedAt)

  // Passe libre d'abord : c'est le classement d'Airbnb lui-même, celui qu'un
  // visiteur voit en arrivant. Les tranches viennent après, pour élargir.
  const first = await runPass(params, {}, Math.min(AIRBNB_PASS_TIMEOUT_MS, budgetMs))
  if (!('listings' in first)) {
    return { ok: false, timedOut: first.timedOut, error: first.error }
  }

  const byUrl = new Map<string, RawListing>()
  const collect = (batch: RawListing[]): number => {
    let fresh = 0
    for (const item of batch) {
      if (!item.url || byUrl.has(item.url)) continue
      byUrl.set(item.url, item)
      fresh++
    }
    return fresh
  }

  collect(first.listings)
  const meta = first.meta
  let captchaSolved = first.captchaSolved
  let attempts = first.attempts
  let passes = 1

  /*
   * Le balayage ne se déclenche que si la première page était **pleine**. Une
   * station qui rend douze annonces les a toutes rendues : quatre passes de
   * plus n'y ajouteraient rien et coûteraient quatre relevés à un site qui
   * n'a rien demandé.
   */
  if (first.listings.length >= AIRBNB_PAGE_SIZE) {
    for (const band of priceBands(first.listings, params.nights)) {
      // Sous une passe de marge, on s'arrête : entamer un relevé qu'on sait
      // ne pas pouvoir finir revient à le payer sans le lire.
      if (timeLeft() < 30_000) break
      const pass = await runPass(params, band, Math.min(AIRBNB_PASS_TIMEOUT_MS, timeLeft()))
      if (!('listings' in pass)) {
        /*
         * Une tranche vide n'empêche pas les suivantes — il n'y a peut-être
         * rien à plus de 300 € la nuit, et c'est une réponse.
         *
         * Un **délai dépassé**, si. Le renderer abandonne la promesse, mais le
         * relevé continue de tourner dans le processus principal, sur le
         * navigateur partagé d'Airbnb : lancer la passe suivante ferait naviguer
         * deux relevés dans le même contexte. Et un site qui ne répond plus dans
         * les deux minutes n'a pas besoin qu'on insiste trois fois de plus.
         */
        if (pass.timedOut) break
        continue
      }

      passes++
      captchaSolved = captchaSolved || pass.captchaSolved
      attempts = Math.max(attempts, pass.attempts)

      /*
       * Garde-fou de l'hypothèse. Les tranches sont disjointes : celle-ci
       * **doit** apporter des annonces que la passe libre n'avait pas. Si elle
       * n'en apporte aucune, c'est que `price_min`/`price_max` n'a pas borné
       * la recherche — Airbnb a rendu la même page. On cesse alors d'insister
       * plutôt que de payer trois relevés de plus pour la même liste.
       */
      if (collect(pass.listings) === 0) break
    }
  }

  const listings = [...byUrl.values()]

  // Rattachement géographique. Les annonces sans position publiée sont
  // conservées — Airbnb n'en donne pas toujours — mais celles qu'il place
  // ailleurs sont écartées ici, avant qu'elles n'entrent dans la liste.
  const zoned = params.zone
    ? filterToZone(listings, params.zone, (l) => ({ lat: l.lat, lon: l.lon }))
    : { kept: listings, rejected: [], unlocated: listings.length }

  /**
   * Les annonces sans position suivent le sort du lot.
   *
   * `filterToZone` les garde, et c'est le bon défaut : Airbnb ne publie pas
   * toujours de coordonnées, et écarter une annonce parce qu'elle est muette
   * reviendrait à punir le silence. Mais quand les annonces **situées** sont
   * majoritairement ailleurs, ce n'est plus du silence, c'est une recherche
   * partie dans une autre région : les muettes viennent du même endroit
   * qu'elles. C'est ce qui laissait passer des appartements d'Arcachon pour
   * Arc 2000, ceux qui ne publiaient pas leur position.
   */
  const situees = zoned.kept.filter((l) => l.lat != null && l.lon != null)
  const egaree = zoned.rejected.length > 0 && situees.length < zoned.rejected.length
  const retenues = egaree ? situees : zoned.kept
  if (egaree) {
    console.info(
      `[SKITRACK] Airbnb : lot jugé égaré (${situees.length} situées en zone contre ` +
        `${zoned.rejected.length} hors zone) — les annonces sans position sont écartées aussi.`
    )
  }
  if (zoned.rejected.length > 0) {
    console.info(
      `[SKITRACK] Airbnb : ${zoned.rejected.length} annonce(s) hors de la zone du domaine, écartée(s) —`,
      zoned.rejected.slice(0, 5).map((l) => l.name)
    )
  }
  if (retenues.length === 0) {
    return {
      ok: false,
      error:
        `Les ${listings.length} annonce(s) rendues par Airbnb sont toutes hors du périmètre du domaine. ` +
        'Le nom de station envoyé a probablement été compris comme une autre commune.'
    }
  }

  const { imported, added, updated, missing } = mergeAirbnbPaste(params.imported, retenues, {
    checkIn: meta.checkIn ?? params.checkIn,
    checkOut: meta.checkOut ?? params.checkOut,
    domainId: params.domainId,
    capacity: params.capacity,
    nights: params.nights,
    fallbackAltitude: params.villageOrMinAlt
  })

  if (added.length === 0 && updated === 0) {
    return {
      ok: true,
      imported,
      added: 0,
      updated: 0,
      count: zoned.kept.length,
      missing,
      message: `Les ${zoned.kept.length} annonce(s) sont déjà à jour.`
    }
  }

  const { lodgings: enriched, note } = await enrichWithAccess(added, params.engineDomainId)
  const byId = new Map(enriched.map((l) => [l.id, l]))
  const finalList = imported.map((l) => byId.get(l.id) ?? l)

  const parts = [
    `${added.length} nouvelle(s)`,
    updated > 0 ? `${updated} prix actualisé(s)` : null,
    // Le rejet géographique se dit : une recherche qui rend moins d'annonces
    // que la page Airbnb n'en montrait doit expliquer où sont passées les
    // autres, sinon le relevé passe pour incomplet.
    zoned.rejected.length > 0 ? `${zoned.rejected.length} hors zone écartée(s)` : null,
    passes > 1 ? `${passes} passes de prix` : null,
    captchaSolved ? 'CAPTCHA validé' : null,
    attempts > 1 ? `essai ${attempts}` : null
  ].filter(Boolean)

  return {
    ok: true,
    imported: finalList,
    added: added.length,
    updated,
    count: zoned.kept.length,
    missing,
    message: parts.join(' · ') + (note ? ` — ${note}` : '')
  }
}
