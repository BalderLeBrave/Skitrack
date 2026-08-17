import { CloseIcon } from './Icons'
import type { Lodging } from '@/data/lodgings'
import type { Domain } from '@/data/referentiel'
import { useFormat } from '@/hooks/useFormat'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useI18n } from '@/i18n'

interface Cell {
  txt: string
  best: boolean
  /** Longueur de la barre de proportion, 0 à 1. `null` = ligne non chiffrée. */
  ratio: number | null
}

interface Row {
  label: string
  cells: Cell[]
}

/** Marque la meilleure valeur d'une ligne. Sans comparaison possible (une seule
 *  colonne), rien n'est marqué : « meilleur sur un » n'a pas de sens. */
function bestOf(values: number[], dir: 'min' | 'max'): boolean[] {
  if (values.length < 2) return values.map(() => false)
  const target = dir === 'min' ? Math.min(...values) : Math.max(...values)
  return values.map((v) => v === target)
}

/**
 * Barres de proportion d'une ligne chiffrée.
 *
 * Sur un critère où le **petit gagne** — prix, distance — la proportion est
 * inversée : sans cela la meilleure valeur porterait la barre la plus courte,
 * et l'œil lirait exactement le contraire de ce que la ligne dit. La barre du
 * gagnant est toujours pleine, ce qui donne le repère d'où partent les autres.
 *
 * Le rapport est calculé sur l'écart entre le meilleur et le pire, pas sur zéro :
 * quatre logements entre 1 900 et 2 100 € donneraient sinon quatre barres
 * identiques, et la ligne ne dirait plus rien.
 */
function ratios(values: number[], dir: 'min' | 'max'): (number | null)[] {
  if (values.length < 2) return values.map(() => null)
  const best = dir === 'min' ? Math.min(...values) : Math.max(...values)
  const worst = dir === 'min' ? Math.max(...values) : Math.min(...values)
  const span = Math.abs(best - worst)
  // Toutes égales : quatre barres pleines valent mieux que quatre barres vides,
  // qui laisseraient croire à une donnée absente.
  if (span === 0) return values.map(() => 1)
  return values.map((v) => Math.max(0.06, 1 - Math.abs(v - best) / span))
}

