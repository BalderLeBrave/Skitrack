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
 * Ces centrales ne sont pas cinquante sites artisanaux : vingt-sept des
 * cinquante relevées tournent sur la même plateforme, **Ingénie** (marqueur
 * `ingenie` dans la page, moteur monté par `MoteurRecherche.init_moteur`), et
 * elles desservent trente-neuf stations. Voir
 * `docs/diagnostics/centrales-reconnaissance.md`.
 *
 * Une centrale qui n'est pas sur Ingénie renvoie une erreur explicite plutôt
 * qu'une liste vide : « aucune offre » et « plateforme non reconnue » ne se
 * confondent pas dans l'écran Sources.
 *
 * ## Le formulaire est rempli, l'URL n'est plus fabriquée
 *
 * Le moteur répond aussi à une URL toute faite —
 * `/booking?action=result&cid=5&datedeb=…` — et c'est ce que faisait ce
 * connecteur. Le `robots.txt` de ces centrales interdit pourtant `/*?action=*`
 * et `/*?cid=*` : **vingt-trois centrales sur cinquante** publient cette règle,
 * et le moteur exige les deux paramètres. Cette URL ne peut donc pas être
 * demandée.
 *
 * Le connecteur remplit désormais le formulaire — dates, durée, personnes — et
 * clique « Rechercher », avec les sélecteurs relevés à la main dans
 * `docs/sources/centrales-selecteurs.xlsx`. C'est le geste de l'utilisateur,
 * déclenché par lui, une fois, pour ses dates : aucun lien suivi, aucune
 * pagination. Voir `submitSearch`.
 *
 * Le tarif d'une annonce, lui, n'est pas celui de la SERP : `.prix_en_cours` y
 * est souvent un « à partir de ». Le montant daté est celui du Rechercher de
 * l'onglet **Disponibilités & Tarifs** (`#tarifs`) — `searchAjax, puis
 * `detailTarifsPrestationAjax`, puis `calculerTotalPrestationAjax`
 * (`#total-prestation-G-…`, ex. 432,47 €). Voir
 * `resolveExactPriceOnFiche` et `station/fichePrice.ts`.
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
 * ## `robots.txt` est lu avant chaque relevé, pas une fois pour toutes
 *
 * Un exploitant change d'avis, et toutes les centrales ne disent pas la même
 * chose : celles de Combloux et de Montgenèvre publient « Disallow: / » — tout
 * leur site —, et le connecteur les écarte sans discuter. La règle est relue à
 * chaque recherche, mise en cache une heure, et implémentée dans
 * `station/robots.ts`, avec ses tests (`npm run robots:test`).
 */

import type { Page } from 'playwright'
import type { Accommodation, AccommodationProvider, ProviderHealth, SearchParams } from '../types'
import { baseAccommodation, parsePrice, sleep, withPage, withRetries, type ScrapeAttemptOptions } from '../webscrape/shared'
import {
  AJAX_TIMEOUT,
  attachAjaxProbe,
  waitForIngenieForm,
  waitForIngenieResults
} from './ajax'
import { debugLog } from '../debug'
import { allowsPath } from './robots'
import { isCetoHost } from '../ceto/hosts'
import { isUbloHost } from '../ublo/hosts'
import { isOpenSystemHost } from '../opensystem/hosts'
import { shouldAttemptIngenie } from './ingenieHosts'
import { CircuitBreaker } from '../resilience'
import {
  cleanProductUrl,
  extractTarifsPrestationId,
  extractWidgetObject,
  parseCalculerTotal,
  parseSearchAjax,
  parseTotalPrestationSpan,
  prestationDash,
  searchAjaxQuery,
  serializeTarifsForm,
  tarifsAjaxQuery,
  tarifsPrestationId,
  typePrestataireOf
} from './fichePrice'

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
  /** Surface en m², quand la fiche l'annonce. Borne basse d'une fourchette. */
  area: number | null
  /** Nombre de **pièces** — ce que la centrale publie ; jamais des chambres. */
  rooms: number | null
  /** Nombre d'avis clients affiché, sans la note, que la fiche ne donne pas. */
  reviewCount: number | null
  /** Codes d'équipement lus dans les classes : `piscine`, `animaux`, `parking`… */
  amenities: string[]
  /** Résidence qui porte le logement, quand la fiche la nomme. */
  residence: string | null
  /** Code objet Ingénie (`G|290|ST3N`), si la SERP le publie. */
  objectCode: string | null
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

/**
 * Sélecteurs du formulaire, relevés à la main.
 *
 * Ils viennent de `docs/sources/centrales-selecteurs.xlsx` — un tour de
 * l'inspecteur sur chaque centrale, converti en `station/centrals.ts`. Les
 * centrales Ingénie partagent le même formulaire à l'attribut `name` près, et
 * c'est cet attribut qu'on vise : les identifiants, eux, portent une empreinte
 * de session (`form-recherche_6a83281a50911personnes`) et changent à chaque
 * chargement.
 */
