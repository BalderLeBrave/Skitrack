/**
 * Prix séjour daté d'une fiche Ingénie.
 *
 * Sur la SERP, `.prix_en_cours` est souvent un tarif d'appel (« à partir de »).
 * Le vrai montant est celui que le bouton **Rechercher** de l'onglet
 * « Disponibilités & Tarifs » (`#tarifs`) affiche : ce n'est pas un remplissage
 * de datepicker — c'est deux appels que le clic déclenche, dans la session du
 * navigateur :
 *
 *   1. `GET /booking?action=searchAjax&cle_fiche=PRESTATION-G-290-ST3N&datedeb=…`
 *      → `{ data: { nbResultsFiche: 1 } }` si le séjour est libre
 *   2. `GET /booking?action=detailPrestationsAjax&id=PRESTATION-G-290-ST3N&cid=…`
 *      → HTML `.col_tarif .prix_en_cours` (ignorer `.prix_barre`)
 *
 * Le code objet (`G|290|ST3N`) est publié dans le HTML de la fiche, dans les
 * paramètres de `IngenieWidgetDispo.Client` — pas dans l'URL. Les datepickers
 * du bandeau (`#widget-resa-menu`) sont un autre moteur : les cliquer relance
 * une recherche de liste, pas le tarif de *cette* annonce.
 */

export interface IngenieObjectRef {
  /** `G|290|ST3N` — identifiant pipe de la prestation. */
  pipe: string
  /** Identifiant moteur (`cid`), si le HTML le publie. */
  cid: string | null
}

/** Identifiant `cle_fiche` / `id` attendu par searchAjax et detailPrestationsAjax. */
export function prestationDash(pipe: string): string {
  const raw = pipe.trim()
  if (/^PRESTATION-/i.test(raw) || /^PRESTATAIRE-/i.test(raw)) return raw
  const parts = raw.split(/[|]/).filter(Boolean)
  if (parts.length === 0) return raw
  const kind = parts.length >= 3 ? 'PRESTATION' : 'PRESTATAIRE'
  return `${kind}-${parts.join('-')}`
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

export function parseSearchAjax(raw: string): { nbResultsFiche: number; success: boolean } | null {
  const text = raw.trim()
  if (!text) return null
  let data: unknown
  try {
    if (text.startsWith('{') || text.startsWith('[')) data = JSON.parse(text)
    else {
      const inner = text.replace(/^[^(]*\(/, '').replace(/\)\s*;?\s*$/, '')
      data = JSON.parse(inner)
    }
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const rec = data as { success?: unknown; data?: { nbResultsFiche?: unknown; nbResults?: unknown } }
  const n = Number(rec.data?.nbResultsFiche ?? rec.data?.nbResults ?? 0)
  const success = rec.success === 1 || rec.success === true || rec.success === '1'
  if (!Number.isFinite(n)) return null
  return { nbResultsFiche: n, success }
}

/**
 * Montant séjour dans le HTML de `detailPrestationsAjax`.
 *
 * `.prix_barre` est le tarif barré (appel). `.prix_en_cours` dans `.col_tarif`
 * est le prix du séjour demandé.
 */
export function parseStayPriceFromDetailHtml(html: string): string | null {
  if (/cookies sont n[ée]cessaires/i.test(html)) return null
  const col = html.match(/class="col_tarif"[^>]*>([\s\S]*?)<\/td>/i)
  const scope = col?.[1] ?? html
  const m = scope.match(/class="prix_en_cours"[^>]*>([^<]+)/i)
  if (!m) return null
  const text = m[1]
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text || null
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

export function detailAjaxQuery(opts: { cid: string; dash: string }): string {
  return new URLSearchParams({
    action: 'detailPrestationsAjax',
    id: opts.dash,
    cid: opts.cid
  }).toString()
}
