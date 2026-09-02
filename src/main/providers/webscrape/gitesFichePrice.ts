/**
 * Prix séjour Gîtes de France — widget ITEA, pas la tuile SERP.
 *
 * Contrat universel (tout le catalogue, pas un id) :
 * une offre n'entre dans le listing client QUE si typology = gîte,
 * devis ITEA daté pour CES dates × CES personnes, capacité et chambres
 * au plancher, disponibilité confirmée. Le tarif « à partir de /semaine »
 * (`.prixSansDate`, tuile SERP) n'est jamais le séjour.
 *
 * Preuves dump 2026-09-02 (`gites-itea-catalog.json`, POST gereResa.php) :
 *   Copains 38G253122, 06–13/02/2027, 8 pers. → 4261,52 € (pas 1330).
 *   Centaurée 38G52734, mêmes dates → 2899,36 € (pas 1400).
 *   Feuillardiers 38G52200, mêmes dates → 1898,40 € (pas 950).
 *   13–20/02 : Copains / Feuillardiers contactSiNonVendable → hors liste.
 *
 * Type : `data-ident` suffixe `.G` gîte / `.H` chambre / `.GS` séjour-groupe.
 * Facet Drupal `type:36172` = Gîte. Exclus : `36174` Chambre, `36171` Groupe.
 *
 * AJAX : POST `widget-fngf.itea.fr/lib_2/ajax/gereResa.php`
 * `type=getHTMLTabPrixFormulesSejour`.
 */

export const GITES_FNGF_WIDGET_KEY = 'FNGF-00M562O4'

/** Dump `gites_towns_50301.html` : `f[0]=type:36172` → Gîte. */
export const GITES_FACET_GITE = 'type:36172'
export const GITES_FACET_CHAMBRE = 'type:36174'
export const GITES_FACET_GROUPE = 'type:36171'

/** Chemins universels — le schéma réel du site, tous les ids. */
export const GITES_SOURCE_PATHS = {
  path_price_from:
    '.g2f-accommodationTile-text-price | .prixSansDate (À partir de N € /semaine)',
  path_price_total_stay:
    'POST widget-fngf.itea.fr/lib_2/ajax/gereResa.php type=getHTMLTabPrixFormulesSejour → .sp_montantPrixTotal[data-prix]',
  path_available:
    'même POST : data-prix présent = available ; JSON contactSiNonVendable = unavailable',
  path_typology:
    "data-ident suffixe .G gîte / .H chambre d'hôtes / .GS|.GG gîte de groupe|séjour ; tuile .g2f-accommodationTile-text-type ; og:url Gite-|Chambre-d-hotes-|Gite-de-groupe- ; facet type:36172/36174/36171"
} as const

/** « À partir de N € par semaine » — tarif d'appel, pas un panier daté. */
export function looksWeeklyFromPriceText(text: string | null | undefined): boolean {
  if (!text) return false
  return /(?:à|a)\s+partir\s+de/i.test(text) && /(?:par|\/)\s*semaine/i.test(text)
}