const FIELD = {
  // Les menus déroulants portent `:visible` pour la même raison que le bouton :
  // la page monte deux formulaires jumeaux, et agir sur celui qui est caché
  // attend indéfiniment un élément que personne ne peut manipuler.
  lodgingType: 'select[name="type_prestataire"]:visible',
  stayType: 'select[name="type_date"]:visible',
  /**
   * Village / localisation sur les centrales multi-stations (ex. Val d'Arly :
   * La Giettaz, Notre-Dame-de-Bellecombe, Crest-Voland…). Sans ce filtre la
   * centrale renvoie l'inventaire de tout le massif.
   */
  village: 'select[name="criteres[]"]:visible, select[name="criteres"]:visible',
  /** Ancien moteur : un menu déroulant de samedis. */
  fromSelect: 'select[name="datedeb"]:visible',
  /** Moteur actuel : un champ texte piloté par un calendrier JavaScript. */
  fromInput: 'input[name="datedeb"]',
  toInput: 'input[name="datefin"]',
  durationSelect: 'select[name="duree"]:visible',
  durationInput: 'input[name="duree"]',
  peopleSelect: 'select[name="personnes"]:visible',
  /**
   * Génération datepicker (2 Alpes, Tignes, Courchevel, La Rosière…) :
   * occupants en `<select name="adultes">` / `enfants`, parfois habillés
   * d’un bouton « 2 adultes, 0 enfant » — c’est le select qui est sérialisé.
   */
  adultsSelect: 'select[name="adultes"]:visible',
  childrenSelect: 'select[name="enfants"]:visible',
  adults: 'select[name="adultes"], input[name="adultes"]',
  children: 'select[name="enfants"], input[name="enfants"]',
  /** `:visible` parce que la page porte deux formulaires — un pour l'écran
   *  large, un pour le mobile — et que le premier venu peut être caché. */
  submit: 'input[name="search"]:visible, input.form_search:visible, button[type="submit"]:visible'
} as const

