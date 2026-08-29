/**
 * Fiche détaillée d'une offre de logement.
 *
 * ⚠ **Fichier reconstruit le 15 août 2026.** Une expression régulière trop
 * gourmande, passée pour retirer les URLs de réservation en dur, a tronqué ce
 * fichier. Le comportement a été restitué à l'identique depuis le paquet de
 * `out/renderer` (build du même jour, non minifié) : structure, classes,
 * libellés et calculs sont ceux d'origine. Les commentaires de bloc, eux, ne
 * survivent pas à la compilation — ceux d'ici ont été réécrits, et sont donc à
 * relire.
 *
 */

import { useRef } from 'react'
import { CloseIcon, ExternalIcon } from './Icons'
import { srcOf, trackKey } from '@/data/lodgings'
import { accessTimeOf } from '@/data/accessTime'
import { isClientReady } from '@/api/client'
import { listingUrlWithStay, searchUrlFor } from '@/data/deeplinks'
import type { Domain } from '@/data/referentiel'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useReportExport } from '@/hooks/useReportExport'
import { StayReport } from './StayReport'
import { passOriginText, passPrefix, passStyle } from '@/domain/forfaitLabel'
import { lessonsCount } from '@/domain/costs'
import { useFocusTrap } from '@/hooks/useShortcuts'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'

/*
 * La fiche décomposait le prix en quatre lignes — loyer, ménage, taxe de
 * séjour, frais de service — et aucune des quatre n'était relevée : le loyer
 * valait 80 % du total, le ménage 90 € en dur, la taxe 1,55 € par personne et
 * par nuit, et les « frais de service » ramassaient le reste de la
 * soustraction. Le commentaire d'origine disait « décomposition du prix affiché
 * par les sources » ; aucune source n'avait rien décomposé.
 *
 * Une centrale publie un total, parfois une grille par occupation. C'est ce
 * qu'on montre. Le jour où un connecteur rapportera un détail de facturation,
 * il aura sa place ici — avec sa provenance.
 */

