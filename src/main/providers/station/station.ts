/**
 * Centrale de réservation de la station.
 *
 * ## Ce que cette source apporte, et qu'aucune autre n'a
 *
 * Une centrale de station — `reservation.les2alpes.com`,
 * `reservation.valthorens.com`, `fr.locationlesmenuires.com` — distribue
 * l'inventaire que les plateformes n'ont pas : les régies municipales, les
 * agences de station, les propriétaires qui ne publient nulle part ailleurs.
 * C'est aussi la seule source qui réserve sans intermédiaire. Les adresses sont
 * dans `renderer/src/data/stations.ts`, reprises de la liste France Montagnes
 * « Les centrales de réservation des stations de ski en France » et sondées une
 * à une ; le renderer transmet celle du domaine dans `SearchParams.officialUrl`.
 *
 * ## Pourquoi ce connecteur est spécifique à Ingénie
 *
 * Ces centrales ne sont pas 90 sites artisanaux : une trentaine tourne sur la
 * même plateforme, **Ingénie** (marqueur `ingenie` dans la page, moteur monté
 * par `MoteurRecherche.init_moteur`). Son moteur de recherche est un formulaire
 * GET vers `/booking`, et la page de résultats s'obtient donc par une URL
 * construite — pas de session, pas de POST, pas de pilotage de calendrier :
 *
 *     /booking?action=result&reload=1&cid=<cid>&MOTEUR_TYPES_PRESTATAIRE=HEBERGEMENT_SELECT
 *             &type_prestataire=G&datedeb=JJ/MM/AAAA&datefin=JJ/MM/AAAA&adultes=N&enfants=M
 *
 * `cid` est l'identifiant de contexte du site : il vaut 5 aux 2 Alpes, 1 à
 * Courchevel. Il est lu dans le formulaire de la page d'accueil plutôt que
 * deviné — d'où deux chargements, l'accueil puis les résultats.
 *
 * Une centrale qui n'est pas sur Ingénie renvoie une erreur explicite plutôt
 * qu'une liste vide : « aucune offre » et « plateforme non reconnue » ne se
 * confondent pas dans l'écran Sources.
 *
 * ## Ce qui est lu dans la page
 *
 * Chaque fiche porte un bloc `application/ld+json` **que le site publie pour
 * les moteurs de recherche** : nom, adresse, latitude, longitude, image, URL.
 * On le lit en priorité — c'est de la donnée structurée, stable, et destinée
 * aux machines. Le prix et la distance aux pistes, eux, ne sont que dans le
 * texte de la fiche : ils sont lus sur le DOM, et leur absence n'invalide pas
 * l'offre.
 *
 * `robots.txt` des centrales Ingénie a été relu : il interdit `/stats`,
 * `/carnet-voyage`, `espace-client` et une liste de paramètres de filtrage
 * (`?liste=`, `?origine_affinage=`, `?date=`…). L'URL de résultats utilisée ici
 * n'en emploie aucun.
 */

import type { Page } from 'playwright'
import type { Accommodation, AccommodationProvider, ProviderHealth, SearchParams } from '../types'
import { baseAccommodation, parsePrice, sleep, withPage, withRetries, type ScrapeAttemptOptions } from '../webscrape/shared'

export const STATION_PROVIDER_NAME = 'station-web'

/** Fiche extraite d'une page de résultats Ingénie. */
export interface StationCard {
  title: string
  url: string
  priceText: string | null
  image: string | null
  latitude: number | null
  longitude: number | null
  city: string | null
  guests: number | null
  /** Libellé de distance aux pistes tel que la centrale l'écrit. */
  slopeText: string | null
  /** Le tarif affiché est un « à partir de », pas le prix du séjour demandé. */
  fromPrice: boolean
  /** Surface en m², quand la fiche l'annonce. */
  area: number | null
}

/** `JJ/MM/AAAA`, le seul format que le moteur accepte. */
function frenchDate(iso: string | undefined): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}

function nights(params: SearchParams): number {
  const a = params.checkIn ? Date.parse(params.checkIn) : NaN
  const b = params.checkOut ? Date.parse(params.checkOut) : NaN
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 7
  return Math.max(1, Math.round((b - a) / 86_400_000))
}

/** Racine de la centrale, sans chemin : le moteur vit toujours à `/booking`. */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export function resultsUrl(origin: string, cid: string, params: SearchParams): string {
  const u = new URL(`${origin}/booking`)
  u.searchParams.set('action', 'result')
  u.searchParams.set('reload', '1')
  u.searchParams.set('redirectionUrl', '0')
  u.searchParams.set('cid', cid)
  u.searchParams.set('MOTEUR_TYPES_PRESTATAIRE', 'HEBERGEMENT_SELECT')
  // `G` = tous les types d'hébergement (appartement, chalet, résidence) ; `H`
  // ne ramènerait que l'hôtellerie, qui n'est pas ce que l'écran compare.
  u.searchParams.set('type_prestataire', 'G')
  const from = frenchDate(params.checkIn)
  const to = frenchDate(params.checkOut)
  if (from) u.searchParams.set('datedeb', from)
  if (to) u.searchParams.set('datefin', to)
  u.searchParams.set('duree', String(nights(params)))
  u.searchParams.set('adultes', String(params.adults ?? 2))
  u.searchParams.set('enfants', String(params.children ?? 0))
  return u.toString()
}

