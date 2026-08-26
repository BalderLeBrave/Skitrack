import type { Week } from '@/data/snow'
import { seasonalityText, weekByArrival } from '@/data/snow'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { offresBudgetOpen, useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'

/**
 * Dégradé monochrome de la grille : bleu très pâle pour le moins cher, bleu
 * profond pour le plus cher.
 *
 * Interpolation RGB linéaire entre deux valeurs **écrites en clair** et non
 * dérivées des jetons. `color-mix()` sur `--accent` aurait suivi le thème, mais
 * la lisibilité du texte par-dessus dépend de la luminance exacte du fond : sur
 * une échelle continue, il faut savoir à quel palier basculer le texte en blanc,
 * et cela ne se calcule pas depuis une variable CSS. Les deux thèmes partagent
 * donc la même échelle, qui reste contrastée sur l'un comme sur l'autre.
 */
const HEAT_FROM = [234, 244, 252] as const
const HEAT_TO = [11, 90, 158] as const

/** Palier de bascule du texte : au-delà, le fond est trop sombre pour l'encre. */
const HEAT_INK_LIMIT = 0.55

function heatColor(t: number): string {
  const k = Math.min(1, Math.max(0, t))
  const mix = HEAT_FROM.map((from, i) => Math.round(from + (HEAT_TO[i] - from) * k))
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`
}

/**
 * Semaine de vacances scolaires.
 *
 * Le calendrier ne porte pas de drapeau : la zone est écrite dans le libellé de
 * la semaine — « 7 – 14 févr. (zone C) » — et c'est la seule donnée existante.
 * On la lit plutôt que d'en inventer une seconde source, `data/snow.ts` restant
 * hors périmètre de la refonte.
 */
function isSchoolHoliday(week: Week): boolean {
  return /zone/i.test(week.label)
}

/**
 * Quelle semaine, quel domaine.
 *
 * Les deux variables qui pèsent le plus sur le budget sont la station et la
 * semaine, et elles interagissent : une station de clientèle nationale
 * s'effondre hors vacances scolaires, une station de proximité bouge à peine.
 * Les regarder séparément fait rater les bonnes combinaisons, d'où la grille.
 * La teinte de fond code le coût dans le jeu affiché — la lecture se fait en
 * balayant, pas en comparant des nombres un à un.
 */
export function CombosPage(): JSX.Element {
  const { dur, eur, fmt } = useFormat()
  const { t: tr } = useI18n()
  const { state, patch, narrow } = useApp()
  const derived = useDerived()
  const { rows, lo, hi } = derived.comboGrid
  const span = Math.max(1, hi - lo)

  /**
   * Fond, texte et liseré d'une case.
   *
   * Une seule couleur pour toute la gamme : l'ancienne échelle multicolore
   * faisait lire une catégorie là où il n'y a qu'une quantité. Le liseré
   * intérieur du bas marque les semaines de vacances scolaires — l'information
   * qui explique la moitié des écarts de prix de la grille.
   */
  const cellStyle = (total: number, isMin: boolean, selected: boolean, week: Week): React.CSSProperties => {
    const k = (total - lo) / span
    // Curseur au bout : plus de budget, donc plus rien « au-dessus ».
    const over = !offresBudgetOpen(state.offresBudget) && total > state.offresBudget
    const holiday = isSchoolHoliday(week)
    return {
      border: selected ? '2px solid var(--accent)' : `1px solid ${over ? 'var(--border-soft)' : 'var(--border)'}`,
      borderRadius: 9,
      padding: selected ? '8px 5px' : '9px 6px',
      fontSize: 13,
      fontVariantNumeric: 'tabular-nums',
      cursor: 'pointer',
      textAlign: 'center',
      fontWeight: isMin ? 700 : 500,
      color: over ? 'var(--dim)' : k > HEAT_INK_LIMIT ? '#ffffff' : '#133f63',
      background: over ? 'transparent' : heatColor(k),
      boxShadow: holiday ? 'inset 0 -3px 0 var(--accent)' : undefined
    }
  }

  /** Légende de l'échelle : trois paliers nommés, pas une rampe muette. */
  const legend = [
    { k: 0.05, label: tr('combo_legend_cheap') },
    { k: 0.5, label: tr('combo_legend_mid') },
    { k: 0.95, label: tr('combo_legend_dear') }
  ]

  const selection = state.comboSel
  const selDomain = selection ? derived.filtered.find((d) => d.id === selection.domainId) : undefined
  const selWeek = selection ? weekByArrival(selection.week) : undefined
  const voteKey = selection ? derived.comboKey(selection.domainId, selection.week) : ''

  const setVote = (index: number, value: number): void => {
    const cur = (state.votes[voteKey] ?? []).slice()
    cur[index] = cur[index] === value ? 0 : value
    patch({ votes: { ...state.votes, [voteKey]: cur } })
  }

  return (
    <div className="page" style={{ padding: 0 }}>
      <div className="page__inner" style={{ maxWidth: 1240, padding: '26px 28px 40px' }}>
        <header style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Quelle semaine, quel domaine
          </h2>
        </header>
        <p className="lede">
          Coût complet du séjour pour {derived.adults} adulte(s) et {derived.kids} enfant(s), logement le moins cher du
          domaine, forfaits, route, matériel et cours compris. Cliquez une case pour ouvrir cette semaine sur ce
          domaine.
        </p>

        {rows.length === 0 && (
          <div className="panel panel--empty">
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Aucun domaine ne passe les filtres actuels.</p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="heatlegend">
            {legend.map((l) => (
              <span key={l.label} className="heatlegend__item">
                <span
                  className="heatlegend__swatch"
                  style={{ background: heatColor(l.k) }}
                  aria-hidden
                />
                {l.label}
              </span>
            ))}
            <span className="heatlegend__item">
              <span className="heatlegend__swatch heatlegend__swatch--holiday" aria-hidden />
              {tr('combo_legend_holiday')}
            </span>
          </div>
        )}

        {/* En fenêtre étroite, la grille devient une pile de cartes : sept
            colonnes sous 1 180 px ne se lisent plus. */}
        {narrow ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {rows.map((r) => (
              <div key={r.d.id} className="panel" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, flex: '1 1 auto', minWidth: 0 }}>
                    {r.d.name}
                  </p>
                  <strong className="u-num crn-calcul" style={{ color: 'var(--text)' }}>
                    {eur(r.min)}
                  </strong>
                </div>
                <p className="u-muted" style={{ margin: '2px 0 10px', fontSize: 11 }}>
                  {r.d.massif} · {fmt(r.d.min)} m · {dur(derived.worstTravel(r.d))} · {seasonalityText(r.d)}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(104px,1fr))', gap: 6 }}>
                  {r.cells.map((c) => (
                    <button
                      key={c.week.arr}
                      type="button"
                      style={cellStyle(
                        c.total,
                        c.total === r.min,
                        selection?.domainId === r.d.id && selection.week === c.week.arr,
                        c.week
                      )}
                      onClick={() =>
                        patch({
                          comboSel: { domainId: r.d.id, week: c.week.arr, dep: c.week.dep, total: c.total }
                        })
                      }
                    >
                      <span style={{ display: 'block', fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>
                        {c.week.label}
                      </span>
                      {eur(c.total)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          rows.length > 0 && (
            <div className="panel" style={{ padding: '16px 18px', overflowX: 'auto' }}>
              <div className="combogrid">
                <span className="u-muted" style={{ fontSize: 12 }}>
                  Domaine
                </span>
                {rows[0].cells.map((c) => (
                  <span key={c.week.arr} className="u-muted" style={{ fontSize: 12, textAlign: 'center' }}>
                    {c.week.label}
                  </span>
                ))}
                <span className="u-muted" style={{ fontSize: 12, textAlign: 'right' }}>
                  Meilleur
                </span>

                {rows.map((r) => (
                  <div key={r.d.id} style={{ display: 'contents' }}>
                    <div style={{ minWidth: 0, padding: '6px 0' }}>
                      <p className="u-ellipsis" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                        {r.d.name}
                      </p>
                      <p className="u-muted" style={{ margin: '1px 0 0', fontSize: 11 }}>
                        {r.d.massif} · {fmt(r.d.min)} m · {dur(derived.worstTravel(r.d))} · {seasonalityText(r.d)}
                      </p>
                    </div>
                    {r.cells.map((c) => (
                      <button
                        key={c.week.arr}
                        type="button"
                        style={cellStyle(
                          c.total,
                          c.total === r.min,
                          selection?.domainId === r.d.id && selection.week === c.week.arr,
                          c.week
                        )}
                        onClick={() =>
                          patch({
                            comboSel: { domainId: r.d.id, week: c.week.arr, dep: c.week.dep, total: c.total }
                          })
                        }
                      >
                        {eur(c.total)}
                      </button>
                    ))}
                    <strong className="u-num crn-calcul" style={{ textAlign: 'right', fontSize: 14, color: 'var(--text)' }}>
                      {eur(r.min)}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {selection && (
          <div className="panel combosel">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600, flex: '1 1 auto', minWidth: 0 }}>
                {selDomain?.name ?? ''} · {selWeek?.label ?? ''}
              </p>
              <strong className="u-num" style={{ color: 'var(--text)' }}>
                <span className="crn-calcul">{eur(selection.total)}</span> tout compris
              </strong>
              <button type="button" className="linkbtn linkbtn--muted" onClick={() => patch({ comboSel: null })}>
                fermer ✕
              </button>
            </div>

            <div>
              <p className="u-muted" style={{ margin: '0 0 6px', fontSize: 12 }}>
                {(() => {
                  const v = derived.voteScore(voteKey)
                  if (v > 0) return `+${v} au vote du groupe`
                  if (v < 0) return `${v} au vote du groupe`
                  return 'aucun vote pour l’instant'
                })()}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {state.people.map((p, i) => (
                  <div key={p.id} className="votepill">
                    <span style={{ fontSize: 12 }}>{p.first}</span>
                    <button
                      type="button"
                      className={`seg__btn${derived.voteOf(voteKey, i) === 1 ? ' seg__btn--on' : ''}`}
                      onClick={() => setVote(i, 1)}
                      aria-label={`Pour, ${p.first}`}
                    >
                      ＋
                    </button>
                    <button
                      type="button"
                      className={`seg__btn${derived.voteOf(voteKey, i) === -1 ? ' seg__btn--on' : ''}`}
                      onClick={() => setVote(i, -1)}
                      aria-label={`Contre, ${p.first}`}
                    >
                      −
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() =>
                  patch({
                    decision: { domainId: selection.domainId, week: selection.week, lodgingId: null },
                    arrDate: selection.week,
                    depDate: selection.dep,
                    tab: 'decision',
                    comboSel: null
                  })
                }
              >
                Retenir cette combinaison →
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  patch({
                    arrDate: selection.week,
                    depDate: selection.dep,
                    lodgingDomainId: selection.domainId,
                    tab: 'logements',
                    comboSel: null
                  })
                }
              >
                Voir les logements
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
