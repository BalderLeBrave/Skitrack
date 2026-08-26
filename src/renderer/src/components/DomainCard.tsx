import type { MouseEvent } from 'react'
import { AltitudeProfile } from './AltitudeProfile'
import type { Domain } from '@/data/referentiel'
import { hasCoords } from '@/data/referentiel'
import { skiAreaIndex } from '@/data/skiAreas'
import { useFormat } from '@/hooks/useFormat'
import { massifColor } from '@/domain/massif'
import { scoreBadgeColors, scoreLabel } from '@/domain/scoring'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'

interface Props {
  domain: Domain
  scaleMin: number
  scaleMax: number
}

export function DomainCard({ domain: d, scaleMin, scaleMax }: Props): JSX.Element {
  const { dur, eur, fmt } = useFormat()
  const { state, patch, domains } = useApp()
  const derived = useDerived()
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
  const dark = state.theme === 'dark'

  /**
   * Coût des forfaits pour le groupe entier.
   *
   * `sejourCost` appliqué à un logement à zéro : on récupère le poste
   * « forfaits » tel que l'application le calcule partout ailleurs — tarif
   * adulte pour les adultes, tarif enfant pour les enfants — au lieu d'une
   * multiplication par le nombre de voyageurs qui ferait payer plein tarif aux
   * enfants.
   *
   * `null` quand le domaine n'a pas de forfait 6 jours : le bloc de prix
   * disparaît alors, il ne se rabat pas sur zéro.
   *
   * Ce montant ne comprend **pas** le logement. Aucun relevé de logement
   * n'existe pour un domaine qu'on n'a pas encore ouvert : `lodgingsFor()` en
   * fabrique à partir du score de pertinence, et cette carte est justement la
   * surface où un prix inventé ferait le plus de dégâts.
   */
  const passCost = forfait.j6 != null ? derived.sejourCost({ total: 0 }, d) : null
  const groupPasses = passCost?.forfaits ?? null
  /** Compte annoncé sous le montant : celui qui a servi au calcul, pas
   *  `state.travelers`, qui peut diverger de la liste des voyageurs. */
  const groupSize = passCost ? passCost.adults + passCost.kids : 0

  const inSelection = state.selDomains.includes(d.id)

  const stop = (e: MouseEvent): void => e.stopPropagation()

  /**
   * Ligne de contexte, composée hors du JSX.
   *
   * Ce sont les données qui départagent deux domaines déjà comparables, pas
   * celles qui décident : elles tiennent en une ligne grise sous les quatre
   * chiffres plutôt que de leur disputer l'attention.
   */
  const metaLine = [
    // Le sommet est sorti d'ici : la tuile d'altitude porte l'étendue complète
    // depuis qu'elle s'écrit « bas – sommet ».
    `${t('amplitude_lower')} ${fmt(d.max - d.min)} m`,
    `${d.lifts} ${t('lifts_plural')}`,
    `${t('snow_front_lower')} ${fmt(d.village)} m${d.curated ? '' : ` (${t('estimated')})`}`,
    `${fmt(derived.worstDistance(d))} km ${t('of_road')}`
  ].join(' · ')

  const rows = [...score.rows].sort((a, b) => b.contrib - a.contrib)

  const tint = massifColor(d.massif)


  const area = skiAreaIndex(domains).areaOf(d)

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
          {/* NIVEAU 1 — le score, une fois et une seule. Il portait auparavant
              deux formes sur la même carte, une note sur 5 ici et un badge sur
              100 dans le pied, qui donnaient à croire à deux mesures. */}
          <button
            type="button"
            className="scorebadge"
            style={scoreBadgeColors(scoreVal, dark)}
            title={`${t('score_detail')} ${scoreVal}/100 — ${scoreLabel(scoreVal)}`}
            onClick={(e) => {
              stop(e)
              patch({ scoreOpenId: state.scoreOpenId === d.id ? null : d.id })
            }}
          >
            <span className="crn-calcul" style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>
              {scoreVal}
            </span>
            <span style={{ opacity: 0.75, fontSize: 12 }}>/100</span>
            <span style={{ fontWeight: 600, fontSize: 12 }}>{scoreLabel(scoreVal)}</span>
            <span style={{ fontSize: 12, opacity: 0.75 }}>{t('score_why')}</span>
          </button>
        </header>

        <h3 className="domcard__name">{d.name}</h3>
        {/* Le massif quitte le sous-titre : il est déjà dans la pastille. */}
        <p className="domcard__sub">{[d.region, geoDistTxt].filter(Boolean).join(' · ')}</p>

        {/*
          Badge du domaine skiable.
          Cette vignette est une **station** ; le domaine est ce qu'elle
          partage avec ses voisines. Le badge le dit et sert de raccourci : le
          cliquer réécrit la recherche sur le domaine, donc affiche toutes ses
          stations. Il ne s'affiche pas pour une station seule — répéter son
          propre nom n'apprendrait rien.

          Ce qu'il porte est ce que la donnée soutient : le nombre de stations
          et le point culminant, qui est un maximum. Pas de total de
          kilomètres — le référentiel n'en a pas, et l'addition des secteurs
          d'un grand domaine compterait plusieurs fois les mêmes pistes.
        */}
        {area && !area.single && (
          <button
            type="button"
            className="domcard__area"
            title={t('card_area_title')}
            onClick={(e) => {
              e.stopPropagation()
              patch({ domainQuery: area.name, tab: 'recherche' })
            }}
          >
            <span className="domcard__area-name">{area.name}</span>
            <span className="domcard__area-facts u-num">
              {t('card_area_stations').replace('{n}', String(area.stations.length))} ·{' '}
              <span className="crn-releve">{fmt(area.summit)} m</span>
            </span>
          </button>
        )}

        {/* NIVEAU 2 — trois chiffres, plus quatre. Le forfait a quitté cette
            rangée pour le bloc de prix : il y est une décision, ici il n'était
            qu'une mesure de plus. L'altitude s'écrit en amplitude, un bas de
            pistes seul ne disant pas si le domaine monte.

            Les filets sont faits par le fond qui traverse une grille à
            `gap: 1px` : un jeu de bordures par cellule laisserait des traits
            doubles aux jonctions. */}
        <dl className="domcard__tiles domcard__tiles--three">
          <div className="domcard__tile">
            <dt>{t('altitude_span')}</dt>
            <dd className="u-num crn-releve domcard__tileval domcard__tileval--data u-nowrap">
              {fmt(d.min)} – {fmt(d.max)} m
            </dd>
          </div>
          <div className="domcard__tile">
            <dt>{t('slopes')}</dt>
            <dd className="u-num crn-releve domcard__tileval">{fmt(d.km)} km</dd>
          </div>
          <div className="domcard__tile">
            <dt>{t('travel_time')}</dt>
            <dd className="u-num domcard__tileval u-nowrap">{dur(derived.worstTravel(d))}</dd>
          </div>
        </dl>


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


        {/* NIVEAU 3 — ce qui décide : un prix, une action.
            Le grand chiffre est le coût des forfaits pour le groupe entier,
            pas le tarif d'un adulte. C'est ce qu'on paie, donc ce qui se
            compare d'une carte à l'autre ; le tarif unitaire passe en légende.

            Le logement n'y entre pas, et ce n'est pas un oubli : aucun relevé
            n'existe pour un domaine qu'on n'a pas ouvert, et `lodgingsFor()`
            en fabrique à partir du score de pertinence. L'y ajouter poserait
            un prix inventé sur la surface de comparaison principale. */}
        <footer className="domcard__footer">
          {groupPasses != null && groupSize > 0 && (
            <div className="domcard__price">
              <strong
                className="domcard__price-val u-num crn-calcul"
                title={forfait.estimated ? t('price_estimated') : undefined}
              >
                {forfait.estimated ? '≈ ' : ''}
                {eur(groupPasses)}
              </strong>
              <span className="domcard__price-scope" title={t('card_price_no_lodging')}>
                {t('card_price_scope').replace('{n}', String(groupSize))}
              </span>
              <span className="domcard__price-unit">
                {t('pass_6d_adult')}{' '}
                <span className="u-num crn-releve">{eur(forfait.j6)}</span>
              </span>
            </div>
          )}
          <span className="u-spacer" />
          {/* Retenir : le seul geste qui alimente « Ma sélection ». Second
              rôle, donc bouton secondaire — l'action primaire de cette carte
              reste d'aller chercher les logements. */}
          <button
            type="button"
            className={`btn btn--small u-nowrap${inSelection ? ' btn--on' : ''}`}
            aria-pressed={inSelection}
            onClick={(e) => {
              stop(e)
              patch({
                selDomains: inSelection
                  ? state.selDomains.filter((id) => id !== d.id)
                  : [...state.selDomains, d.id]
              })
            }}
          >
            {inSelection ? `✓ ${t('sel_added_domain')}` : t('sel_add_domain')}
          </button>
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
            {t('see_lodgings')} →
          </button>
        </footer>


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