/**
 * Le DOM, vu depuis le processus principal.
 *
 * Les deux fonctions qui suivent sont sérialisées par Playwright et évaluées
 * *dans la page* : `document` y existe, mais pas ici — `tsconfig.node.json` ne
 * charge pas la bibliothèque DOM, et l'y ajouter donnerait à tout le processus
 * principal des types de navigateur qu'il n'a pas. D'où cet accès délibérément
 * peu typé, limité aux deux fonctions concernées.
 */
type DomNode = {
  querySelector: (sel: string) => DomNode | null
  querySelectorAll: (sel: string) => ArrayLike<DomNode>
  textContent: string | null
  innerText: string
  innerHTML: string
  href?: string
  value?: string
  getAttribute: (name: string) => string | null
}

type DomRoot = DomNode & { documentElement: DomNode }

/**
 * Lecture du contexte de la centrale : plateforme et identifiant `cid`.
 *
 * Autonome jusqu'à l'obsession : `page.evaluate` ne sérialise que le corps de
 * la fonction, sans ses fermetures. Un helper partagé — même trivial — serait
 * `undefined` dans la page.
 */
export function readEngineContext(): { ingenie: boolean; cid: string | null } {
  const doc = (globalThis as unknown as { document: DomRoot }).document
  const form = doc.querySelector('form.form-recherche, form[action*="booking"]')
  const cidField = form?.querySelector('[name="cid"]')
  const html = doc.documentElement.innerHTML
  return {
    ingenie: /ingenie/i.test(html) || Boolean(form),
    cid: cidField?.value || null
  }
}

/**
 * Extraction des fiches de la page de résultats. Évaluée dans la page, donc
 * elle aussi sans dépendance extérieure.
 *
 * Trois valeurs viennent du DOM plutôt que du bloc structuré, parce que le bloc
 * ne les a pas ou les a fausses :
 *
 * - le **titre** : `schema.org` porte la raison sociale du loueur (« INDIVISION
 *   STARON MANICAUT »), pas le nom du logement (« LE PRÉ GENTIL N°1 ») ;
 * - l'**URL** : celle du bloc est échappée en entités HTML (`&amp;`), celle du
 *   lien est déjà résolue par le navigateur ;
 * - le **prix** : `.prix_en_cours`, accompagné le cas échéant d'un « à partir
 *   de » qu'il faut retenir — un tarif d'appel n'est pas le prix du séjour.
 */
export function extractStationCards(): StationCard[] {
  const doc = (globalThis as unknown as { document: DomRoot }).document
  const out: StationCard[] = []
  const nodes = Array.from(doc.querySelectorAll('.fiche-info'))

  for (const node of nodes) {
    // Le lien de la fiche : celui qui porte un libellé, pas celui de la galerie.
    let anchor: DomNode | null = null
    for (const candidate of Array.from(node.querySelectorAll('a[href]'))) {
      const label = (candidate.innerText || '').trim()
      if (label && !/^(agrandir|photo|r[ée]server|plus d)/i.test(label)) {
        anchor = candidate
        break
      }
    }

    // Le bloc schema.org publié par la centrale pour les moteurs de recherche.
    let lat: number | null = null
    let lon: number | null = null
    let city: string | null = null
    let image: string | null = null
    let ldUrl: string | null = null
    const ld = node.querySelector('script[type="application/ld+json"]')
    if (ld?.textContent) {
      try {
        const data = JSON.parse(ld.textContent) as {
          url?: string
          image?: { url?: string } | string
          location?: {
            geo?: { latitude?: string | number; longitude?: string | number }
            address?: { addressLocality?: string }
          }
        }
        ldUrl = typeof data.url === 'string' ? data.url.replace(/&amp;/g, '&') : null
        const rawImage = typeof data.image === 'string' ? data.image : data.image?.url
        image = typeof rawImage === 'string' ? rawImage : null
        const geo = data.location?.geo
        const latNum = geo ? Number(geo.latitude) : NaN
        const lonNum = geo ? Number(geo.longitude) : NaN
        lat = Number.isFinite(latNum) ? latNum : null
        lon = Number.isFinite(lonNum) ? lonNum : null
        city = data.location?.address?.addressLocality ?? null
      } catch {
        // Bloc illisible : la fiche reste exploitable par son DOM.
      }
    }

    const url = anchor?.href || ldUrl
    const label = (anchor?.innerText || '').replace(/\s+/g, ' ').trim()
    // « LE PRÉ GENTIL N°1 Appartement 4 personnes » : le nom, puis le type et la
    // capacité. On coupe au type pour ne garder que le nom du logement.
    const split = label.match(/^(.*?)\s+(Appartement|Chalet|Studio|H[ôo]tel|R[ée]sidence|Maison|G[îi]te)\b/i)
    const title = (split ? split[1] : label).trim()
    if (!title || !url) continue

    const text = (node.innerText || '').replace(/\s+/g, ' ').trim()
    const priceNode = node.querySelector('.prix_en_cours')
    const priceText = (priceNode?.innerText || '').trim() || null
    const fromPrice = Boolean(node.querySelector('.libelle_a_partir_de'))
    const slope = text.match(/(Ski aux pieds[^.]{0,18}|(?:De\s+)?\d+\s*(?:à\s*\d+\s*)?m des pistes)/i)
    const guests = text.match(/(\d+)\s*personnes?/i)
    const areaNode = node.querySelector('.quantite')
    const area = areaNode ? Number((areaNode.innerText || '').replace(',', '.')) : NaN

    out.push({
      title,
      url,
      priceText,
      image,
      latitude: lat,
      longitude: lon,
      city,
      guests: guests ? Number(guests[1]) : null,
      slopeText: slope ? slope[0] : null,
      fromPrice,
      area: Number.isFinite(area) && area > 0 ? area : null
    })
  }
  return out
}

