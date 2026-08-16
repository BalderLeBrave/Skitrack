import type { MouseEvent } from 'react'
import { AltitudeProfile } from './AltitudeProfile'
import type { Domain } from '@/data/referentiel'
import { enfantPrice, hasCoords } from '@/data/referentiel'
import { snowDepths, snowfallText } from '@/data/weather'
import { useFormat } from '@/hooks/useFormat'
import { scoreBadgeColors, scoreLabel } from '@/domain/scoring'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useWeather } from '@/state/weather'

interface Props {
  domain: Domain
  scaleMin: number
  scaleMax: number
}

export function DomainCard({ domain: d, scaleMin, scaleMax }: Props): JSX.Element {
  const { dur, eur, fmt } = useFormat()
  const { state, patch } = useApp()
  const derived = useDerived()
  const { weatherOf } = useWeather()
  const { t } = useI18n()

  const selected = d.id === state.selectedId
  const dense = state.density === 'compact'
  const score = derived.scoreOf(d)
  const scoreVal = Math.round(score.total)
  const forfait = derived.forfaitOf(d)
  const weather = weatherOf(d.id)
  const snow = snowDepths(weather)
  const dark = state.theme === 'dark'

  const stop = (e: MouseEvent): void => e.stopPropagation()

  /**
   * Ligne de contexte, composée hors du JSX.
   *
   * Ce sont les données qui départagent deux domaines déjà comparables, pas
   * celles qui décident : elles tiennent en une ligne grise sous les quatre
   * chiffres plutôt que de leur disputer l'attention.
   */
  const metaLine = [
    `${t('altitude_top_lower')} ${fmt(d.max)} m`,
    `${t('amplitude_lower')} ${fmt(d.max - d.min)} m`,
    `${d.lifts} ${t('lifts_plural')}`,
    `${t('snow_front_lower')} ${fmt(d.village)} m${d.curated ? '' : ` (${t('estimated')})`}`,
    `${fmt(derived.worstDistance(d))} km ${t('of_road')}`
  ].join(' · ')

  const rows = [...score.rows].sort((a, b) => b.contrib - a.contrib)

  return (
    <article
      className={`domcard${selected ? ' domcard--on' : ''}${dense ? ' domcard--dense' : ''}`}
      onClick={() => patch({ selectedId: d.id })}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
    >
      <AltitudeProfile min={d.min} max={d.max} village={d.village} scaleMin={scaleMin} scaleMax={scaleMax} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Plus de carré d'initiales : le titre prend toute la largeur, et la
            hiérarchie de la vignette repose sur les quatre chiffres. */}
        <header className="domcard__head">
          <h3 className="domcard__name">{d.name}</h3>
          <div className="domcard__badges">
            {d.glacier && <span className="tag tag--link">{t('glacier')}</span>}
            {d.pass && <span className="tag">{d.pass}</span>}
            {d.id === state.pinnedId && (
              <span className="tag tag--pin">
                {derived.matchesFilters(d) ? t('card_pin_from_map') : t('card_pin_out')}
              </span>
            )}
            {d.curated && (
              <span className="tag tag--ok" title={t('card_checked')}>
                ✓
              </span>
            )}
            {/* Sans coordonnées, ce domaine sort de la carte, du tri par
                distance et du relevé météo. Le dire ici évite de le chercher
                en vain sur la carte. */}
            {!hasCoords(d) && (
              <span className="tag" title={t('card_off_map_title')}>
                {t('card_off_map')}
              </span>
            )}
          </div>
        </header>

        <p className="domcard__sub">{[d.massif, d.region, 'FR'].filter(Boolean).join(' · ')}</p>

        {/* Quatre chiffres décisifs plutôt que sept données à égalité : le bas
            des pistes porte l'accent, seul critère structurant du choix. Le
            reste descend dans la ligne de contexte en dessous. */}
        <dl className="domcard__figs">
          <div>
            <dt>{t('altitude_bottom')}</dt>
            <dd className="u-num domcard__fig domcard__fig--accent">{fmt(d.min)} m</dd>
          </div>
          <div>
            <dt>{t('slopes')}</dt>
            <dd className="u-num domcard__fig">{fmt(d.km)} km</dd>
          </div>
          <div>
            {/* Un tarif estimé est signalé par le « ≈ » : le lecteur doit
                pouvoir distinguer d'un coup d'œil un prix relevé d'un prix
                dérivé de la taille du domaine. */}
            <dt>{t('pass_6d_adult')}</dt>
            <dd
              className="u-num domcard__fig"
              title={forfait.estimated ? t('price_estimated') : undefined}
            >
              {forfait.j6 != null ? `${forfait.estimated ? '≈ ' : ''}${eur(forfait.j6)}` : '—'}
            </dd>
          </div>
          <div>
            <dt>{t('travel_time')}</dt>
            <dd className="u-num domcard__fig u-nowrap">{dur(derived.worstTravel(d))}</dd>
          </div>
        </dl>

        <p className="domcard__meta">{metaLine}</p>

        <p className="domcard__snow">
          {t('snow_label')}{' '}
          {/* Rien tant que le modèle n'a pas répondu : une hauteur de neige
              inventée est exactement ce que cet écran ne doit pas produire. */}
          <strong className="u-num">
            {snow.releve ? `${snow.bas ?? '—'} / ${snow.haut ?? '—'} cm` : '…'}
          </strong>{' '}
          <span className="u-muted">{t('snow_base_top')}</span> ·{' '}
          <span className="u-muted">{snowfallText(weather)}</span>
          <span className="u-spacer" />
          <button
            type="button"
            className="linkbtn"
            onClick={(e) => {
              stop(e)
              patch({ domFicheId: d.id, selectedId: d.id })
            }}
          >
            {t('sheet_resort_link')}
          </button>
        </p>

        <footer className="domcard__footer">
          <button
            type="button"
            className="btn btn--primary btn--small u-nowrap"
            onClick={(e) => {
              stop(e)
              // Demander les logements d'un domaine, c'est demander un relevé :
              // on entre en `'searching'`. Si les dates ou le groupe manquent,
              // l'effet de `LodgingsPage` retombe de lui-même sur `'criteria'`
              // — l'écran de chargement ne peut donc pas rester sans issue.
              patch({
                tab: 'logements',
                lodgingDomainId: d.id,
                selectedId: d.id,
                lodgPhase: 'searching',
                lodgSearchMsg: null
              })
            }}
          >
            Voir les logements →
          </button>

          <button
            type="button"
            className="scorebadge"
            style={scoreBadgeColors(scoreVal, dark)}
            onClick={(e) => {
              stop(e)
              patch({ scoreOpenId: state.scoreOpenId === d.id ? null : d.id })
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>{scoreVal}</span>
            <span style={{ opacity: 0.75, fontSize: 12 }}>/100</span>
            <span style={{ fontWeight: 600, fontSize: 12 }}>{scoreLabel(scoreVal)}</span>
            <span style={{ fontSize: 12, opacity: 0.75 }}>Pourquoi ?</span>
          </button>

          <button
            type="button"
            className="linkbtn"
            onClick={(e) => {
              stop(e)
              patch({ forfaitOpenId: state.forfaitOpenId === d.id ? null : d.id })
            }}
          >
            {t('pass_details')}
          </button>

        </footer>

        {state.forfaitOpenId === d.id && (
          <div className="domcard__drawer" onClick={stop}>
            <p className="domcard__drawer-title">Forfaits · {forfait.zone ?? '—'}</p>
            <p className="domcard__drawer-sub">
              {forfait.estimated
                ? 'Tarif non relevé sur ce domaine : estimation dérivée des kilomètres de pistes et de l’altitude, ' +
                  'à confirmer sur la billetterie. Il n’entre pas dans le score de pertinence.'
                : `Tarifs publics haute saison, relevés sur le site officiel du domaine le ${forfait.maj ?? '—'}.`}
            </p>
            <dl className="domcard__drawer-grid">
              <div>
                <dt>6 jours adulte</dt>
                <dd className="u-num" style={{ fontWeight: 700 }}>
                  {forfait.j6 != null ? `${forfait.estimated ? '≈ ' : ''}${eur(forfait.j6)}` : '—'}
                </dd>
              </div>
              <div>
                <dt>{t('pass_day_adult')}</dt>
                <dd className="u-num">{forfait.j1 != null ? eur(forfait.j1) : '—'}</dd>
              </div>
              <div>
                <dt>6 jours enfant</dt>
                <dd className="u-num">{forfait.enf6 != null ? eur(forfait.enf6) : '—'}</dd>
              </div>
              <div>
                <dt>{t('pass_per_ski_day')}</dt>
                <dd className="u-num">{forfait.j6 != null ? eur(Math.round(forfait.j6 / 6)) : '—'}</dd>
              </div>
              <div>
                <dt>Famille 2+2, 6 j</dt>
                <dd className="u-num">
                  {forfait.j6 != null ? eur(Math.round((forfait.j6 * 2 + enfantPrice(forfait) * 2) * 0.95)) : '—'}
                </dd>
              </div>
              <div>
                <dt>Saison adulte</dt>
                <dd className="u-num">{forfait.saison != null ? eur(forfait.saison) : '—'}</dd>
              </div>
            </dl>
            <p className="domcard__drawer-note">
              Tarif famille estimé (2 adultes + 2 enfants, remise usuelle de 5 %) — à confirmer sur la billetterie.
              Assurance et forfaits piéton non comptés.
            </p>
          </div>
        )}

        {state.scoreOpenId === d.id && (
          <div className="domcard__drawer" onClick={stop}>
            <p className="domcard__drawer-title">Détail du score · {scoreVal}/100</p>
            <p className="domcard__drawer-sub" style={{ maxWidth: '60ch' }}>
              Chaque critère est noté sur une échelle absolue de référence — par exemple un bas de pistes à 1 400 m vaut
              62, à 2 000 m vaut 90 — et non par comparaison aux autres résultats. Un domaine correct reste donc bien
              noté même à côté d’un domaine exceptionnel. La note est ensuite multipliée par son poids ; le score est la
              somme des contributions.
            </p>
            <ul className="scorelist">
              {rows.map((r) => (
                <li key={r.crit.key}>
                  <div className="scorelist__head">
                    <span className="u-ellipsis">
                      {r.crit.label}{' '}
                      <span className="u-muted">
                        {r.crit.key === 'travel_time'
                          ? dur(r.raw)
                          : r.crit.key === 'glacier' || r.crit.key === 'linked'
                            ? r.raw
                              ? 'oui'
                              : 'non'
                            : `${fmt(r.raw)}${r.crit.unit}`}
                      </span>
                    </span>
                    <span className="u-muted u-nowrap">
                      {Math.round(r.note)}/100 × {Math.round(r.weightAdj * 100)} % ={' '}
                      <span style={{ color: 'var(--text)', fontWeight: 700 }}>+{r.contrib.toFixed(1)}</span>
                    </span>
                  </div>
                  <span className="bar">
                    <span className="bar__fill" style={{ width: `${Math.max(2, Math.round(r.note))}%` }} />
                  </span>
                  <span className="scorelist__why">{r.crit.why}</span>
                </li>
              ))}
            </ul>
            {score.coverage < 0.999 && (
              <p className="notice notice--warn" style={{ marginTop: 8, fontSize: 11 }}>
                Score calculé sur {Math.round(score.coverage * 100)} % des poids : les critères sans donnée sont exclus
                et les poids restants renormalisés.
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
