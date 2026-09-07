/**
 * Saisie guidée des tarifs de forfait, station par station.
 *
 * ## Pourquoi cet écran existe
 *
 * Le référentiel livré porte deux durées — la journée et les six jours — et
 * 107 domaines sur 283 n'ont aucun tarif relevé : leur forfait est dérivé des
 * kilomètres de pistes et de l'altitude. Jusqu'ici rien ne permettait de
 * corriger cela depuis l'application. Un tarif faux se voyait, et restait.
 *
 * ## Ce que le formulaire accepte
 *
 * Une grille **partielle**. Deux durées valent mieux que rien : `forfaitPourDuree`
 * interpole entre elles et l'annonce. Exiger la grille complète — 1, 2, 3, 4, 5,
 * 6 jours, adulte et enfant — reviendrait à n'en obtenir aucune.
 *
 * Deux champs sont obligatoires dès qu'un tarif est saisi : la **date du relevé**
 * et la **source**. Un tarif sans date ne vaut rien trois mois plus tard, et un
 * tarif sans provenance n'est pas vérifiable. C'est tout ce qui est exigé.
 *
 * Le tarif enfant reste facultatif ligne par ligne : quand il manque, il est
 * dérivé à 80 % de l'adulte et **annoncé comme dérivé** — jamais présenté comme
 * relevé.
 */

import { useMemo, useState } from 'react'
import type { ForfaitSaisi, ForfaitSource, ForfaitTarif } from '@/domain/forfait'
import { forfaitUnitaires } from '@/domain/forfait'
import type { Domain } from '@/data/referentiel'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'

/** Durées proposées par le formulaire : celles que les stations vendent. */
const DUREES = [1, 2, 3, 4, 5, 6, 7]

const SOURCES: { key: ForfaitSource; label: 'forfait_src_officiel' | 'forfait_src_office' | 'forfait_src_autre' }[] = [
  { key: 'officiel', label: 'forfait_src_officiel' },
  { key: 'office', label: 'forfait_src_office' },
  { key: 'autre', label: 'forfait_src_autre' }
]

