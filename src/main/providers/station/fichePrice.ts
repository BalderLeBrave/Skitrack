/**
 * Prix séjour daté d'une fiche Ingénie.
 *
 * Sur la SERP, `.prix_en_cours` est un tarif d'appel (« à partir de »).
 * Ce n'est **pas** le montant à comparer. Après Rechercher dans #tarifs,
 * le site ouvre « Sélectionner » puis calcule le total du panier :
 *
 *   1. `searchAjax` + `cle_fiche` + dates → dispo
 *   2. `detailTarifsPrestationAjax` → formulaire des formules
 *      (nuitées, taxe de séjour, ménage…)
 *   3. `calculerTotalPrestationAjax` (serialize du form)
 *      → `{ data: { total: "432,47 €" } }` écrit dans
 *        `#total-prestation-G-5834094-6395741-1`
 *
 * C'est ce span — le TOTAL — que Skitrack doit afficher.
 */

export interface IngenieObjectRef {
  /** `G|290|ST3N` — identifiant pipe de la prestation. */
  pipe: string
  /** Identifiant moteur (`cid`), si le HTML le publie. */
  cid: string | null
}

/** Identifiant `cle_fiche` / `id` attendu par searchAjax. */
export function prestationDash(pipe: string): string {
  const raw = pipe.trim()
  if (/^PRESTATION-/i.test(raw) || /^PRESTATAIRE-/i.test(raw)) return raw
  const parts = raw.split(/[|]/).filter(Boolean)
  if (parts.length === 0) return raw
  const kind = parts.length >= 3 ? 'PRESTATION' : 'PRESTATAIRE'
  return `${kind}-${parts.join('-')}`
}

/** `G-290-ST3N` / `G-5834094-6395741` — paramètre `prestation` des tarifs. */
export function tarifsPrestationId(dash: string): string {
  return dash.replace(/^PRESTATION-/i, '').replace(/^PRESTATAIRE-/i, '')
}

export function typePrestataireOf(pipe: string): string {
  const cleaned = pipe.replace(/^PRESTATION-/i, '').replace(/^PRESTATAIRE-/i, '')
  const part = cleaned.split(/[|-]/)[0]
  return part || 'G'
}

/**
 * Code objet + cid dans le HTML d'une fiche produit.
 *
 * Priorité : JSON `IngenieWidgetDispo.Client` (`#tarifs` / `#widget-dispo`),
 * puis les variables stats `gsw_vars` (même triplet), puis un pipe isolé.
 */
export function extractWidgetObject(html: string): IngenieObjectRef | null {
  const object = html.match(/"object"\s*:\s*\{\s*"code"\s*:\s*"([^"]+)"/)
  const cidFromWidget =
    html.match(/IngenieWidgetDispo[\s\S]{0,1600}?"cid"\s*:\s*"(\d+)"/) ||
    html.match(/var params = \{[\s\S]{0,1600}?"cid"\s*:\s*"(\d+)"/)
  const cidFromResa = html.match(/Resa\.init_moteur_resa\(\s*'(\d+)'/)
  const cidFromInput =
    html.match(/name="cid"[^>]*value="(\d+)"/i) || html.match(/class="cid"[^>]*value="(\d+)"/i)
  const cid = cidFromWidget?.[1] || cidFromResa?.[1] || cidFromInput?.[1] || null

  if (object?.[1]) return { pipe: object[1], cid }

  const ty = html.match(/gsw_vars\["TYPREST"\]\s*=\s*"([^"]+)"/)
  const ag = html.match(/gsw_vars\["CODEPRESTATAIRE"\]\s*=\s*"([^"]+)"/)
  const pr = html.match(/gsw_vars\["CODEPRESTATION"\]\s*=\s*"([^"]+)"/)
  if (ty && ag && pr) return { pipe: `${ty[1]}|${ag[1]}|${pr[1]}`, cid }

  const loose = html.match(/\b([A-Z]\|\d+\|[A-Z0-9]+)\b/)
  if (loose) return { pipe: loose[1], cid }
  return null
}

/** Code objet éventuel dans une carte SERP (id, data-*, HTML). */
export function extractObjectCodeFromCardHtml(html: string): string | null {
  const dash = html.match(/PRESTATION-([A-Z]-[\w]+-[\w]+)/i)
  if (dash) return dash[1].replace(/-/g, '|')
  const pipe = html.match(/\b([A-Z]\|\d+\|[A-Z0-9]+)\b/)
  return pipe ? pipe[1] : null
}

/** Id passé à `detail_tarifs_prestation_open('G-5834094-6395741', …)`. */
export function extractTarifsPrestationId(html: string): string | null {
  const open = html.match(/detail_tarifs_prestation_open\(\s*'([^']+)'/)
  if (open?.[1]) return open[1]
  const named = html.match(/name="prestation"[^>]*value="([^"]+)"/i)
  if (named?.[1]) return named[1]
  const openId = html.match(/id="open-([^"]+)"/)
  return openId?.[1] ?? null
}