function foldType(label: string): string {
  return label
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

export type GitesTypologyKeep =
  | 'gite'
  | 'chambre_hotes'
  | 'groupe'
  | 'bad_type'
  | 'missing'

export type GitesTypologyInput = {
  type?: string | null
  category?: string | null
  typology?: string | null
  accommodationType?: string | null
  nature?: string | null
  label?: string | null
  ident?: string | null
  url?: string | null
}

/** Suffixe ITEA `data-ident` : `.G` gîte, `.H` hôtes, `.GS`/`.GG` groupe. */
export function classifyGitesIdentSuffix(ident: string | null | undefined): GitesTypologyKeep | null {
  if (!ident) return null
  const m = ident.trim().match(/\.([A-Za-z]+)$/)
  if (!m) return null
  const s = m[1].toUpperCase()
  if (s === 'G') return 'gite'
  if (s === 'H') return 'chambre_hotes'
  if (s === 'GS' || s === 'GG') return 'groupe'
  return null
}

function classifyGitesUrlPath(url: string | null | undefined): GitesTypologyKeep | null {
  if (!url) return null
  const p = foldType(url.replace(/\\/g, '/'))
  if (/chambre[-_ ]?d[-_ ]?hotes|chambres-d-hotes|bed-and-breakfast/.test(p)) return 'chambre_hotes'
  if (/gites?[-_ ]de[-_ ]groupe|gites?[-_ ]de[-_ ]sejour/.test(p)) return 'groupe'
  if (/\/gite[-_]/.test(p) || /gite-/.test(p)) return 'gite'
  return null
}

function classifyGitesLabel(label: string): GitesTypologyKeep {
  const t = foldType(label)
  if (!t) return 'missing'
  if (/chambre/.test(t) && /hote/.test(t)) return 'chambre_hotes'
  if (/\bb\s*&\s*b\b|\bbed\s+and\s+breakfast\b/.test(t)) return 'chambre_hotes'
  if (/groupe/.test(t) || /gite de sejour/.test(t) || /gites de groupe/.test(t)) return 'groupe'
  if (/camping|\baire\b|enfants|chez l.habitant/.test(t)) return 'bad_type'
  if (/\bgites?\b/.test(t)) return 'gite'
  return 'bad_type'
}

/**
 * Typologie source uniquement (ident / type / og:url / facet).
 * Jamais le titre, jamais capacity ≥ 15 ⇒ groupe.
 *
 * Un libellé « Gîte » ne bat pas une URL `gite-de-groupe-` : le chemin SEO
 * Gîtes de France (dump tuile `.g2f-accommodationTile-text-type` parfois
 * raccourci) est la preuve de la catégorie. Ident ITEA reste premier.
 */
export function classifyGitesTypology(input: GitesTypologyInput): GitesTypologyKeep {
  const fromIdent = classifyGitesIdentSuffix(input.ident)
  if (fromIdent) return fromIdent

  const fromUrl = classifyGitesUrlPath(input.url)
  if (fromUrl === 'groupe' || fromUrl === 'chambre_hotes' || fromUrl === 'bad_type') {
    return fromUrl
  }

  const labels = [
    input.type,
    input.category,
    input.typology,
    input.accommodationType,
    input.nature,
    input.label
  ]
    .filter((x): x is string => Boolean(x && x.trim()))
    .join(' · ')
  if (labels) {
    const fromLabel = classifyGitesLabel(labels)
    if (fromLabel === 'groupe' || fromLabel === 'chambre_hotes' || fromLabel === 'bad_type') {
      return fromLabel
    }
    if (fromUrl) return fromUrl
    return fromLabel
  }

  if (fromUrl) return fromUrl
  return 'missing'
}

/** Tuile `.g2f-accommodationTile-text-type` : Chambre d'hôtes / Gîte de groupe. */
export function isDroppedGitesType(label: string | null | undefined): boolean {
  if (!label) return false
  const k = classifyGitesTypology({ type: label })
  return k === 'chambre_hotes' || k === 'groupe' || k === 'bad_type'
}

/**
 * Offre Gîtes à garder : Gîte individuel seulement.
 * Chambre d'hôtes, gîte de groupe / séjour, camping : hors liste.
 */
export function isKeptIndividualGiteOffer(input: GitesTypologyInput): boolean {
  return classifyGitesTypology(input) === 'gite'
}

/** Libellé Gîte — pas groupe, pas chambre. « Gîte - logement entier » passe. */
export function isGitesIndividualGiteType(label: string | null | undefined): boolean {
  if (!label) return false
  return classifyGitesTypology({ type: label }) === 'gite'
}

/** Code gîte dans l'URL (`…/chalet-maradri-38g20200` → `38G20200`). */
export function gitesCodeFromUrl(url: string): string | null {
  const m = url.match(/(\d{2}g\d{3,})/i)
  return m ? m[1].toUpperCase() : null
}

export function gitesWidgetUrl(code: string, key = GITES_FNGF_WIDGET_KEY): string {
  const id = code.toUpperCase()
  const u = new URL(`https://widget-fngf.itea.fr/fiche-${id}.html`)
  u.searchParams.set('WIDGET', 'RESAFNGF')
  u.searchParams.set('KEY', key)
  u.searchParams.set('LANGUE', 'FR')
  u.searchParams.set('NUMGITE', id)
  return u.toString()
}

/** `2027-02-06` → `06/02/2027` (contrat ITEA `inpt_resaDateDebCal`). */
export function isoToFrDate(iso: string | undefined | null): string | null {
  if (!iso) return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return `${m[3]}/${m[2]}/${m[1]}`
}

export interface GitesWidgetContext {
  ident: string
  instance: string
  exercice: string
}

/** `data-ident` / `data-instance` / `data-exercice` du bloc dates ITEA. */
export function parseGitesWidgetContext(html: string): GitesWidgetContext | null {
  const ident = html.match(/data-ident="([^"]+)"/)?.[1]
  const instance = html.match(/data-instance="([^"]+)"/)?.[1]
  const exercice = html.match(/data-exercice="([^"]+)"/)?.[1]
  if (!ident || !instance || !exercice) return null
  return { ident, instance, exercice }
}

