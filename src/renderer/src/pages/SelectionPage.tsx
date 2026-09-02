/**
 * Écran « Ma sélection ».
 *
 * Le seul écran qui rassemble ce que le groupe a retenu : les domaines d'un
 * côté, les logements de l'autre, chacun portant ses notes et ses votes. Les
 * autres écrans comparent des candidats ; celui-ci tient la liste courte.
 *
 * Trois règles héritées du reste de l'application :
 *
 *  * **Rien n'est inventé.** Le montant sous un domaine est le coût des
 *    forfaits pour le groupe, calculé par `sejourCost`. Le logement n'y entre
 *    pas : aucun relevé n'existe pour un domaine qu'on n'a pas ouvert, et
 *    `lodgingsFor()` en fabrique à partir du score de pertinence.
 *  * **Les « collaborateurs » sont locaux.** Ce sont les voyageurs du groupe,
 *    enregistrés sur cette machine. Aucun partage réseau, aucun compte.
 *  * **Une perte se dit.** Un logement retenu qui n'est plus réservable à ces
 *    dates ne disparaît pas de la liste : il descend dans sa propre section,
 *    avec le motif.
 */

import { SelectionNotes } from '@/components/SelectionNotes'
import { availabilityOf } from '@/data/lodgingAvailability'
import type { Lodging } from '@/data/lodgings'
import { hasPricedOffer, priceShown, srcOf } from '@/data/lodgings'
import type { Domain } from '@/data/referentiel'
import { massifColor } from '@/domain/massif'
import { scoreBadgeColors, scoreLabel } from '@/domain/scoring'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'

/** Initiales d'un voyageur, pour la pile d'avatars de l'en-tête. */
function initialsOf(first: string, last: string): string {
  return `${first.slice(0, 1)}${last.slice(0, 1)}`.toUpperCase() || '—'
}

function DomainTile({ d }: { d: Domain }): JSX.Element {
  const { state, patch } = useApp()
  const derived = useDerived()
  const { eur, fmt } = useFormat()
  const { t } = useI18n()
  const dark = state.theme === 'dark'
  const scoreVal = Math.round(derived.scoreOf(d).total)
  const forfait = derived.forfaitOf(d)
  const passes = forfait.j6 != null ? derived.sejourCost({ total: 0 }, d) : null
  const tint = massifColor(d.massif)

  return (
    <article className="seltile">
      <div className="seltile__head">
        <span className="domcard__massif" style={{ background: tint.soft, color: tint.ink }}>
          {d.massif || d.region || 'France'}
        </span>
        <span className="u-spacer" />
        <span className="scorebadge" style={scoreBadgeColors(scoreVal, dark)}>
          <span className="crn-calcul">{scoreVal}</span> · {scoreLabel(scoreVal)}
        </span>
        <button
          type="button"
          className="seltile__drop"
          title={t('sel_remove')}
          aria-label={t('sel_remove')}
          onClick={() => patch({ selDomains: state.selDomains.filter((id) => id !== d.id) })}
        >
          ✕
        </button>
      </div>
      <h3 className="seltile__name">{d.name}</h3>
      <p className="seltile__facts u-num crn-releve">
        {fmt(d.min)} – {fmt(d.max)} m · {fmt(d.km)} km
      </p>
      {passes && (
        <p className="seltile__price">
          <strong className="u-num crn-calcul">{eur(passes.forfaits)}</strong>{' '}
          <span className="u-muted">
            {t('card_price_scope').replace('{n}', String(passes.adults + passes.kids))}
          </span>
        </p>
      )}
      <SelectionNotes kind="domain" targetId={d.id} />
    </article>
  )
}

function LodgingTile({ lg, domain }: { lg: Lodging; domain: Domain | null }): JSX.Element {
  const { state, patch } = useApp()
  const { eur, fmt } = useFormat()
  const { t } = useI18n()

  const drop = (): void => {
    const next = { ...state.selLodgings }
    for (const [domId, lodgId] of Object.entries(next)) {
      if (lodgId === lg.id) delete next[Number(domId)]
    }
    patch({ selLodgings: next })
  }

  return (
    <article className="seltile">
      <div className="seltile__head">
        <span className="lodgrej__badge">{srcOf(lg)}</span>
        <span className="u-spacer" />
        <button
          type="button"
          className="seltile__drop"
          title={t('sel_remove')}
          aria-label={t('sel_remove')}
          onClick={drop}
        >
          ✕
        </button>
      </div>
      <h3 className="seltile__name">{lg.name}</h3>
      <p className="seltile__facts">
        {domain ? `${domain.name} · ` : ''}
        {lg.dist > 0 ? (
          <span className="u-num crn-releve">
            {t('lodg_dist_to_runs').replace('{n}', fmt(lg.dist))}
          </span>
        ) : null}
      </p>
      {/* Pas de montant quand la source n'en publie pas : `total <= 0` est le
          test que les sélecteurs utilisent déjà sous le nom `priceless`. */}
      {hasPricedOffer(lg) && (
        <p className="seltile__price">
          <strong className="u-num crn-releve">
            {priceShown(lg).unit === 'night'
              ? `${eur(priceShown(lg).amount)} /nuit`
              : eur(lg.total)}
          </strong>
        </p>
      )}
      <SelectionNotes kind="lodging" targetId={lg.id} />
    </article>
  )
}

