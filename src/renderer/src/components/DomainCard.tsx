import type { MouseEvent } from 'react'
import { AltitudeProfile } from './AltitudeProfile'
import type { Domain } from '@/data/referentiel'
import { enfantPrice, hasCoords } from '@/data/referentiel'
import { snowDepths, snowfallText } from '@/data/weather'
import { useFormat } from '@/hooks/useFormat'
import { massifColor } from '@/domain/massif'
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
  const { dur, eur, fmt, locale } = useFormat()
  const { state, patch } = useApp()
  const derived = useDerived()
  const { weatherOf } = useWeather()
  const { t } = useI18n()

  // Distance à la commune cherchée : n'a de sens que lorsqu'une commune l'est.
  const geoDist = derived.geoDistance(d)
  const geoDistTxt =
    state.geo && geoDist != null
      ? `${fmt(Math.round(geoDist))} km ${t('geo_from')} ${state.geo.label.split(' ')[0]}`
      : null

  const selected = d.id === state.selectedId
  const hovered = d.id === state.hoveredId
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

  const tint = massifColor(d.massif)

  /**
   * Note sur 5, dérivée du score sur 100.
   *
   * Même classement, échelle qu'on lit d'un coup d'œil : « 4,2 » se compare
   * sans effort à l'habitude prise sur les sites de réservation, là où « 84 »
   * demande de se rappeler sur quoi il est noté. Le score complet reste dans le
   * `title` et derrière le bouton « Pourquoi ? » — la note ne remplace pas
   * l'explication, elle en donne l'ordre de grandeur.
   */
  const note = (Math.round(scoreVal / 2) / 10).toLocaleString(locale, { minimumFractionDigits: 1 })

  /**
   * Étiquettes **dérivées des données**, jamais saisies.
   *
   * Chacune répond à une question qu'on se pose en parcourant la liste — est-ce
   * grand, est-ce haut, est-ce cher — et son `title` donne la valeur qui l'a
   * déclenchée : une étiquette qui affirme sans pouvoir être vérifiée ne vaut
   * pas mieux qu'un argument de brochure. Quatre au plus, sinon la ligne se
   * transforme en nuage de mots-clés.
   */
  const tags: { txt: string; title: string; color: string; soft: string }[] = []
  if (d.glacier) tags.push({ txt: t('glacier'), title: t('glacier'), color: 'var(--brand)', soft: 'var(--brand-soft)' })
  if (d.pass)
    tags.push({
      txt: d.pass,
      title: `${t('tag_common_pass')} ${d.pass}`,
      color: 'var(--violet)',
      soft: 'var(--violet-soft)'
    })
  if (d.km >= 200)
    tags.push({
      txt: t('tag_large_area'),
      title: `${fmt(d.km)} km ${t('of_runs')}`,
      color: 'var(--ok)',
      soft: 'var(--ok-soft)'
    })
  if (d.min >= 1800)
    tags.push({
      txt: t('tag_high_altitude'),
      title: `${t('altitude_bottom')} ${fmt(d.min)} m`,
      color: 'var(--brand)',
      soft: 'var(--brand-soft)'
    })
  if (forfait.j6 != null && forfait.j6 <= 260)
    tags.push({
      txt: t('tag_moderate_pass'),
      title: `${t('pass_6d_adult')} ${eur(forfait.j6)}`,
      color: 'var(--ok)',
      soft: 'var(--ok-soft)'
    })
  if (d.curated)
    tags.push({ txt: `✓ ${t('tag_verified')}`, title: t('card_checked'), color: 'var(--muted)', soft: 'var(--surface)' })
  const shownTags = tags.slice(0, 4)

  return (
    <article
      className={`domcard${selected ? ' domcard--on' : ''}${dense ? ' domcard--dense' : ''}${
        hovered ? ' domcard--hover' : ''
      }`}
      onClick={() => patch({ selectedId: d.id })}
      // Survol croisé avec la carte : la vignette allume son épingle, et
      // l'épingle allume sa vignette. Purement visuel — `hoveredId` n'entre
      // dans aucun filtre.
      onMouseEnter={() => patch({ hoveredId: d.id })}
      onMouseLeave={() => patch({ hoveredId: state.hoveredId === d.id ? null : state.hoveredId })}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
    >
      <AltitudeProfile min={d.min} max={d.max} village={d.village} scaleMin={scaleMin} scaleMax={scaleMax} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Ligne haute : d'où vient ce domaine (à gauche), ce qu'il vaut (à
            droite). Deux repères qu'on lit sans lire, avant même le nom. */}
        <header className="domcard__head">
          <span className="domcard__massif" style={{ background: tint.soft, color: tint.ink }}>
            {d.massif || d.region || 'France'}
          </span>
          <span className="u-spacer" />
          {d.id === state.pinnedId && (
            <span className="tag tag--pin">
              {derived.matchesFilters(d) ? t('card_pin_from_map') : t('card_pin_out')}
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
          <span
            className="domcard__note u-num"
            title={`${t('score_detail')} ${scoreVal}/100 — ${scoreLabel(scoreVal)}`}
          >
            ★ {note}
          </span>
        </header>

        <h3 className="domcard__name">{d.name}</h3>
        {/* Le massif quitte le sous-titre : il est déjà dans la pastille. */}
        <p className="domcard__sub">
          {[`${fmt(d.min)} – ${fmt(d.max)} m`, d.region, geoDistTxt].filter(Boolean).join(' · ')}
        </p>

        {/* Quatre tuiles plutôt que sept données à égalité. Les filets sont
            faits par le fond qui traverse une grille à `gap: 1px` : un jeu de
            bordures par cellule laisserait des traits doubles aux jonctions et
            un pixel de décalage au retour à la ligne. */}
        <dl className="domcard__tiles">
          <div className="domcard__tile">
            <dt>{t('altitude_bottom')}</dt>
            <dd className="u-num domcard__tileval domcard__tileval--data">{fmt(d.min)} m</dd>
          </div>
          <div className="domcard__tile">
            <dt>{t('slopes')}</dt>
            <dd className="u-num domcard__tileval">{fmt(d.km)} km</dd>
          </div>
          <div className="domcard__tile">
            {/* Un tarif estimé est signalé par le « ≈ » : le lecteur doit
                pouvoir distinguer d'un coup d'œil un prix relevé d'un prix
                dérivé de la taille du domaine. */}
            <dt>{t('pass_6d_adult')}</dt>
            <dd
              className="u-num domcard__tileval"
              title={forfait.estimated ? t('price_estimated') : undefined}
            >
              {forfait.j6 != null ? `${forfait.estimated ? '≈ ' : ''}${eur(forfait.j6)}` : '—'}
            </dd>
          </div>
          <div className="domcard__tile">
            <dt>{t('travel_time')}</dt>
            <dd className="u-num domcard__tileval u-nowrap">{dur(derived.worstTravel(d))}</dd>
          </div>
        </dl>

        {shownTags.length > 0 && (
          <div className="domcard__tags">
            {shownTags.map((tag) => (
              <span
                key={tag.txt}
                className="domcard__tag"
                style={{ background: tag.soft, color: tag.color }}
                title={tag.title}
              >
                {tag.txt}
              </span>
            ))}
          </div>
        )}

        <p className="domcard__meta">{metaLine}</p>

        {/* Le lien vers la fiche tient sa propre ligne, alignée à droite. Il
            était auparavant poussé par un `u-spacer` dans le paragraphe de
            neige, qui n'est pas une boîte flex : l'espacement ne s'appliquait
            pas et le lien venait se coller au texte. */}
        <div className="domcard__linkrow">
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
        </div>

        <p className="domcard__snow">
          {t('snow_label')}{' '}
          {/* Rien tant que le modèle n'a pas répondu : une hauteur de neige
              inventée est exactement ce que cet écran ne doit pas produire. */}
          <strong className="u-num">
            {snow.releve ? `${snow.bas ?? '—'} / ${snow.haut ?? '—'} cm` : '…'}
          </strong>{' '}
          <span className="u-muted">{t('snow_base_top')}</span> ·{' '}
          <span className="u-muted">{snowfallText(weather)}</span>
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