export function LodgingSheet({ domain: d }: { domain: Domain }): JSX.Element | null {
  const { dur, eur, fmt } = useFormat()
  const { t } = useI18n()
  const { state, patch } = useApp()
  const derived = useDerived()
  const ref = useRef<HTMLElement>(null)
  useFocusTrap(ref)
  const pdf = useReportExport()

  const lodging = derived.lodgAll.find((l) => l.id === state.ficheId)
  if (!lodging) return null

  const nights = derived.nights
  const pass = derived.passOf(d)
  const cost = derived.sejourCost(lodging, d)
  const trip = derived.sejourInputs(d).trip

  const inCompare = state.compareIds.includes(lodging.id)
  const tracked = state.tracked.some((tr) => tr.key === trackKey(lodging))

  const criteria = {
    domainName: d.name,
    arrDate: state.arrDate,
    depDate: state.depDate,
    travelers: state.travelers,
    rooms: state.rooms
  }
  const searchUrl = searchUrlFor(srcOf(lodging), criteria)
  // L'annonce s'ouvre aux dates et au groupe déjà saisis : les extracteurs
  // coupent la chaîne de requête, elle serait sinon vide. Voir
  // `listingUrlWithStay`.
  const target = lodging.url
    ? listingUrlWithStay(lodging.url, lodging.srcConnector ?? srcOf(lodging), criteria)
    : searchUrl

  const close = (): void => patch({ ficheId: null })

  /** L'impression isole la fiche : le reste de l'écran n'a rien à faire sur
   *  une feuille qu'on emporte en réunion de famille. */
  const print = (): void => {
    document.documentElement.setAttribute('data-print', 'fiche')
    const off = (): void => {
      document.documentElement.removeAttribute('data-print')
      window.removeEventListener('afterprint', off)
    }
    window.addEventListener('afterprint', off)
    setTimeout(() => window.print(), 60)
  }

  return (
    <>
      <div className="scrim scrim--local" style={{ zIndex: 5 }} onClick={close} />
      <aside
        ref={ref}
        className="drawer lodging-sheet"
        style={{
          position: 'absolute',
          width: 'min(480px, 94%)',
          zIndex: 6,
          display: 'flex',
          flexDirection: 'column'
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Fiche logement"
      >
        <div className="drawer__head">
          <h3>{lodging.name}</h3>
          {/* La note revient à droite du titre, comme sur la vignette. Elle
              vivait dans la ligne « type · capacité · note · source » retirée
              plus haut ; c'était le seul élément de cette ligne qui valait la
              peine d'être gardé. Le nombre d'avis n'est dit que s'il y en a :
              « (0 avis) » n'étayait rien. */}
          {lodging.note && lodging.note !== '—' && (
            <span className="lodgcard__note">
              ★ {lodging.note}
              {lodging.avis > 0 && <span className="u-muted"> {lodging.avis} avis</span>}
            </span>
          )}
          {lodging.skiIn && (
            <span className="lodgcard__badge lodgcard__badge--ski lodgcard__badge--inline">
              {t('badge_ski_in')}
            </span>
          )}
          <button type="button" className="iconbtn" onClick={close} aria-label="Fermer">
            <CloseIcon />
          </button>
        </div>

        <div style={{ padding: 20, display: 'grid', gap: 18 }}>
          {lodging.image ? (
            <img className="sheet__photo" src={lodging.image} alt={lodging.name} loading="lazy" decoding="async" />
          ) : (
            <div className="photogrid">
              <div className="photogrid__main">
                <span className="lodgcard__noimg">{t('lodg_no_photo')}</span>
              </div>
              <div className="photogrid__cell" />
              <div className="photogrid__cell" />
            </div>
          )}

          {/* La ligne « type · capacité · note · source » a été retirée.
              Elle se réduisait le plus souvent à « Import · 4,74/5 (0 avis) ·
              Airbnb » : un type qui nommait le mode d'acquisition plutôt que le
              bien, une note assortie de zéro avis — donc invérifiable — et une
              source déjà portée par la pastille de la vignette et par la fiche
              technique en bas de ce panneau. */}

          <div className="inset">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              {/* Même bleu que la vignette et que les puces de filtre. La
                  teinte selon la confiance du prix a disparu des deux côtés :
                  la liste n'admet plus que des prix vérifiés, la confiance vaut
                  « confirmé » partout, et le vert ne séparait plus rien. Ce que
                  la couleur disait, la ligne juste en dessous le dit en mots. */}
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: 'var(--brand)'
                }}
              >
                {lodging.priceConfidence === 'partial'
                  ? t('sheet_price_from').replace('{p}', eur(lodging.total))
                  : eur(lodging.total)}
              </span>
              <span className="u-muted" style={{ fontSize: 12 }}>
                {lodging.priceConfidence === 'total_confirmed'
                  ? t('sheet_price_confirmed')
                  : lodging.priceConfidence === 'partial'
                    ? t('sheet_teaser_rate')
                    : t('sheet_price_unqualified')}{' '}
                · {nights} nuits · {state.travelers} pers.
              </span>
              <span className="u-spacer" />
              <span style={{ fontSize: 14 }}>
                {eur(lodging.pp)}{' '}
                <span className="u-muted" style={{ fontSize: 11 }}>
                  /pers/nuit
                </span>
              </span>
            </div>

            {/*
              Barème de la centrale, en un seul bloc.

              Une centrale Orchestra ne vend pas un prix mais une grille : le
              même appartement vaut 1 161 € à deux et 2 736 € à six, et selon
              qu'on accepte ou non l'annulation. Éclater ça en plusieurs
              annonces donnerait cinq fois le même logement dans la liste ;
              n'en garder qu'une ligne cacherait l'écart. Tout tient donc sur
              une seule étiquette, prix **et** conditions.

              La ligne du groupe demandé est mise en avant : c'est celle dont
              le montant est repris en gros caractères plus haut.
            */}
            {lodging.priceOptions && lodging.priceOptions.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p className="sheet__label">{t('lodg_rate_grid')}</p>
                <div className="breakdown breakdown--flush" style={{ marginTop: 4 }}>
                  {lodging.priceOptions.map((option) => {
                    const yours = option.total === lodging.total
                    return (
                      <div
                        key={`${option.guests}-${option.total}`}
                        style={{ fontWeight: yours ? 700 : 400 }}
                      >
                        <span className="u-muted" style={{ color: yours ? 'var(--text)' : undefined }}>
                          {t('lodg_rate_guests').replace('{n}', String(option.guests))}
                          {option.condition ? ` · ${option.condition}` : ''}
                          {option.policy ? ` · ${option.policy}` : ''}
                          {yours ? ` · ${t('lodg_rate_yours')}` : ''}
                        </span>
                        <span className="u-num">{eur(option.total)}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="filters__help" style={{ margin: '6px 0 0' }}>
                  {t('lodg_rate_grid_note')}
                </p>
              </div>
            )}

            {lodging.annul && (
              <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--ok)' }}>
                {t('free_cancel_fresh')}
              </p>
            )}
          </div>

          <div>
            <p className="sheet__label">{t('access_label')}</p>
            {/* Les métriques d'accès viennent du moteur local. Une annonce
                importée arrive sans : afficher « 0 m » ferait croire à un
                logement au bord des pistes. */}
            {lodging.dist > 0 || lodging.den > 0 || lodging.liftDist > 0 || lodging.skiIn ? (
              <dl className="sheet__dl">
                {/*
                  « 340 m · 7 min · +23 m » ne disait pas ce qu'il mesurait :
                  ni de quel temps il s'agissait, ni de quel dénivelé. Chaque
                  grandeur porte donc son unité en toutes lettres.

                  Le temps de marche disparaît quand le moteur annonce un accès
                  en navette ou en voiture. Il est calculé à 50 m/min, ce qui
                  n'a de sens que si l'on marche : afficher « 28 min » pour un
                  accès en voiture répondait à une question que personne ne
                  posait, avec une valeur fausse.
                */}
                {(() => {
                  /*
                    Le temps porte son moyen, toujours : « 7 min » seul ne dit
                    pas à pied de quoi, et un temps de marche affiché pour un
                    accès en voiture est faux — 1 416 m annonçaient « 28 min »
                    alors que le moteur classait cet accès « voiture ».
                    `accessTimeOf` choisit le moyen puis calcule sur cette base.
                  */
                  const access = accessTimeOf(lodging.dist, lodging.accessType)
                  const skiIn = access?.mode === 'skis_aux_pieds' || lodging.skiIn
                  const duration =
                    access?.minutes == null
                      ? null
                      : access.mode === 'voiture'
                        ? t('access_drive_time').replace('{n}', String(access.minutes))
                        : access.mode === 'navette'
                          ? t('access_shuttle_time').replace('{n}', String(access.minutes))
                          : t('access_walk_time').replace('{n}', String(access.minutes))
                  return (
                    <div>
                      <dt>{t('access_to_runs')}</dt>
                      <dd style={{ fontWeight: 700 }}>
                        {[
                          `${fmt(lodging.dist)} m`,
                          duration ?? (skiIn ? t('access_ski_in') : null),
                          lodging.den > 0
                            ? t('access_climb').replace('{n}', fmt(lodging.den))
                            : lodging.den < 0
                              ? t('access_descent').replace('{n}', fmt(Math.abs(lodging.den)))
                              : t('access_flat')
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </dd>
                    </div>
                  )
                })()}
                {/* Aucun relevé ne rend le nom de la remontée : le moteur local
                    en mesure la distance, pas l'identité. `lift` reste donc vide
                    partout, et « · 365 m » seul laissait croire à un libellé
                    manquant. */}
                {lodging.liftDist > 0 && (
                  <div>
                    <dt>{t('nearest_lift')}</dt>
                    <dd>
                      {[lodging.lift || null, `${fmt(lodging.liftDist)} m`].filter(Boolean).join(' · ')}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Altitude du logement</dt>
                  <dd>{fmt(lodging.alt)} m (IGN, calculée)</dd>
                </div>
                <div>
                  {/* Intitulé générique : `travelText` préfixe déjà chaque durée du
                      nom de son départ, et il peut y en avoir plusieurs. Nommer le
                      premier ici donnait « Voiture depuis Départ 1 → Départ 1 3 h 20 ». */}
                  <dt>{t('access_by_car')}</dt>
                  <dd>{derived.travelText(d)}</dd>
                </div>
              </dl>
            ) : null}
            {(lodging.dist > 0 || lodging.den > 0 || lodging.liftDist > 0 || lodging.skiIn) ? (
              <p className="filters__help" style={{ margin: '6px 0 0' }}>
                {t('access_walk_note')}
              </p>
            ) : (
              /* Dire **laquelle** des conditions manque, et non « ce n'est pas
                 calculé ». Le message générique laissait l'utilisateur relancer
                 des relevés sans effet : trois causes très différentes s'y
                 confondaient, dont une qui ne se répare que dans les Réglages.
                 Ordre du plus général au plus particulier — sans moteur, rien
                 n'est calculable pour aucune annonce. */
              <p className="u-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                {!isClientReady()
                  ? t('access_no_engine')
                  : d.engineId == null
                    ? t('access_no_engine_domain')
                    : lodging.lat == null || lodging.lon == null
                      ? t('access_no_position').replace('{s}', srcOf(lodging))
                      : t('access_not_yet')}
              </p>
            )}
          </div>

          <div className="inset">
            <p className="sheet__label">{t('full_stay_cost')}</p>
            <div className="breakdown breakdown--flush">
              <div>
                <span className="u-muted">{t('sheet_lodging_line')}</span>
                <span className="u-num">{eur(cost.lodging)}</span>
              </div>
              <div>
                {/* Le tarif affiché est celui de la durée réelle du séjour, plus
                    celui du forfait 6 jours quelles que soient les dates. */}
                <span className="u-muted" title={pass ? passOriginText(pass, t) : undefined}>
                  {pass
                    ? t('pass_line')
                        .replace('{a}', String(cost.adults))
                        .replace('{pa}', `${passPrefix(pass)}${eur(pass.adulte)}`)
                        .replace(
                          '{k}',
                          cost.kids
                            ? t('pass_line_kids')
                                .replace('{n}', String(cost.kids))
                                .replace('{pe}', `${passPrefix(pass)}${eur(pass.enfant)}`)
                            : ''
                        )
                    : t('pass_none')}
                </span>
                <span className="u-num" style={passStyle(pass)}>
                  {eur(cost.forfaits)}
                </span>
              </div>
              <div>
                <span className="u-muted">
                  Route — {cost.cars} foyer(s) · carburant {eur(trip.fuel)}
                  {trip.tolls
                    ? ` · ${t('sheet_tolls').replace('{p}', eur(trip.tolls))}`
                    : ` · ${t('sheet_no_tolls')}`}
                </span>
                <span className="u-num">{eur(cost.route)}</span>
              </div>
              {cost.rental > 0 && (
                <div>
                  <span className="u-muted">{t('rental_6days')}</span>
                  <span className="u-num">{eur(cost.rental)}</span>
                </div>
              )}
              {cost.lessons > 0 && (
                <div>
                  <span className="u-muted">
                    Cours ESF — {lessonsCount(state.people)} inscrit(s), tarifs {d.name}
                  </span>
                  <span className="u-num">{eur(cost.lessons)}</span>
                </div>
              )}
              <div className="breakdown__total">
                <strong>Total</strong>
                <strong className="u-num">{eur(cost.total)}</strong>
              </div>
              <div>
                <span className="u-muted">soit par personne</span>
                <span className="u-num">{eur(Math.round(cost.total / state.travelers))}</span>
              </div>
            </div>

            <div className="sheet__options">
              <label className="check" style={{ margin: 0, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={state.optRental}
                  onChange={(e) => patch({ optRental: e.target.checked })}
                />
                {t('rental_option')}
              </label>
              <label className="check" style={{ margin: 0, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={state.optLessons}
                  onChange={(e) => patch({ optLessons: e.target.checked })}
                />
                Ajouter les cours de ski et de snowboard choisis par voyageurs
              </label>
            </div>

            <p className="domcard__drawer-note">
              Estimation : forfaits 6 j adultes et enfants (moins de 13 ans), carburant 0,115 €/km par
              foyer, péages selon le réglage « éviter les péages ». Repas non comptés. Trajet{' '}
              {dur(derived.worstTravel(d))}.
            </p>
          </div>
        </div>

        <div className="sheet__verified">
          <p className="sheet__label">{t('sheet_verified_title')}</p>
          <ul className="sheet__verified-list">
            <li>
              <strong>{t('sheet_verified_dates')}</strong>
              {' : '}
              {lodging.priceCheckIn && lodging.priceCheckOut
                ? `${lodging.priceCheckIn} → ${lodging.priceCheckOut}`
                : `${state.arrDate} → ${state.depDate}`}
              {lodging.priceCheckIn &&
              (lodging.priceCheckIn !== state.arrDate || lodging.priceCheckOut !== state.depDate) ? (
                <span style={{ color: 'var(--warn)' }}> — {t('sheet_dates_differ')}</span>
              ) : (
                <span style={{ color: 'var(--ok)' }}> — {t('sheet_dates_match')}</span>
              )}
            </li>
            <li>
              <strong>Prix</strong>
              {' : '}
              {lodging.total > 0 ? (
                <>
                  {eur(lodging.total)}
                  {' · '}
                  {lodging.priceConfidence === 'total_confirmed'
                    ? t('sheet_price_confirmed_these')
                    : lodging.priceConfidence === 'partial'
                      ? t('sheet_price_teaser')
                      : t('sheet_price_to_confirm')}
                </>
              ) : (
                t('sheet_price_unpublished')
              )}
            </li>
            <li>
              <strong>Source</strong>
              {' : '}
              {srcOf(lodging)}
              {lodging.dups && lodging.dups.length > 0
                ? ` · aussi ${lodging.dups.map((d) => `${srcOf(d)} ${eur(d.total)}`).join(', ')}`
                : ''}
            </li>
            {(lodging.dist > 0 || lodging.skiIn) && (
              <li>
                <strong>{t('sheet_ski_access')}</strong>
                {' : '}
                {lodging.skiIn
                  ? 'ski aux pieds'
                  : `${lodging.dist} m · ${lodging.walk} min (OpenSkiMap)`}
              </li>
            )}
            <li>
              <strong>Ouverture</strong>
              {' : '}
              l’annonce s’ouvre avec vos dates ({state.arrDate} → {state.depDate}) et {state.travelers}{' '}
              voyageur(s) préremplis quand la source le permet.
            </li>
          </ul>
        </div>

        <div className="sheet__footer">
          <button
            type="button"
            className="btn btn--primary"
            disabled={!target}
            onClick={() => target && void window.skitrack.openExternal(target)}
          >
            {lodging.url
              ? `Ouvrir aux dates ${state.arrDate.slice(5)} → ${state.depDate.slice(5)}`
              : `Chercher sur ${srcOf(lodging)}`}
            <ExternalIcon />
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              patch({
                compareIds: inCompare
                  ? state.compareIds.filter((i) => i !== lodging.id)
                  : [...state.compareIds, lodging.id].slice(-4)
              })
            }
          >
            {inCompare ? '✓ Dans le comparateur' : '＋ Comparer'}
          </button>
          <button
            type="button"
            className="linkbtn"
            onClick={() => {
              const key = trackKey(lodging)
              if (tracked) {
                patch({ tracked: state.tracked.filter((tr) => tr.key !== key) })
              } else {
                patch({
                  tracked: [
                    ...state.tracked,
                    {
                      key,
                      name: lodging.name,
                      src: lodging.src,
                      total: lodging.total,
                      pp: lodging.pp,
                      domain: d.name
                    }
                  ],
                  trackedSel: state.tracked.length
                })
              }
            }}
          >
            {tracked ? '✓ Suivi' : 'Suivre le prix'}
          </button>
          <span className="u-spacer" />
          <button type="button" className="linkbtn" onClick={print}>
            {t('print_label')}
          </button>
          {/* Second point d'accès au récapitulatif, comme le veut le cahier des
              charges : « depuis l'écran Décision **ou la fiche du logement
              retenu** ». Il ne demande pas d'avoir retenu quoi que ce soit —
              exiger une décision préalable ferait de l'export une récompense de
              parcours plutôt qu'une action. */}
          <button
            type="button"
            className="btn btn--small"
            disabled={pdf.busy}
            onClick={() =>
              void pdf.exporter(`skitrack-${d.name}-${lodging.name}-${state.arrDate}`)
            }
          >
            {pdf.busy ? t('report_exporting') : t('report_export_short')}
          </button>
        </div>
        {pdf.message && (
          <p className="u-muted" style={{ margin: '0 16px 12px', fontSize: 11, wordBreak: 'break-all' }}>
            {pdf.message}
          </p>
        )}

        {/* Le rapport n'est dans le DOM que le temps de l'export : il charge
            neuf tuiles de fond de carte, et la fiche s'ouvre souvent. */}
        {pdf.monte && <StayReport context={{ d, lg: lodging, nights, cost }} />}
      </aside>
    </>
  )
}