/** Aujourd'hui au format AAAA-MM-JJ, pour préremplir la date du relevé. */
function aujourdhui(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Un nombre positif, ou `null`. Jamais `NaN`, jamais zéro déguisé en valeur. */
function euros(v: string): number | null {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

type Brouillon = Record<number, { adulte: string; enfant: string }>

/**
 * État initial des champs.
 *
 * `livre` n'est passé que pour un domaine **réellement relevé**. C'est le point
 * qui compte : `forfaitOf` rend `estimateForfait(km, altitude)` pour les 107
 * domaines sans relevé, et pré-remplir avec ça revenait à proposer des chiffres
 * fabriqués dans un formulaire dont l'enregistrement les estampille « saisi le
 * … · site officiel ». Le formulaire blanchissait l'estimation qu'il était
 * censé remplacer — exactement le défaut que ce chantier corrige ailleurs.
 *
 * Pour un domaine estimé, les champs s'ouvrent donc **vides**, et l'estimation
 * reste affichée à côté, en lecture seule, pour servir d'ordre de grandeur sans
 * pouvoir être enregistrée par inadvertance.
 */
function brouillonDe(saisi: ForfaitSaisi | undefined, livre: ForfaitTarif[]): Brouillon {
  const out: Brouillon = {}
  for (const j of DUREES) out[j] = { adulte: '', enfant: '' }
  for (const t of livre) {
    if (out[t.jours]) out[t.jours] = { adulte: String(t.adulte), enfant: t.enfant != null ? String(t.enfant) : '' }
  }
  for (const t of saisi?.tarifs ?? []) {
    if (out[t.jours]) out[t.jours] = { adulte: String(t.adulte), enfant: t.enfant != null ? String(t.enfant) : '' }
  }
  return out
}

export function ForfaitEditor(): JSX.Element {
  const { t } = useI18n()
  const { state, patch, domains } = useApp()
  const { forfaitOf } = useDerived()

  const [q, setQ] = useState('')
  const [ouvert, setOuvert] = useState<number | null>(null)
  const [brouillon, setBrouillon] = useState<Brouillon>({})
  const [date, setDate] = useState(aujourdhui())
  const [source, setSource] = useState<ForfaitSource>('officiel')
  const [note, setNote] = useState('')

  const lignes = useMemo(() => {
    const mot = q.trim().toLowerCase()
    return [...domains]
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .filter((d) => (mot ? d.name.toLowerCase().includes(mot) : true))
      .map((d) => ({ d, resolved: forfaitOf(d), saisi: state.forfaitsSaisis[d.id] }))
  }, [domains, q, forfaitOf, state.forfaitsSaisis])

  const relevés = lignes.filter((l) => !l.resolved.estimated || l.saisi).length
  // Sans filtre, on annonce la couverture réelle ; avec un filtre, celle de la
  // sélection. Annoncer 176/283 sous une liste d'une ligne serait un chiffre
  // juste au mauvais endroit.
  const visibles = lignes.length

  const ouvrir = (d: Domain): void => {
    const saisi = state.forfaitsSaisis[d.id]
    const resolu = forfaitOf(d)
    setOuvert(d.id)
    // Un tarif estimé ne pré-remplit rien : voir `brouillonDe`.
    setBrouillon(brouillonDe(saisi, resolu.estimated ? [] : forfaitUnitaires(resolu)))
    setDate(saisi?.releveLe ?? aujourdhui())
    setSource(saisi?.source ?? 'officiel')
    setNote(saisi?.note ?? '')
  }

  const tarifs = useMemo<ForfaitTarif[]>(
    () =>
      DUREES.map((jours) => ({
        jours,
        adulte: euros(brouillon[jours]?.adulte ?? '') ?? 0,
        enfant: euros(brouillon[jours]?.enfant ?? '')
      })).filter((x) => x.adulte > 0),
    [brouillon]
  )

  const dateValide = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const peutEnregistrer = tarifs.length > 0 && dateValide

  const enregistrer = (id: number): void => {
    if (!peutEnregistrer) return
    patch({
      forfaitsSaisis: {
        ...state.forfaitsSaisis,
        [id]: { tarifs, releveLe: date, source, note: note.trim() || undefined }
      }
    })
    setOuvert(null)
  }

  const effacer = (id: number): void => {
    const next = { ...state.forfaitsSaisis }
    delete next[id]
    patch({ forfaitsSaisis: next })
    setOuvert(null)
  }

  return (
    <section className="panel settings__card" id="set-forfaits">
      <h2>{t('forfait_editor_title')}</h2>
      <p className="settings__help">{t('forfait_editor_help')}</p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0 6px' }}>
        <input
          type="search"
          className="field"
          style={{ flex: '1 1 240px', minWidth: 0, padding: '8px 10px', fontSize: 13 }}
          placeholder={t('forfait_search_placeholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t('forfait_search_placeholder')}
        />
        <span className="u-muted" style={{ fontSize: 12 }}>
          {t('forfait_coverage').replace('{n}', String(relevés)).replace('{t}', String(visibles))}
        </span>
      </div>

      <div style={{ display: 'grid', gap: 6, maxHeight: 520, overflowY: 'auto' }}>
        {lignes.slice(0, 120).map(({ d, resolved, saisi }) => {
          const editing = ouvert === d.id
          return (
            <div key={d.id} className="provrow provrow--stack">
              <div className="provrow__main">
                <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>{d.name}</span>
                <span className="u-muted" style={{ fontSize: 12, minWidth: 0 }}>
                  {saisi
                    ? t('forfait_row_saisi')
                        .replace('{n}', String(saisi.tarifs.length))
                        .replace('{d}', saisi.releveLe)
                    : resolved.estimated
                      ? t('forfait_row_estime')
                      : t('forfait_row_livre').replace('{d}', resolved.maj ?? '—')}
                </span>
                <span
                  className="u-nowrap"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: saisi ? 'var(--ok)' : resolved.estimated ? 'var(--warn)' : 'var(--muted)'
                  }}
                >
                  {saisi ? t('prov_manual') : resolved.estimated ? t('prov_estimated') : t('prov_measured')}
                </span>
                <button
                  type="button"
                  className="linkbtn linkbtn--sm u-nowrap"
                  onClick={() => (editing ? setOuvert(null) : ouvrir(d))}
                >
                  {saisi ? t('prov_modify') : t('forfait_enter')}
                </button>
              </div>

              {editing && (
                <div className="inset" style={{ padding: 14, display: 'grid', gap: 12 }}>
                  <p className="u-muted" style={{ margin: 0, fontSize: 12 }}>
                    {t('forfait_form_help')}
                  </p>
                  {resolved.estimated && (
                    <p className="u-muted" style={{ margin: 0, fontSize: 12, color: 'var(--warn)' }}>
                      {t('forfait_estimate_hint')
                        .replace('{j1}', resolved.j1 != null ? String(resolved.j1) : '—')
                        .replace('{j6}', resolved.j6 != null ? String(resolved.j6) : '—')}
                    </p>
                  )}

                  <div style={{ display: 'grid', gap: 6 }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '76px 1fr 1fr',
                        gap: 8,
                        fontSize: 11,
                        color: 'var(--muted)'
                      }}
                    >
                      <span>{t('forfait_col_days')}</span>
                      <span>{t('forfait_col_adult')}</span>
                      <span>{t('forfait_col_child')}</span>
                    </div>
                    {DUREES.map((j) => (
                      <div key={j} style={{ display: 'grid', gridTemplateColumns: '76px 1fr 1fr', gap: 8 }}>
                        <span style={{ fontSize: 13, alignSelf: 'center' }}>
                          {t('forfait_days_n').replace('{n}', String(j))}
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={0.5}
                          className="field field--panel u-num"
                          style={{ padding: '6px 8px', fontSize: 13 }}
                          placeholder={j === 6 ? '359' : ''}
                          aria-label={t('forfait_aria_adult').replace('{n}', String(j))}
                          value={brouillon[j]?.adulte ?? ''}
                          onChange={(e) =>
                            setBrouillon((b) => ({ ...b, [j]: { ...b[j], adulte: e.target.value } }))
                          }
                        />
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={0.5}
                          className="field field--panel u-num"
                          style={{ padding: '6px 8px', fontSize: 13 }}
                          placeholder={t('forfait_child_optional')}
                          aria-label={t('forfait_aria_child').replace('{n}', String(j))}
                          value={brouillon[j]?.enfant ?? ''}
                          onChange={(e) =>
                            setBrouillon((b) => ({ ...b, [j]: { ...b[j], enfant: e.target.value } }))
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      {t('forfait_date_label')}
                      <input
                        type="date"
                        className="field field--panel"
                        style={{ padding: '6px 8px', fontSize: 13 }}
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                      {t('forfait_source_label')}
                      <select
                        className="field field--panel"
                        style={{ padding: '6px 8px', fontSize: 13 }}
                        value={source}
                        onChange={(e) => setSource(e.target.value as ForfaitSource)}
                      >
                        {SOURCES.map((o) => (
                          <option key={o.key} value={o.key}>
                            {t(o.label)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, flex: '1 1 200px', minWidth: 0 }}>
                      {t('forfait_note_label')}
                      <input
                        type="text"
                        className="field field--panel"
                        style={{ padding: '6px 8px', fontSize: 13 }}
                        placeholder={t('forfait_note_placeholder')}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                  </div>

                  {/* Le compte rendu de ce qui sera enregistré, avant de valider :
                      on ne demande pas de faire confiance à un formulaire. */}
                  <p
                    className="u-muted"
                    style={{ margin: 0, fontSize: 12, color: peutEnregistrer ? undefined : 'var(--warn)' }}
                  >
                    {tarifs.length === 0
                      ? t('forfait_need_one')
                      : !dateValide
                        ? t('forfait_need_date')
                        : t('forfait_will_save')
                            .replace('{n}', String(tarifs.length))
                            .replace('{l}', tarifs.map((x) => `${x.jours} j`).join(', '))}
                  </p>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={!peutEnregistrer}
                      onClick={() => enregistrer(d.id)}
                    >
                      {t('forfait_save')}
                    </button>
                    <button type="button" className="btn" onClick={() => setOuvert(null)}>
                      {t('cancel')}
                    </button>
                    {saisi && (
                      <button type="button" className="linkbtn linkbtn--sm" onClick={() => effacer(d.id)}>
                        {t('forfait_clear')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {lignes.length > 120 && (
          <p className="u-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
            {t('forfait_truncated').replace('{n}', String(lignes.length - 120))}
          </p>
        )}
      </div>
    </section>
  )
}