export function SelectionPage(): JSX.Element {
  const { state, patch, domains } = useApp()
  const derived = useDerived()
  const { eur, fmtStay } = useFormat()
  const { t } = useI18n()

  const stay = { checkIn: state.arrDate, checkOut: state.depDate }
  const picked = state.selDomains
    .map((id) => domains.find((d) => d.id === id))
    .filter((d): d is Domain => d != null)

  /** Logements retenus, rapprochés de leur domaine. */
  const lodgings = Object.entries(state.selLodgings)
    .map(([domId, lodgId]) => {
      const lg = state.imported.find((l) => l.id === lodgId)
      if (!lg) return null
      return { lg, domain: domains.find((d) => d.id === Number(domId)) ?? null }
    })
    .filter((x): x is { lg: Lodging; domain: Domain | null } => x != null)

  /**
   * Identifiants retenus qui ne se résolvent plus dans `state.imported`.
   *
   * Le relevé d'un domaine remplace ses annonces ; un logement retenu peut donc
   * cesser d'être trouvable sans avoir été retiré par personne. Le taire ferait
   * disparaître une vignette sans explication, ce que cet écran existe
   * justement pour éviter.
   */
  const lostRefs = Object.keys(state.selLodgings).length - lodgings.length

  const live = lodgings.filter(({ lg }) => availabilityOf(lg, stay).status !== 'gone')
  const gone = lodgings.filter(({ lg }) => availabilityOf(lg, stay).status === 'gone')

  /** Le moins cher des logements encore disponibles, s'il y en a un tarifé. */
  const cheapest = live
    .map(({ lg }) => lg)
    .filter((lg) => lg.total > 0)
    .sort((a, b) => a.total - b.total)[0]

  return (
    <div className="page">
      <div className="page__inner selpage">
        <div className="selpage__main">
          <header className="selpage__head">
            <h2 className="selpage__title">{t('sel_title')}</h2>
            <div className="selpage__chips">
              <span className="tag">{fmtStay(state.arrDate, state.depDate)}</span>
              <span className="tag">
                {t('lodg_travelers_count').replace('{n}', String(state.people.length))}
              </span>
              {/* Pile d'avatars : les voyageurs du groupe, pas des comptes
                  distants. L'infobulle le dit, pour qu'on n'attende pas un
                  partage qui n'existe pas. */}
              <span className="selpage__avstack" title={t('sel_collaborators_local')}>
                {state.people.map((p) => (
                  <span className="selnote__av" key={p.id} title={`${p.first} ${p.last}`}>
                    {initialsOf(p.first, p.last)}
                  </span>
                ))}
              </span>
            </div>
          </header>

          <section className="selpage__section">
            <h3 className="selpage__h">
              {t('sel_domains')} · <span className="u-num">{picked.length}</span>
            </h3>
            {picked.length === 0 ? (
              <p className="u-muted selpage__empty">{t('sel_empty_domains')}</p>
            ) : (
              <div className="selgrid">
                {picked.map((d) => (
                  <DomainTile key={d.id} d={d} />
                ))}
              </div>
            )}
          </section>

          <section className="selpage__section">
            <h3 className="selpage__h">
              {t('sel_lodgings')} · <span className="u-num">{live.length}</span>
            </h3>
            {lostRefs > 0 && (
              <p className="notice notice--warn selpage__empty">
                {t('sel_lost_refs').replace('{n}', String(lostRefs))}
              </p>
            )}
            {live.length === 0 ? (
              <p className="u-muted selpage__empty">{t('sel_empty_lodgings')}</p>
            ) : (
              <div className="selgrid">
                {live.map(({ lg, domain }) => (
                  <LodgingTile key={lg.id} lg={lg} domain={domain} />
                ))}
              </div>
            )}
          </section>

          {gone.length > 0 && (
            <section className="selpage__section lodgrej">
              <div className="lodgrej__head">
                <h3 className="lodgrej__title">{t('sel_gone_title')}</h3>
                <p className="lodgrej__sub">{t('sel_gone_sub')}</p>
              </div>
              <div className="selgrid">
                {gone.map(({ lg, domain }) => (
                  <article className="seltile seltile--gone" key={lg.id}>
                    <div className="seltile__head">
                      <span className="lodgrej__badge">{t('lodg_reason_gone')}</span>
                    </div>
                    <h3 className="seltile__name">{lg.name}</h3>
                    <p className="seltile__facts">{domain ? domain.name : ''}</p>
                    {/* Aucun prix sur une offre perdue : le tarif ne vaut plus. */}
                    <p className="lodgrej__why">{t('lodg_gone_notice')}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          <div className="selpage__actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={picked.length < 2}
              onClick={() => patch({ tab: 'combinaisons' })}
            >
              {t('sel_go_compare')}
            </button>
            <button type="button" className="btn" onClick={() => patch({ tab: 'recherche' })}>
              {t('sel_go_search')}
            </button>
          </div>
        </div>

        {/* Colonne collante : ce que la sélection coûte et pèse, visible sans
            remonter. Ce n'est pas la carte du prototype — voir le rapport de
            phase pour la raison. */}
        <aside className="selpage__aside">
          <h3 className="selpage__h">{t('sel_summary')}</h3>
          <dl className="selsum">
            <div>
              <dt>{t('sel_domains')}</dt>
              <dd className="u-num">{picked.length}</dd>
            </div>
            <div>
              <dt>{t('sel_lodgings')}</dt>
              <dd className="u-num">{live.length}</dd>
            </div>
            <div>
              <dt>{t('sel_nights')}</dt>
              <dd className="u-num crn-releve">{derived.nights}</dd>
            </div>
            {cheapest && (
              <div>
                <dt>{t('sel_cheapest_stay')}</dt>
                <dd className="u-num crn-releve">{eur(cheapest.total)}</dd>
              </div>
            )}
          </dl>
        </aside>
      </div>
    </div>
  )
}