export function parseSearchAjax(raw: string): { nbResultsFiche: number; success: boolean } | null {
  const obj = parseJsonish(raw)
  if (!obj) return null
  const rec = obj as { success?: unknown; data?: { nbResultsFiche?: unknown; nbResults?: unknown } }
  const n = Number(rec.data?.nbResultsFiche ?? rec.data?.nbResults ?? 0)
  const success = rec.success === 1 || rec.success === true || rec.success === '1'
  if (!Number.isFinite(n)) return null
  return { nbResultsFiche: n, success }
}

function parseJsonish(raw: string): unknown {
  const text = raw.trim()
  if (!text) return null
  try {
    if (text.startsWith('{') || text.startsWith('[')) return JSON.parse(text)
    const inner = text.replace(/^[^(]*\(/, '').replace(/\)\s*;?\s*$/, '')
    return JSON.parse(inner)
  } catch {
    return null
  }
}

function tidyPrice(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\u202f/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * TOTAL du séjour : span `#total-prestation-G-…` (ex. 432,47 €).
 * Ignore `N/A` (valeur avant `calculer_total_prestation`).
 */
export function parseTotalPrestationSpan(html: string): string | null {
  const matches = [...html.matchAll(/id="total-prestation-[^"]*"[^>]*>([^<]+)/gi)]
  for (const m of matches) {
    const text = tidyPrice(m[1] ?? '')
    if (!text || /^n\/?a$/i.test(text)) continue
    if (/\d/.test(text)) return text
  }
  return null
}

/** `{ success:1, data: { total: "432,47 €" } }` — réponse de calculerTotalPrestationAjax. */
export function parseCalculerTotal(raw: string): string | null {
  const obj = parseJsonish(raw)
  if (!obj || typeof obj !== 'object') return null
  const rec = obj as { success?: unknown; data?: { total?: unknown } }
  const ok = rec.success === 1 || rec.success === true || rec.success === '1'
  if (!ok) return null
  const total = rec.data?.total
  if (typeof total !== 'string') return null
  const text = tidyPrice(total)
  if (!text || /^n\/?a$/i.test(text) || !/\d/.test(text)) return null
  return text
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  if (!m) return undefined
  return m[2] ?? m[3] ?? m[4]
}

function hasFlag(tag: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${name}(?:\\s|=|>|$)`, 'i').test(tag)
}

/**
 * Serialize le form `frm-tarifs-*` comme `jQuery.serialize()` :
 * champs nommés, hors `disabled`, hors boutons. C'est le querystring
 * passé à `calculerTotalPrestationAjax`.
 */
export function serializeTarifsForm(html: string): string {
  const params = new URLSearchParams()
  for (const m of html.matchAll(/<input\b([^>]*)>/gi)) {
    const tag = m[1]
    if (hasFlag(tag, 'disabled')) continue
    const type = (attr(tag, 'type') || 'text').toLowerCase()
    if (/^(button|submit|reset|file|image)$/.test(type)) continue
    const name = attr(tag, 'name')
    if (!name) continue
    if ((type === 'checkbox' || type === 'radio') && !hasFlag(tag, 'checked')) continue
    params.append(name, attr(tag, 'value') ?? (type === 'checkbox' || type === 'radio' ? 'on' : ''))
  }
  for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const tag = m[1]
    if (hasFlag(tag, 'disabled')) continue
    const name = attr(tag, 'name')
    if (!name) continue
    const options = [...m[2].matchAll(/<option\b([^>]*)>/gi)]
    const selected = options.find((o) => hasFlag(o[1], 'selected')) ?? options[0]
    params.append(name, selected ? (attr(selected[1], 'value') ?? '') : '')
  }
  return params.toString()
}

export function cleanProductUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`
  } catch {
    return url.split('#')[0].split('?')[0]
  }
}

export function searchAjaxQuery(opts: {
  cid: string
  dash: string
  typePrestataire: string
  from: string
  to: string
  stay: number
  adults: number
  children: number
}): string {
  const p = new URLSearchParams({
    cid: opts.cid,
    action: 'searchAjax',
    type_prestataire: opts.typePrestataire,
    cle_fiche: opts.dash,
    datedeb: opts.from,
    datefin: opts.to,
    duree: String(opts.stay),
    adultes: String(opts.adults),
    enfants: String(opts.children),
    personnes: String(opts.adults + opts.children)
  })
  return p.toString()
}

export function tarifsAjaxQuery(opts: { cid: string; prestation: string }): string {
  return new URLSearchParams({
    action: 'detailTarifsPrestationAjax',
    cid: opts.cid,
    prestation: opts.prestation
  }).toString()
}