/** Identifiant stable d'une fiche : le segment de son URL, sinon l'URL entière. */
function sourceIdOf(url: string): string {
  try {
    const path = new URL(url).pathname
    return path.replace(/^\/|\.html$/g, '') || url
  } catch {
    return url
  }
}

async function loadCards(page: Page, url: string, timeoutMs: number): Promise<StationCard[]> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
  // La liste est rendue côté serveur mais la galerie et les prix arrivent avec
  // le script de la page ; on laisse le temps au premier écran de se poser.
  await sleep(2_000)
  try {
    await page.waitForSelector('.fiche-info', { timeout: 8_000 })
  } catch {
    // Pas de fiche : soit aucune disponibilité, soit une autre plateforme.
  }
  return page.evaluate(extractStationCards)
}

export function createStationProvider(opts?: ScrapeAttemptOptions): AccommodationProvider {
  const name = STATION_PROVIDER_NAME
  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      const central = params.officialUrl
      if (!central) {
        throw new Error(
          `${name} : aucune centrale de réservation connue pour ${params.destination}.`
        )
      }
      const origin = originOf(central)
      if (!origin) throw new Error(`${name} : adresse de centrale illisible (${central}).`)

      const timeoutMs = opts?.timeoutMs ?? 45_000
      const headless = opts?.headless !== false

      return withRetries(name, opts ?? {}, async (attempt) =>
        withPage(
          headless,
          async (page) => {
            await page.goto(central, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
            await sleep(1_500)
            const ctx = await page.evaluate(readEngineContext)
            if (!ctx.ingenie || !ctx.cid) {
              throw new Error(
                `${name} : ${origin} n'expose pas de moteur Ingénie — réservation par le lien direct.`
              )
            }

            const cards = await loadCards(page, resultsUrl(origin, ctx.cid, params), timeoutMs)
            if (cards.length === 0) {
              throw new Error(`${name} : aucune offre publiée par ${origin} pour ces dates.`)
            }

            const out: Accommodation[] = []
            for (const card of cards) {
              const total = parsePrice(card.priceText)
              const offer = baseAccommodation(
                name,
                {
                  sourceId: sourceIdOf(card.url),
                  title: card.title,
                  url: card.url,
                  totalPrice: total,
                  currency: 'EUR',
                  latitude: card.latitude ?? undefined,
                  longitude: card.longitude ?? undefined,
                  city: card.city ?? undefined,
                  guests: card.guests ?? undefined,
                  images: card.image ? [card.image] : undefined
                },
                params
              )
              // Le moteur ne publie que ce qui est libre aux dates demandées :
              // c'est l'une des rares sources où la disponibilité est un fait.
              offer.availabilityStatus = 'available'
              offer.availability = true
              // « à partir de » : un tarif d'appel, pas le prix du séjour
              // demandé. Le laisser passer pour « total confirmé » le ferait
              // entrer tel quel dans le coût du séjour.
              if (card.fromPrice && offer.priceConfidence === 'total_confirmed') {
                offer.priceConfidence = 'partial'
              }
              offer.rawProviderData = card
              out.push(offer)
            }
            return out
          },
          attempt > 1
        )
      )
    },
    async health(): Promise<ProviderHealth> {
      return {
        name,
        reachable: true,
        detail:
          'centrales de réservation des stations (plateforme Ingénie) — interrogées avec les dates du séjour'
      }
    }
  }
}