export function ComparePanel({ domain }: { domain: Domain }): JSX.Element {
  const { t } = useI18n()
  const { eur, fmtDay } = useFormat()
  const { state, patch } = useApp()
  const derived = useDerived()

  const list = state.compareIds
    .map((id) => derived.lodgAll.find((l) => l.id === id))
    .filter((l): l is Lodging => Boolean(l))
  const costs = list.map((l) => derived.sejourCost(l, domain))
  const grid = { gridTemplateColumns: `200px repeat(${Math.max(list.length, 1)}, 1fr)` }

  /** Ligne chiffrée : marquage du meilleur et barres, tirés des mêmes valeurs. */
  const numeric = (
    label: string,
    values: number[],
    dir: 'min' | 'max',
    render: (v: number, index: number) => string
  ): Row => {
    const flags = bestOf(values, dir)
    const bars = ratios(values, dir)
    return {
      label,
      cells: values.map((v, i) => ({ txt: render(v, i), best: flags[i], ratio: bars[i] }))
    }
  }

  /** Ligne non chiffrée : pas de barre. Une capacité ou une source ne se
   *  classe pas, et lui donner une proportion inventerait un ordre. */
  const plain = (label: string, texts: string[]): Row => ({
    label,
    cells: texts.map((txt) => ({ txt, best: false, ratio: null }))
  })

  const rows: Row[] = list.length
    ? [
        numeric(t('cmp_lodging_price'), list.map((l) => l.total), 'min', (v) => eur(v)),
        numeric(t('cmp_per_person_night'), list.map((l) => l.pp), 'min', (v) => eur(v)),
        numeric(t('cmp_full_cost'), costs.map((c) => c.total), 'min', (v) => eur(v)),
        numeric(
          t('cmp_walk_to_runs'),
          list.map((l) => l.dist),
          'min',
          (_, i) => `${list[i].dist} m · +${list[i].den} m`
        ),
        plain(
          t('cmp_capacity'),
          // 0 = la source ne l'annonce pas ; « non renseignée » plutôt que « 0 pers ».
          list.map(
            (l) =>
              [l.pers ? `${l.pers} pers` : null, l.ch ? `${l.ch} ch` : null, l.m2 ? `${l.m2} m²` : null]
                .filter(Boolean)
                .join(' · ') || t('not_provided_fem')
          )
        ),
        numeric(
          t('cmp_guest_rating'),
          list.map((l) => parseFloat(l.note.replace(',', '.'))),
          'max',
          (_, i) => `${list[i].note}/5 (${list[i].avis})`
        ),
        plain(
          t('cmp_cancellation'),
          list.map((l) => (l.annul ? t('cmp_cancel_free') : t('cmp_cancel_none')))
        ),
        plain(t('cmp_source'), list.map((l) => l.src))
      ]
    : []

  const voters = state.people.length ? state.people.map((p) => p.first) : ['Vous']

  const setVote = (key: string, index: number, value: number): void => {
    const cur = (state.votes[key] ?? []).slice()
    cur[index] = cur[index] === value ? 0 : value
    patch({ votes: { ...state.votes, [key]: cur } })
  }

  const copyRecap = (): void => {
    const lines = [
      `Comparatif SKITRACK — ${domain.name} · ${state.arrDate} → ${state.depDate} · ${state.travelers} pers`
    ]
    list.forEach((l, i) => {
      lines.push(
        `• ${l.name} (${l.src}) — logement ${eur(l.total)} · séjour complet ${eur(costs[i].total)} · pistes à ${l.dist} m`
      )
    })
    void navigator.clipboard.writeText(lines.join('\n')).catch(() => undefined)
  }

  return (
    <div className="compare" role="dialog" aria-modal="true" aria-label="Comparateur">
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header className="compare__head">
          <h2>Comparateur</h2>
          <span className="u-muted" style={{ fontSize: 13 }}>
            {domain.name} · {fmtDay(state.arrDate)} → {fmtDay(state.depDate)} · {state.travelers} voyageurs
            <br />
            {t('cmp_trophy_note')}
          </span>
          <span className="u-spacer" />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="u-muted" style={{ fontSize: 12 }}>
              Voter en tant que
            </span>
            {voters.map((name, i) => (
              <button
                key={name + i}
                type="button"
                className={`chip${i === state.voter ? ' chip--on' : ''}`}
                style={{ fontSize: 12 }}
                onClick={() => patch({ voter: i })}
              >
                {name}
              </button>
            ))}
          </div>
          <button type="button" className="linkbtn" onClick={copyRecap}>
            {t('copy_summary')}
          </button>
          <button type="button" className="linkbtn" onClick={() => window.print()}>
            Exporter en PDF
          </button>
          <button type="button" className="linkbtn" onClick={() => patch({ compareIds: [], compareOpen: false })}>
            Vider
          </button>
          <button type="button" className="btn btn--pill" onClick={() => patch({ compareOpen: false })}>
            {t('back_to_results')}
          </button>
        </header>

        <div className="panel" style={{ overflow: 'hidden' }}>
          <div className="compare__grid" style={grid}>
            <div style={{ padding: 14 }} />
            {list.map((l) => (
              <div key={l.id} className="compare__col">
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <strong style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{l.name}</strong>
                  <button
                    type="button"
                    className="iconbtn iconbtn--bare"
                    onClick={() => patch({ compareIds: state.compareIds.filter((i) => i !== l.id) })}
                    aria-label="Retirer du comparateur"
                  >
                    <CloseIcon />
                  </button>
                </div>
                <span className="u-muted" style={{ fontSize: 12 }}>
                  {l.src}
                </span>
              </div>
            ))}
          </div>

          {rows.map((row) => (
            <div key={row.label} className="compare__grid" style={grid}>
              <div className="compare__label">{row.label}</div>
              {row.cells.map((cell, i) => (
                <div key={i} className={`compare__cell${cell.best ? ' compare__cell--best' : ''}`}>
                  <span className="compare__val">
                    {/* Le trophée porte le marquage : la couleur seule ne suffit
                        pas à un lecteur qui ne distingue pas le vert. */}
                    {cell.best && <span aria-label={t('cmp_best')}>🏆</span>} {cell.txt}
                  </span>
                  {cell.ratio != null && (
                    <span className="compare__bar" aria-hidden>
                      <span
                        className="compare__bar-fill"
                        style={{ width: `${Math.round(cell.ratio * 100)}%` }}
                      />
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}

          <div className="compare__grid" style={grid}>
            <div className="compare__label">
              Vote du groupe
              <br />
              <span style={{ fontSize: 11 }}>
                vous votez comme <strong>{voters[state.voter] ?? voters[0]}</strong>
              </span>
            </div>
            {list.map((l) => {
              const key = String(l.id)
              const mine = derived.voteOf(key, state.voter)
              const tally = derived.voteScore(key)
              return (
                <div key={l.id} className="compare__vote">
                  <button
                    type="button"
                    className="votebtn"
                    style={{
                      borderColor: mine === 1 ? 'var(--ok)' : 'var(--border)',
                      color: mine === 1 ? 'var(--ok)' : 'var(--muted)'
                    }}
                    onClick={() => setVote(key, state.voter, 1)}
                  >
                    Pour
                  </button>
                  <button
                    type="button"
                    className="votebtn"
                    style={{
                      borderColor: mine === -1 ? 'var(--warn)' : 'var(--border)',
                      color: mine === -1 ? 'var(--warn)' : 'var(--muted)'
                    }}
                    onClick={() => setVote(key, state.voter, -1)}
                  >
                    Contre
                  </button>
                  <span
                    className="u-num"
                    style={{
                      fontWeight: 700,
                      color: tally > 0 ? 'var(--ok)' : tally < 0 ? 'var(--warn)' : 'var(--muted)'
                    }}
                  >
                    {tally > 0 ? '+' : ''}
                    {tally}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <p className="u-muted" style={{ margin: '12px 0 0', fontSize: 12 }}>
          * Coût complet : logement + forfaits 6 j (tarifs adulte et enfant) + route aller-retour par foyer + matériel
          et cours ESF si activés dans la fiche. Ajoutez jusqu’à 4 logements depuis les cartes ou la fiche.
        </p>
      </div>
    </div>
  )
}