/** Normalise un libellé de station pour comparer destination ↔ option du select. */
function normPlace(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Choisit l'option `criteres[]` qui correspond à la station demandée.
 *
 * Sur Val d'Arly, la même centrale dessert Crest-Voland, Flumet, La Giettaz et
 * Notre-Dame-de-Bellecombe. Sans sélection explicite du village, la recherche
 * mélange les inventaires (ex. Giettaz → appartements à Bellecombe).
 */
function matchVillageOption(options: Choice[], destination: string): Choice | null {
  const target = normPlace(destination)
  if (!target) return null
  const usable = options.filter((o) => o.value && o.value.trim() !== '')
  // Correspondance exacte (après normalisation), puis inclusion.
  const exact = usable.find((o) => normPlace(o.label) === target)
  if (exact) return exact
  const contains = usable.find((o) => {
    const label = normPlace(o.label)
    return label.includes(target) || target.includes(label)
  })
  if (contains) return contains
  // Dernier recours : tokens significatifs (ex. « La Giettaz en Aravis » ↔ « Giettaz »).
  const tokens = target.split(' ').filter((t) => t.length >= 4)
  if (tokens.length === 0) return null
  return (
    usable.find((o) => {
      const label = normPlace(o.label)
      return tokens.every((t) => label.includes(t))
    }) ?? null
  )
}

/** La fiche appartient-elle clairement à une autre commune que la destination ? */
function cityMismatch(city: string | null | undefined, destination: string): boolean {
  if (!city || !destination) return false
  const c = normPlace(city)
  const d = normPlace(destination)
  if (!c || !d) return false
  if (c === d || c.includes(d) || d.includes(c)) return false
  const tokens = d.split(' ').filter((t) => t.length >= 4)
  if (tokens.length > 0 && tokens.every((t) => c.includes(t))) return false
  return true
}

/** Rythme de séjour du moteur : `LL` ouvre le calendrier quand la semaine
 *  fixe du samedi au samedi (`SS`, le défaut) ne propose pas la date voulue. */
const STAY_SHORT = 'LL'

interface Choice {
  value: string
  label: string
}

async function optionsOf(page: Page, selector: string): Promise<Choice[]> {
  const field = await page.$(selector)
  if (!field) return []
  return page.$$eval(`${selector} option`, (nodes) =>
    (nodes as unknown as { value: string; textContent: string | null }[]).map((o) => ({
      value: o.value,
      label: (o.textContent ?? '').replace(/\s+/g, ' ').trim()
    }))
  )
}

/**
 * Bandeaux de consentement, dans l'ordre où on veut y répondre.
 *
 * Refuser d'abord : le connecteur n'a aucun besoin d'être pisté, et « continuer
 * sans accepter » est un choix disponible sur la plupart de ces bandeaux. Le
 * bouton d'acceptation n'arrive qu'en dernier recours, quand la page ne laisse
 * pas d'autre issue — sans quoi le bandeau reste au-dessus du formulaire et
 * intercepte le clic sur « Rechercher », ce qui est exactement ce qui se passait
 * sur `reservation.les2alpes.com`.
 */
const CONSENT_BUTTONS = [
  '#onetrust-accept-btn-handler',
  '#onetrust-reject-all-handler',
  'button:has-text("OK pour moi")',
  'button:has-text("Continuer sans accepter")',
  'a:has-text("Continuer sans accepter")',
  'button:has-text("Tout refuser")',
  'button:has-text("Refuser")',
  '#didomi-notice-disagree-button',
  'button:has-text("Tout accepter")',
  'button:has-text("J\'accepte")',
  '#didomi-notice-agree-button',
  '.tarteaucitronAllow',
  '#tarteaucitronPersonalize2'
]

/**
 * Écarte le bandeau de consentement s'il y en a un.
 *
 * Silencieux par construction : l'absence de bandeau est le cas normal, et son
 * refus ne doit jamais faire échouer une recherche.
 */
async function dismissConsent(page: Page): Promise<void> {
  for (const selector of CONSENT_BUTTONS) {
    const button = page.locator(selector).first()
    try {
      if (await button.isVisible({ timeout: 700 })) {
        await button.click({ timeout: 2_000 })
        await sleep(600)
        return
      }
    } catch {
      // Bouton absent, masqué ou déjà parti : on passe au suivant.
    }
  }
}

/** Le plus petit choix numérique qui couvre `wanted`, à défaut d'exact. */
function atLeast(choices: Choice[], wanted: number): Choice | null {
  const numeric = choices
    .map((c) => ({ ...c, n: Number(c.value) }))
    .filter((c) => Number.isFinite(c.n) && c.n > 0)
    .sort((a, b) => a.n - b.n)
  return numeric.find((c) => c.n === wanted) ?? numeric.find((c) => c.n > wanted) ?? null
}

/**
 * Remplit le moteur de la centrale et lance la recherche.
 *
 * ## Pourquoi remplir plutôt que construire l'URL
 *
 * Le moteur Ingénie répond aussi à une URL toute faite —
 * `/booking?action=result&cid=5&datedeb=…` — et c'est ce que faisait ce
 * connecteur. Mais le `robots.txt` de ces centrales interdit `/*?action=*` et
 * `/*?cid=*` : vingt-trois des cinquante centrales relevées publient cette
 * règle. Fabriquer cette URL, c'est explorer le site d'une façon que
 * l'exploitant a explicitement refusée.
 *
 * Remplir le formulaire et cliquer « Rechercher » est une autre chose : c'est
 * le geste que l'utilisateur ferait lui-même, déclenché par lui, une fois, pour
 * ses dates. Le connecteur n'explore rien de sa propre initiative — il ne suit
 * aucun lien, ne pagine pas, ne visite pas la fiche des logements. Et une
 * centrale qui interdit **tout son site** (`Disallow: /`, comme Combloux et
 * Montgenèvre) reste écartée : là, il n'y a pas d'ambiguïté à lever.
 *
 * ## Ce qui est refusé plutôt que rapproché
 *
 * Ces centrales vendent des semaines fixes, du samedi au samedi. Quand la date
 * d'arrivée demandée n'est pas au calendrier, on ne prend pas « la plus
 * proche » : le prix d'une autre semaine n'est pas le prix demandé. Le
 * connecteur dit ce que la centrale propose, et rend la main.
 */
async function submitSearch(page: Page, params: SearchParams, name: string, origin: string): Promise<void> {
  const from = frenchDate(params.checkIn)
  const to = frenchDate(params.checkOut)
  if (!from) throw new Error(`${name} : aucune date d'arrivée à demander à ${origin}.`)
  const stay = nights(params)
  const adults = params.adults ?? 2
  const children = params.children ?? 0

  // Deux générations du même moteur coexistent. L'ancienne offre des menus
  // déroulants — un samedi par ligne ; l'actuelle, des champs texte pilotés par
  // un calendrier JavaScript et des champs cachés. On reconnaît celle qu'on a.
  const legacyDates = await optionsOf(page, FIELD.fromSelect)

  // Le type de prestataire ne porte pas les mêmes codes d'une génération à
  // l'autre — `G` hier, `I|H|S|V` aujourd'hui. On ne force que ce qu'on
  // reconnaît, et on laisse le choix par défaut sinon : mal deviner ce champ
  // écarterait toute l'offre en location.
  const lodgingTypes = await optionsOf(page, FIELD.lodgingType)
  if (lodgingTypes.some((o) => o.value === 'G')) {
    await page.selectOption(FIELD.lodgingType, 'G').catch(() => undefined)
  }

  // Village / localisation : indispensable sur les centrales multi-stations
  // (Val d'Arly, Portes du Soleil, etc.). Sans ça, Giettaz ramène Bellecombe.
  const destination = params.destination?.trim() ?? ''
  if (destination) {
    const villages = await optionsOf(page, FIELD.village)
    const village = matchVillageOption(villages, destination)
    if (village) {
      await page.selectOption(FIELD.village, village.value).catch(() => undefined)
      await sleep(400)
    }
  }

  if (legacyDates.length > 0) {
    // Le rythme commande le calendrier : en « samedi au samedi », `datedeb` ne
    // propose que des samedis. Si la date demandée n'y est pas, on rebascule en
    // court séjour, qui l'ouvre — et on relit les choix.
    const stayTypes = await optionsOf(page, FIELD.stayType)
    let dates = legacyDates
    if (!dates.some((d) => d.value === from) && stayTypes.some((s) => s.value === STAY_SHORT)) {
      await page.selectOption(FIELD.stayType, STAY_SHORT).catch(() => undefined)
      await sleep(1_500)
      dates = await optionsOf(page, FIELD.fromSelect)
    }
    if (!dates.some((d) => d.value === from)) {
      const offered = dates.slice(0, 4).map((d) => d.value).join(', ')
      throw new Error(`${name} : ${origin} ne propose pas d'arrivée le ${from} — la centrale vend ${offered}…`)
    }
    await page.selectOption(FIELD.fromSelect, from)

    const durations = await optionsOf(page, FIELD.durationSelect)
    if (durations.length > 0) {
      const choice = durations.find((d) => Number(d.value) === stay)
      if (!choice) {
        throw new Error(
          `${name} : ${origin} ne vend pas ${stay} nuit(s) — seulement ${durations.map((d) => d.label).join(', ')}.`
        )
      }
      await page.selectOption(FIELD.durationSelect, choice.value)
    }

    const people = await optionsOf(page, FIELD.peopleSelect)
    // À défaut du compte exact, le plus petit logement qui accueille le groupe :
    // c'est ce qu'on réserverait, et la capacité n'est pas un prix.
    const choice = people.length > 0 ? atLeast(people, adults + children) : null
    if (choice) await page.selectOption(FIELD.peopleSelect, choice.value)
    else {
      // Saisies, Collet, Saint Lary, Ballons : adultes / enfants, pas personnes.
      const adultOpts = await optionsOf(page, FIELD.adultsSelect)
      const adultChoice = adultOpts.length > 0 ? atLeast(adultOpts, adults) : null
      if (adultChoice) await page.selectOption(FIELD.adultsSelect, adultChoice.value)
      const childOpts = await optionsOf(page, FIELD.childrenSelect)
      if (childOpts.some((o) => o.value === String(children))) {
        await page.selectOption(FIELD.childrenSelect, String(children)).catch(() => undefined)
      }
    }
  } else if (await page.$(FIELD.fromInput)) {
    // Les champs du moteur actuel sont écrits directement, puis annoncés à la
    // page : son script lit la valeur au clic, mais ses propres écouteurs
    // doivent être réveillés, sans quoi le calendrier réécrirait l'ancienne
    // date par-dessus.
    await page.evaluate(
      ({ selectors, values }) => {
        // Évalué dans la page : `document` et `Event` y existent, mais pas ici
        // — `tsconfig.node.json` ne charge pas la bibliothèque DOM. Même accès
        // délibérément peu typé que `extractStationCards`, plus bas.
        const view = globalThis as unknown as {
          document: {
            querySelectorAll: (s: string) => ArrayLike<{ value: string; dispatchEvent: (e: unknown) => void }>
          }
          Event: new (type: string, init: { bubbles: boolean }) => unknown
        }
        // Tous les exemplaires du champ, pas le premier : la page monte deux
        // formulaires jumeaux — écran large et mobile — et c'est celui qui est
        // visible qui sera soumis.
        const set = (selector: string, value: string): void => {
          for (const el of Array.from(view.document.querySelectorAll(selector))) {
            try {
              const node = el as { removeAttribute?: (n: string) => void }
              node.removeAttribute?.('readonly')
            } catch {
              // ignore
            }
            el.value = value
            el.dispatchEvent(new view.Event('input', { bubbles: true }))
            el.dispatchEvent(new view.Event('change', { bubbles: true }))
          }
        }
        set(selectors.fromInput, values.from)
        if (values.to) set(selectors.toInput, values.to)
        set(selectors.durationInput, values.stay)
        set(selectors.adults, values.adults)
        set(selectors.children, values.children)
      },
      {
        selectors: FIELD,
        values: {
          from,
          to: to ?? '',
          stay: String(stay),
          adults: String(adults),
          children: String(children)
        }
      }
    )
    // Le select adultes est ce que serialize() envoie — le bouton
    // « 3 adultes, 0 enfant » n'est qu'un habillage.
    const adultOpts = await optionsOf(page, FIELD.adultsSelect)
    const adultChoice = adultOpts.length > 0 ? atLeast(adultOpts, adults) : null
    if (adultChoice) {
      await page.selectOption(FIELD.adultsSelect, adultChoice.value).catch(() => undefined)
    }
    const childOpts = await optionsOf(page, FIELD.childrenSelect)
    if (childOpts.some((o) => o.value === String(children))) {
      await page.selectOption(FIELD.childrenSelect, String(children)).catch(() => undefined)
    }
  } else {
    throw new Error(`${name} : le moteur de ${origin} n'expose pas de calendrier.`)
  }

  // Le bouton n'est pas un `submit` : c'est un `input[type=button]` que le
  // script de la page écoute. `:visible` d'abord — deux formulaires jumeaux,
  // dont un caché. Si un bandeau (OneTrust) intercepte le clic, on force
  // l'exemplaire `name=search` plutôt que de faire échouer toute la centrale.
  try {
    const visible = await page.locator(FIELD.submit).count()
    if (visible > 0) {
      await page.click(FIELD.submit, { timeout: 8_000 })
    } else {
      throw new Error('submit-hidden')
    }
  } catch {
    const clicked = await page.evaluate(() => {
      const view = globalThis as unknown as {
        document: {
          querySelectorAll: (s: string) => ArrayLike<{ click: () => void }>
          querySelector: (s: string) => { id?: string } | null
        }
        Resa?: { recherche_ajax?: (sel: string) => void }
      }
      for (const el of Array.from(view.document.querySelectorAll('input[name="search"], input.form_search'))) {
        try {
          el.click()
          return true
        } catch {
          // bouton mort, on tente le suivant
        }
      }
      const form = view.document.querySelector('form[id^="form-recherche"]')
      if (form?.id && view.Resa?.recherche_ajax) {
        view.Resa.recherche_ajax(`#${form.id}`)
        return true
      }
      return false
    })
    if (!clicked) {
      throw new Error(`${name} : pas de bouton Rechercher sur ${origin}`)
    }
  }
  await page
    .waitForLoadState('domcontentloaded', { timeout: 12_000 })
    .catch(() => undefined)
}

/**
 * Widget Ingénie (Châtel…) : `searchAjax` répond `{nbResultsFiche:0}` sans
 * injecter `.fiche-info`. La SERP HTML est `GET /booking?action=result`.
 */
async function openHtmlResultsIfEmpty(page: Page, timeoutMs: number): Promise<void> {
  const n = await page.locator('.fiche-info').count()
  if (n > 0) return
  const resultUrl = await page.evaluate(() => {
    const view = globalThis as unknown as {
      document: {
        querySelector: (s: string) => { value?: string } | null
      }
      location: { origin: string; href: string }
    }
    const val = (name: string): string =>
      view.document.querySelector(`input[name="${name}"], select[name="${name}"]`)?.value ?? ''
    const datedeb = val('datedeb')
    if (!datedeb) return null
    const q = new URLSearchParams({
      action: 'result',
      cid: val('cid') || '5',
      type_prestataire: val('type_prestataire') || 'I',
      datedeb,
      datefin: val('datefin'),
      duree: val('duree'),
      adultes: val('adultes'),
      enfants: val('enfants') || '0',
      MOTEUR_TYPES_PRESTATAIRE: val('MOTEUR_TYPES_PRESTATAIRE') || 'HEBERGEMENTS'
    })
    const url = `${view.location.origin}/booking?${q.toString()}`
    return url === view.location.href ? null : url
  })
  if (!resultUrl) return
  await page.goto(resultUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
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
    // « à partir de » : classe dédiée ou libellé dans le bloc prix (tous sites Ingénie).
    const fromLabel = Boolean(node.querySelector('.libelle_a_partir_de, .a_partir_de, .tarif_a_partir'))
    const fromText = /\bà\s*partir\b|\ba\s*partir\b/i.test(
      (node.innerText || '').slice(0, 500)
    )
    const fromPrice = fromLabel || fromText
    const slope = text.match(/(Ski aux pieds[^.]{0,18}|(?:De\s+)?\d+\s*(?:à\s*\d+\s*)?m des pistes)/i)
    const guests = text.match(/(\d+)\s*personnes?/i)

    // « 35 - 42 m² » : une fourchette de surface pour une même catégorie
    // d'appartement. On retient la borne basse — c'est celle qui est garantie.
    const areaNode = node.querySelector('.quantite')
    const areaText = (areaNode?.innerText || '').replace(',', '.')
    const areaMatch = areaText.match(/(\d+(?:\.\d+)?)/)
    const area = areaMatch ? Number(areaMatch[1]) : NaN

    // Le nombre de **pièces**, pas de chambres : c'est ce que ces centrales
    // publient, dans le texte comme dans la classe `OLOCATION-2PIECES-G`. Un
    // deux-pièces a une chambre, mais c'est une convention de petite annonce,
    // pas une donnée du site — on ne la traduit donc pas en chambres.
    const roomsClass = (node.innerHTML || '').match(/OLOCATION-(\d+)PIECES/i)
    const roomsText = text.match(/(\d+)\s*pi[èe]ces?/i)
    const roomsValue = Number(roomsClass?.[1] ?? roomsText?.[1])

    // « Avis client (2) » : le nombre d'avis, jamais la note — la fiche de
    // résultats ne la publie pas, et une note absente vaut mieux qu'une note
    // dérivée d'un classement en étoiles, qui mesure autre chose.
    const reviews = text.match(/avis\s*(?:client)?\s*\((\d+)\)/i)

    // Les équipements sont dans les classes : `EQUIPEMENT-PISCINE-G`,
    // `EQUIPEMENT-ANIMAUX-G`… Le libellé lisible n'apparaît qu'au survol, mais
    // le code, lui, est stable et suffit à filtrer.
    const amenities: string[] = []
    for (const match of Array.from((node.innerHTML || '').matchAll(/EQUIPEMENT-([A-Z0-9]+)-/g))) {
      const code = match[1].toLowerCase()
      if (!amenities.includes(code)) amenities.push(code)
    }

    // « RESIDENCE : LES CHALETS D'EMERAUDE » — la résidence qui porte
    // l'appartement, utile pour rapprocher deux annonces du même bâtiment.
    const residence = text.match(/R[ÉE]SIDENCE\s*:\s*([^:]{2,60}?)(?:\s+Classement|\s+Type d|$)/i)
    // Inline, et non `extractObjectCodeFromCardHtml` : cette fonction est
    // sérialisée puis évaluée *dans la page*, sans ses fermetures — un appel à
    // un import serait `undefined` au moment de l'exécution. Même règle que
    // `readEngineContext`. La version testée vit dans `fichePrice.ts`.
    const cardHtml = node.innerHTML || ''
    const dashCode = cardHtml.match(/PRESTATION-([A-Z]-[\w]+-[\w]+)/i)
    const pipeCode = cardHtml.match(/\b([A-Z]\|\d+\|[A-Z0-9]+)\b/)
    const objectCode = dashCode
      ? dashCode[1].replace(/-/g, '|')
      : pipeCode
        ? pipeCode[1]
        : null

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
      area: Number.isFinite(area) && area > 0 ? area : null,
      rooms: Number.isFinite(roomsValue) && roomsValue > 0 ? roomsValue : null,
      reviewCount: reviews ? Number(reviews[1]) : null,
      amenities,
      residence: residence ? residence[1].trim() : null,
      objectCode
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

/**
 * Lit les fiches de la page où la recherche a mené.
 *
 * Aucune navigation ici : la page est celle qu'a produite le clic sur
 * « Rechercher ». La liste est rendue par le serveur, mais la galerie et les
 * prix arrivent avec le script de la page — d'où l'attente.
 */
async function loadCards(page: Page, timeoutMs: number): Promise<StationCard[]> {
  // Attente active sur les fiches plutôt qu'un sleep fixe de 2 s :
  // dès que le DOM est prêt on lit, ce qui coupe ~1–1,5 s sur les centrales réactives.
  try {
    await page.waitForSelector('.fiche-info', { timeout: Math.min(10_000, timeoutMs) })
  } catch {
    // Pas de fiche : soit aucune disponibilité, soit une autre plateforme.
  }
  return page.evaluate(extractStationCards)
}

const breakersByHost = new Map<string, CircuitBreaker>()

function breakerFor(host: string): CircuitBreaker {
  let b = breakersByHost.get(host)
  if (!b) {
    b = new CircuitBreaker(2, 90_000)
    breakersByHost.set(host, b)
  }
  return b
}

function hostOfOrigin(origin: string): string {
  try {
    return new URL(origin).hostname.toLowerCase()
  } catch {
    return origin.toLowerCase()
  }
}

/** Budget TOTAL hors chargement de page : on garde les fiches déjà enrichies. */
const ENRICH_BUDGET_MS = 40_000
/** Timeout d’un aller-retour searchAjax / tarifs / calculerTotal. */
const ENRICH_REQUEST_MS = 8_000


/**
 * Prix réel du séjour — le TOTAL `#total-prestation-G-…`.
 *
 * Commun à **tout** le parc Ingénie (2 Alpes, Tignes, Serre-Chevalier,
 * Val Thorens, Courchevel, Les Saisies, Avoriaz, Val d’Isère, etc.).
 *
 * La SERP n’affiche qu’un « à partir de ». Sur la fiche, Rechercher dans
 * `#tarifs` ouvre les formules ; `Resa.calculer_total_prestation` écrit
 * le montant dans `#total-prestation-G-5834094-6395741-1` (ex. 432,47 €).
 * On rejoue searchAjax → detailTarifsPrestationAjax →
 * calculerTotalPrestationAjax dans la session Playwright.
 */
async function resolveExactPriceOnFiche(
  parent: Page,
  card: StationCard,
  params: SearchParams,
  cidHint: string | null,
  timeoutMs: number
): Promise<number | null> {
  const from = frenchDate(params.checkIn)
  const to = frenchDate(params.checkOut)
  if (!from || !to) return null
  const adults = params.adults ?? 2
  const children = params.children ?? 0
  const stay = nights(params)
  const productUrl = cleanProductUrl(card.url)
  const reqTimeout = Math.min(12_000, timeoutMs)

  try {
    let pipe = card.objectCode
    let cid = cidHint
    if (!pipe || !cid) {
      const product = await parent.request.get(productUrl, { timeout: reqTimeout })
      if (!product.ok()) return null
      const html = await product.text()
      const obj = extractWidgetObject(html)
      if (!pipe) pipe = obj?.pipe ?? null
      if (!cid) cid = obj?.cid ?? null
    }
    if (!pipe || !cid) {
      debugLog('station-ajax', 'exact-price-no-object', { url: productUrl, pipe, cid })
      return null
    }

    const dash = prestationDash(pipe)
    const origin = new URL(parent.url()).origin
    const searchUrl = `${origin}/booking?${searchAjaxQuery({
      cid,
      dash,
      typePrestataire: typePrestataireOf(pipe),
      from,
      to,
      stay,
      adults,
      children
    })}`
    const searchRes = await parent.request.get(searchUrl, { timeout: reqTimeout })
    if (!searchRes.ok()) return null
    const search = parseSearchAjax(await searchRes.text())
    if (!search || !search.success || search.nbResultsFiche <= 0) {
      debugLog('station-ajax', 'exact-price-no-dispo', { url: productUrl, dash, search })
      return null
    }

    let prestation = tarifsPrestationId(dash)
    const tarifsUrl = `${origin}/booking?${tarifsAjaxQuery({ cid, prestation })}`
    let tarifsRes = await parent.request.get(tarifsUrl, { timeout: reqTimeout })
    let tarifsHtml = tarifsRes.ok() ? await tarifsRes.text() : ''
    if (!tarifsHtml || tarifsHtml.length < 80) {
      const detailUrl =
        `${origin}/booking?action=detailPrestationsAjax&id=${encodeURIComponent(dash)}&cid=${encodeURIComponent(cid)}`
      const detailRes = await parent.request.get(detailUrl, { timeout: reqTimeout })
      const detailHtml = detailRes.ok() ? await detailRes.text() : ''
      const fromDetail = extractTarifsPrestationId(detailHtml)
      if (fromDetail && fromDetail !== prestation) {
        prestation = fromDetail
        tarifsRes = await parent.request.get(
          `${origin}/booking?${tarifsAjaxQuery({ cid, prestation })}`,
          { timeout: reqTimeout }
        )
        tarifsHtml = tarifsRes.ok() ? await tarifsRes.text() : ''
      }
    }
    if (!tarifsHtml) return null

    const formQs = serializeTarifsForm(tarifsHtml)
    if (!formQs) return null
    const calcUrl = `${origin}/booking?action=calculerTotalPrestationAjax&${formQs}`
    const calcRes = await parent.request.get(calcUrl, { timeout: reqTimeout })
    const calcText = calcRes.ok() ? await calcRes.text() : ''
    const priceText = parseCalculerTotal(calcText) ?? parseTotalPrestationSpan(tarifsHtml)
    const total = parsePrice(priceText)
    debugLog('station-ajax', 'exact-price', {
      url: productUrl,
      dash,
      prestation,
      priceText,
      total
    })
    return total != null && total > 0 ? total : null
  } catch (err) {
    debugLog('station-ajax', 'exact-price-error', {
      url: productUrl,
      err: err instanceof Error ? err.message : String(err)
    })
    return null
  }
}

async function enrichExactPrices(
  parent: Page,
  cards: StationCard[],
  params: SearchParams,
  timeoutMs: number,
  limit = 12,
  budgetMs = ENRICH_BUDGET_MS
): Promise<void> {
  const ranked = [
    ...cards.filter((c) => c.fromPrice && c.url),
    ...cards.filter((c) => !c.fromPrice && c.url && !c.priceText)
  ]
  const seen = new Set<string>()
  const need: StationCard[] = []
  for (const c of ranked) {
    if (seen.has(c.url)) continue
    seen.add(c.url)
    need.push(c)
    if (need.length >= limit) break
  }
  if (need.length === 0) return

  const cidHint = await parent
    .evaluate(() => {
      const view = globalThis as unknown as {
        document: { querySelector: (s: string) => { value?: string } | null }
      }
      const el = view.document.querySelector('input[name="cid"], input.cid')
      return el?.value || null
    })
    .catch(() => null)

  const perRequest = Math.min(ENRICH_REQUEST_MS, timeoutMs)
  const deadline = Date.now() + budgetMs
  // Un PHPSESSID : searchAjax écrit le séjour en session, detailPrestationsAjax
  // le lit. En parallèle, les fiches s'écraseraient l'une l'autre.
  const conc = 1
  let done = 0
  for (let i = 0; i < need.length; i += conc) {
    if (Date.now() >= deadline) {
      debugLog('station-ajax', 'exact-price-budget', {
        done,
        of: need.length,
        budgetMs
      })
      break
    }
    const batch = need.slice(i, i + conc)
    const prices = await Promise.all(
      batch.map((c) => resolveExactPriceOnFiche(parent, c, params, cidHint, perRequest))
    )
    for (let j = 0; j < batch.length; j++) {
      const total = prices[j]
      if (total != null && total > 0) {
        batch[j].priceText = `${total} €`
        batch[j].fromPrice = false
        done++
      }
    }
  }
}

export function createStationProvider(opts?: ScrapeAttemptOptions): AccommodationProvider {
  const name = STATION_PROVIDER_NAME
  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      const central = params.officialUrl
      if (!central) {
        // Pas de centrale : silence, les autres sources parlent. Éviter une
        // erreur bruyante qui pollue « État du relevé » pour chaque station
        // sans desk.
        return []
      }
      const origin = originOf(central)
      if (!origin) return []

      // Orchestra / Ublo / Open System : connecteurs dédiés, pas de Chromium ici.
      if (
        isCetoHost(origin) ||
        isCetoHost(central) ||
        isUbloHost(origin) ||
        isUbloHost(central) ||
        isOpenSystemHost(origin) ||
        isOpenSystemHost(central)
      ) {
        return []
      }

      const host = hostOfOrigin(origin)
      const breaker = breakerFor(host)

      const gate = shouldAttemptIngenie(central)
      if (!gate.attempt) {
        if (gate.reason === 'robots') {
          throw new Error(
            `${name} : ${origin} interdit le relevé automatique (robots.txt) — ouvrir le lien de la centrale.`
          )
        }
        // Site institutionnel / plateforme inconnue : ne pas allumer le navigateur.
        return []
      }

      if (breaker.open) {
        throw new Error(`${name} : ${breaker.reason}`)
      }

      // Timeouts plus courts : mieux un échec net en 25 s qu'un gel de 45 s × 3.
      const timeoutMs = opts?.timeoutMs ?? 28_000
      const headless = opts?.headless !== false
      const retryOpts: ScrapeAttemptOptions = {
        maxRetries: opts?.maxRetries ?? 1,
        baseDelayMs: opts?.baseDelayMs ?? 800,
        maxDelayMs: opts?.maxDelayMs ?? 4_000,
        timeoutMs,
        headless
      }

      // `robots.txt` avant tout.
      const home = await allowsPath(origin, new URL(central).pathname)
      if (!home.allowed) {
        throw new Error(
          `${name} : ${origin} interdit le relevé automatique (robots.txt, « ${home.rule} ») — ` +
            'la centrale reste accessible par son lien.'
        )
      }

      try {
      const results = await withRetries(name, retryOpts, async (attempt) =>
        withPage(
          headless,
          async (page) => {
            const probe = attachAjaxProbe(page)
            try {
            await page.goto(central, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
            // Ingénie : formulaire monté en JSONP (/widget-dispos). Timeout explicite.
            await waitForIngenieForm(
              page,
              `${FIELD.fromInput}, ${FIELD.fromSelect}`,
              AJAX_TIMEOUT.formMs
            )
            await dismissConsent(page)
            await sleep(600)
            debugLog('station-ajax', 'form-ready', { summary: probe.summary() })
            const ctx = await page.evaluate(readEngineContext)
            // Ceto / Orchestra (Chamonix, etc.) : connecteur dédié ceto-*.
            if (isCetoHost(origin)) {
              throw new Error(
                `${name} : ${origin} est une centrale Orchestra/Ceto — voir le connecteur dédié.`
              )
            }
            if (!ctx.ingenie) {
              throw new Error(
                `${name} : ${origin} n'expose pas de moteur Ingénie — réservation par le lien direct.`
              )
            }

            await submitSearch(page, params, name, origin)
            await openHtmlResultsIfEmpty(page, timeoutMs)
            await waitForIngenieResults(page, probe, AJAX_TIMEOUT.resultsMs)
            debugLog('station-ajax', 'results-ready', { summary: probe.summary() })
            let cards = await loadCards(page, timeoutMs)
            // SERP = souvent « à partir de » → prix réel = Rechercher de #tarifs.
            // Budget séparé du timeout de page : un Tignes lent ne jette pas
            // les TOTAL déjà obtenus, et n'ouvre pas le disjoncteur global.
            await enrichExactPrices(page, cards, params, timeoutMs, 12, ENRICH_BUDGET_MS)
            // Filet de sécurité : même si le select village a échoué, on écarte
            // les fiches dont la commune schema.org est clairement une autre
            // station (ex. Notre-Dame-de-Bellecombe alors qu'on a demandé Giettaz).
            const dest = params.destination?.trim() ?? ''
            if (dest) {
              const matched = cards.filter((c) => !cityMismatch(c.city, dest))
              // Ne garder le filtre que s'il laisse au moins une offre : sinon
              // la centrale n'a peut-être pas renseigné addressLocality.
              if (matched.length > 0) cards = matched
            }
            if (cards.length === 0) {
              // Stock vide pour ces dates : ce n'est pas une panne du connecteur.
              return []
            }

            const out: Accommodation[] = []
            for (const card of cards) {
              const total = parsePrice(card.priceText)
              // Sans prix affiché sur la fiche résultats, on ne peut pas prouver
              // la disponibilité pour ces dates — on n'injecte pas l'offre comme
              // « disponible ».
              if (total == null || total <= 0) continue
              // « à partir de » sans montant daté : ce n'est pas le prix du séjour.
              if (card.fromPrice) continue
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
                  rooms: card.rooms ?? undefined,
                  areaSqm: card.area ?? undefined,
                  reviewCount: card.reviewCount ?? undefined,
                  amenities: card.amenities.length > 0 ? card.amenities : undefined,
                  images: card.image ? [card.image] : undefined
                },
                params
              )
              // Le moteur ne publie que ce qui est libre aux dates demandées :
              // c'est l'une des rares sources où la disponibilité est un fait.
              offer.availabilityStatus = 'available'
              offer.availability = true
              offer.rawProviderData = card
              out.push(offer)
            }
            // Sans prix → on n'affiche rien plutôt qu'un « échec » technique.
            return out
            } finally {
              probe.dispose()
            }
          },
          attempt > 1
        )
      )
        breaker.succeed()
        return results
      } catch (err) {
        breaker.fail()
        throw err
      }
    },
    async health(): Promise<ProviderHealth> {
      const open = [...breakersByHost.entries()].filter(([, b]) => b.open)
      return {
        name,
        reachable: open.length === 0,
        detail:
          open.length > 0
            ? `${open.length} centrale(s) écartée(s) : ${open.map(([h]) => h).join(', ')}`
            : 'centrales Ingénie — navigateur invisible, dates du séjour'
      }
    }
  }
}