function parseEuroAmount(raw: string): number | undefined {
  const n = Number(raw.replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.round(n * 100) / 100
}

/**
 * Total du séjour, taxe de séjour comprise.
 * Sans dates, ce span n'existe pas — le teaser `.prixSansDate` reste.
 * Jamais `prixLoc` (grille hors dates).
 */
export function parseGitesStayTotal(html: string): number | undefined {
  const dataPrix = html.match(/sp_montantPrixTotal[^>]*data-prix="([\d.]+)"/i)
  if (dataPrix) return parseEuroAmount(dataPrix[1])
  const attr = html.match(/data-prixtotal="([\d\s.,]+)\s*(?:€|&euro;)?"/i)
  if (attr) return parseEuroAmount(attr[1])
  return undefined
}

export function gitesQuoteFailed(html: string): boolean {
  if (parseGitesStayTotal(html) != null) return false
  if (/contactSiNonVendable/.test(html)) return true
  if (/div_msgErreurRetourVerifDates[^>]*display:\s*none/i.test(html)) return false
  if (/div_msgCalculPrixImpossible[^>]*display:\s*none/i.test(html)) return false
  return /nous ne pouvons pas calculer le prix de ce s[ée]jour/i.test(html)
}

/** Dates non remplissables → pas de total. Hors liste. */
export function gitesDatesNotFillable(body: string): boolean {
  if (parseGitesStayTotal(body) != null) return false
  return /contactSiNonVendable/.test(body) || gitesQuoteFailed(body)
}

export function gitesResaForm(
  ctx: GitesWidgetContext,
  args: { dateDeb: string; dateFin: string; adults: number; type: string; exercice?: string }
): string {
  return new URLSearchParams({
    nbAdultes: String(args.adults),
    dateDeb: args.dateDeb,
    dateFin: args.dateFin,
    instance: ctx.instance,
    ident: ctx.ident,
    exercice: args.exercice ?? ctx.exercice,
    estpresentsurfiche: 'true',
    type: args.type
  }).toString()
}

export function interpretGitesQuoteBody(body: string): {
  stay?: number
  available: boolean
  price_firm: boolean
} {
  const stay = parseGitesStayTotal(body)
  if (stay != null && stay > 0) return { stay, available: true, price_firm: true }
  return { available: false, price_firm: false }
}

export type GitesHiddenReason =
  | 'hidden_gites_chambre_hotes'
  | 'hidden_gites_groupe'
  | 'hidden_gites_bad_type'
  | 'hidden_gites_extraction_failed'
  | 'hidden_gites_unavailable'
  | 'hidden_gites_no_firm_price'
  | 'hidden_gites_capacity'
  | 'hidden_gites_bedrooms'
  | 'hidden_gites_no_dates'

export type GitesCatalogRow = {
  listing_id: string
  ident?: string | null
  property_type?: string | null
  url?: string | null
  guests?: number | null
  /** Studio = 0 déclaré. Null = extraction_failed. */
  bedrooms?: number | null
  /** Tarif d'appel /semaine — debug only, jamais le séjour. */
  price_from?: number | null
  quote?: {
    check_in: string
    check_out: string
    guests: number
    stay: number | null
    available: boolean
  } | null
}

export type GitesDemand = {
  check_in: string | null
  check_out: string | null
  guests: number
  bedrooms: number
}

export type GitesKept = GitesCatalogRow & {
  typology_keep: 'gite'
  price_firm: true
  price_total_stay_amount: number
  availability_status: 'available'
}

export type GitesContractResult = {
  shown: GitesKept[]
  hidden: { listing_id: string; reason: GitesHiddenReason }[]
  counters: Record<GitesHiddenReason, number>
}

function emptyCounters(): Record<GitesHiddenReason, number> {
  return {
    hidden_gites_chambre_hotes: 0,
    hidden_gites_groupe: 0,
    hidden_gites_bad_type: 0,
    hidden_gites_extraction_failed: 0,
    hidden_gites_unavailable: 0,
    hidden_gites_no_firm_price: 0,
    hidden_gites_capacity: 0,
    hidden_gites_bedrooms: 0,
    hidden_gites_no_dates: 0
  }
}

/**
 * Filtre client universel. Aucun if (id === Copains).
 * price_from / grille[0] ne deviennent jamais price_total_stay_amount.
 */
export function applyGitesClientContract(
  rows: GitesCatalogRow[],
  demand: GitesDemand
): GitesContractResult {
  const counters = emptyCounters()
  const shown: GitesKept[] = []
  const hidden: { listing_id: string; reason: GitesHiddenReason }[] = []

  const hide = (listing_id: string, reason: GitesHiddenReason) => {
    counters[reason] += 1
    hidden.push({ listing_id, reason })
  }

  if (!demand.check_in || !demand.check_out) {
    for (const row of rows) hide(row.listing_id, 'hidden_gites_no_dates')
    return { shown, hidden, counters }
  }

  for (const row of rows) {
    const typology = classifyGitesTypology({
      type: row.property_type,
      ident: row.ident,
      url: row.url
    })
    if (typology === 'chambre_hotes') {
      hide(row.listing_id, 'hidden_gites_chambre_hotes')
      continue
    }
    if (typology === 'groupe') {
      hide(row.listing_id, 'hidden_gites_groupe')
      continue
    }
    if (typology === 'bad_type') {
      hide(row.listing_id, 'hidden_gites_bad_type')
      continue
    }
    if (typology === 'missing') {
      hide(row.listing_id, 'hidden_gites_extraction_failed')
      continue
    }

    if (row.guests == null || row.bedrooms == null) {
      hide(row.listing_id, 'hidden_gites_extraction_failed')
      continue
    }
    if (row.guests < demand.guests) {
      hide(row.listing_id, 'hidden_gites_capacity')
      continue
    }
    if (row.bedrooms < demand.bedrooms) {
      hide(row.listing_id, 'hidden_gites_bedrooms')
      continue
    }

    const q = row.quote
    const quoteMatches =
      q != null &&
      q.check_in === demand.check_in &&
      q.check_out === demand.check_out &&
      q.guests === demand.guests

    if (!quoteMatches) {
      hide(row.listing_id, 'hidden_gites_unavailable')
      continue
    }
    if (!q.available || q.stay == null || q.stay <= 0) {
      hide(row.listing_id, 'hidden_gites_unavailable')
      continue
    }

    shown.push({
      ...row,
      typology_keep: 'gite',
      price_firm: true,
      price_total_stay_amount: q.stay,
      availability_status: 'available'
    })
  }

  return { shown, hidden, counters }
}
