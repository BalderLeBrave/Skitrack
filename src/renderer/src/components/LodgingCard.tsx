/**
 * Vignette d'une offre de logement, dans la mosaïque de l'écran Logements.
 *
 * Elle **compose** `ResultCard` : le gabarit — média, titre, lieu, deux faits,
 * prix — vient de là, et rien de ce que cet écran sait faire n'y est perdu.
 * Ce qui reste ici est ce que la vignette générique n'a pas à connaître :
 * pastilles de source et de ski aux pieds, écarts au marché, doublons fusionnés,
 * prix devenu caduc, disponibilité non confirmée, comparateur, suivi de prix et
 * ouverture de l'annonce.
 *
 * Les deux faits de la ligne 3 disent ici ce qui **varie d'une offre à
 * l'autre** : la distance aux pistes et le dénivelé à remonter. Ni la station
 * ni l'altitude du domaine — sur cet écran, toutes les cartes appartiennent au
 * même domaine, et les répéter cent fois n'apprendrait rien.
 */

import type { MouseEvent } from 'react'
import { ExternalIcon } from './Icons'
import { ResultCard } from './ResultCard'
import type { Lodging } from '@/data/lodgings'
import type { Domain } from '@/data/referentiel'
import { dealOf, freshnessOf, srcOf, trackKey } from '@/data/lodgings'
import { listingUrlWithStay, searchUrlFor } from '@/data/deeplinks'
import { availabilityOf } from '@/data/lodgingAvailability'
import { snowDepths } from '@/data/weather'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useWeather } from '@/state/weather'

/** Hauteur de neige qui remplit la jauge à ras, en cm. */
const SNOW_FULL_CM = 250

interface Props {
  lodging: Lodging
  median: number
  domain: Domain
}

export function LodgingCard({ lodging: lg, median, domain }: Props): JSX.Element {
  const { t } = useI18n()
  const { eur, fmt, fmtDay } = useFormat()
  const { lang } = useI18n()
  const { state, patch } = useApp()
  const { weatherOf } = useWeather()

  // Une offre du catalogue simulé n'a pas de page derrière elle : le bouton
  // mène alors à la recherche pré-remplie sur la source, et le dit.
  const criteria = {
    domainName: domain.name,
    arrDate: state.arrDate,
    depDate: state.depDate,
    travelers: state.travelers,
    rooms: state.rooms,
    officialUrl: domain.booking ?? domain.website
  }
  const searchUrl = searchUrlFor(srcOf(lg), criteria)
  // L'annonce s'ouvre aux dates et au groupe déjà saisis : les extracteurs
  // coupent la chaîne de requête, elle serait sinon vide. Voir
  // `listingUrlWithStay`.
  const target = lg.url ? listingUrlWithStay(lg.url, srcOf(lg), criteria) : searchUrl

  // Carte-redirection : un vrai hébergement sans prix (OpenStreetMap → source).
  // On n'affiche pas « 0 € » ni un prix par personne fictif.
  const redirect = lg.total <= 0

  // Un prix relevé sur Airbnb ne vaut QUE pour les dates auxquelles il a été
  // relevé : Airbnb le recalcule selon la saison, les minimums de nuits et les
  // réductions propres à chaque hôte. Si les dates de recherche ont changé
  // depuis, le montant affiché n'est plus le bon — et l'application n'a aucun
  // moyen légal d'aller chercher le nouveau toute seule. On le signale donc,
  // plutôt que de laisser croire à un tarif à jour.
  const priceStale =
    !redirect &&
    lg.priceCheckIn != null &&
    (lg.priceCheckIn !== state.arrDate || lg.priceCheckOut !== state.depDate)

  /**
   * Ce qu'on sait de la disponibilité à ces dates-ci.
   *
   * Le bouton d'ouverture réinjecte les dates **courantes** dans l'URL de
   * l'annonce (`listingUrlWithStay`). Une vignette qui ne dit rien de la
   * disponibilité envoie donc l'utilisateur droit sur « Ces dates ne sont pas
   * disponibles » — c'est ce qui arrivait. Voir `data/lodgingAvailability.ts`.
   */
  const avail = availabilityOf(lg, { checkIn: state.arrDate, checkOut: state.depDate })
  const gone = avail.status === 'gone'
  const unconfirmed = avail.status === 'unconfirmed'

  // Une annonce n'a de métriques d'accès que si le moteur local les a calculées.
  // Le drapeau explicite `accessComputed` prime quand il est là (import enrichi) ;
  // sinon on retombe sur l'heuristique pour le catalogue simulé, qui porte des
  // distances réelles sans ce drapeau.
  const accessKnown =
    lg.accessComputed ?? (lg.dist > 0 || lg.den > 0 || lg.liftDist > 0 || lg.skiIn)

  const selected = lg.id === state.ficheId
  const inCompare = state.compareIds.includes(lg.id)
  const tracked = state.tracked.some((tr) => tr.key === trackKey(lg))
  const fresh = freshnessOf(lg, lang)
  const deal = dealOf(lg, median)
  const dups = lg.dups ?? []

  const stop = (e: MouseEvent): void => e.stopPropagation()

  const toggleTrack = (): void => {
    const key = trackKey(lg)
    if (tracked) {
      patch({ tracked: state.tracked.filter((tr) => tr.key !== key) })
      return
    }
    patch({
      tracked: [
        ...state.tracked,
        { key, name: lg.name, src: lg.src, total: lg.total, pp: lg.pp, domain: domain.name }
      ],
      trackedSel: state.tracked.length
    })
  }

  // Ligne 2 : ce que la source annonce du bien. Capacité et chambres à 0 = non
  // annoncées, on n'écrit rien plutôt que « 0 pers ».
  const place = [
    lg.type || null,
    lg.pers ? `${lg.pers} pers` : null,
    lg.ch ? `${lg.ch} ch` : null,
    lg.m2 ? `${lg.m2} m²` : null
  ]
    .filter(Boolean)
    .join(' · ')

  // Ligne 3. Distance et dénivelé viennent du moteur local (calcul sur les
  // tracés OpenSkiMap). Une annonce collée n'en a pas : afficher « 0 m » ferait
  // croire à un logement au bord des pistes.
  const factLeft = accessKnown ? `${fmt(lg.dist)} m des pistes` : t('dist_not_computed')
  const factRight = accessKnown
    ? `${lg.den > 0 ? `+${lg.den}` : lg.den < 0 ? `${lg.den}` : '±0'} m · ${lg.walk} min`
    : undefined

  const price = redirect
    ? { amount: t('lodg_price_on_source').replace('{s}', srcOf(lg)), unit: '' }
    : { amount: eur(lg.total), unit: `tout compris · ${eur(lg.pp)}/pers/nuit` }

  const picked = lg.id === state.lodgPickId

  /**
   * Bande neige de la vignette.
   *
   * Le modèle répond pour le domaine, pas pour le logement : la bande dit donc
   * la neige au bas et au sommet des pistes, plus le nombre de remontées du
   * référentiel. Tant que le relevé manque, on montre l'amplitude skiable — une
   * donnée qui, elle, est toujours vraie — et jamais une hauteur inventée. Le
   * référentiel porte bien un champ `neige`, mais c'est un jeu de démonstration
   * qui annonce un mètre de poudreuse en août : `snowDepths()` ne lit que le
   * modèle, et c'est voulu.
   */
  const snow = snowDepths(weatherOf(domain.id))
  const snowKnown = snow.bas != null || snow.haut != null
  const snowFill = Math.min(100, ((snow.haut ?? snow.bas ?? 0) / SNOW_FULL_CM) * 100)

  const card = (
    <ResultCard
      title={lg.name}
      place={place}
      factLeft={factLeft}
      factRight={factRight}
      price={price}
      image={lg.image ?? null}
      placeholder={lg.url ? 'sans photo' : 'offre simulée — sans photo'}
      selected={selected}
      dimmed={fresh.stale || gone}
      onOpen={() => patch({ ficheId: lg.id })}
      ariaLabel={`${lg.name} — ${place || lg.src}${lg.note ? `, note ${lg.note}` : ''}${redirect ? '' : `, ${eur(lg.total)} tout compris`}`}
      badges={
        <>
          {lg.skiIn && <span className="lodgcard__badge lodgcard__badge--ski">{t('badge_ski_in')}</span>}
          {lg.note != null && lg.note !== '' && (
            <span className="lodgcard__badge lodgcard__badge--note" title={lg.avis ? `${lg.avis} avis` : undefined}>
              ★ {lg.note}
              {lg.avis > 0 ? ` (${lg.avis})` : ''}
            </span>
          )}
          <span className="lodgcard__badge lodgcard__badge--src">{lg.src}</span>
        </>
      }
    >
      <div className="lodgcard__extra">
        <div className="lodgcard__snow">
          <span className="lodgcard__snowbar" aria-hidden>
            <span className="lodgcard__snowfill" style={{ width: `${snowFill}%` }} />
          </span>
          <span className="lodgcard__snowtxt u-num">
            {snowKnown
              ? `${snow.bas != null ? fmt(snow.bas) : '—'} / ${snow.haut != null ? `${fmt(snow.haut)} cm` : '—'}`
              : `${fmt(domain.min)}–${fmt(domain.max)} m`}
          </span>
          <span className="lodgcard__snowlifts">
            {domain.lifts} {t('lifts_plural')}
          </span>
        </div>

        {priceStale && (
          <p className="lodgcard__flag lodgcard__flag--warn">
            Prix relevé pour le {fmtDay(lg.priceCheckIn!)} → {fmtDay(lg.priceCheckOut!)} — plus valable pour vos
            dates. Airbnb le recalcule ; relevez-le à nouveau.
          </p>
        )}

        {gone && <p className="lodgcard__flag lodgcard__flag--warn">{t('lodg_gone_notice')}</p>}

        {/* Disponibilité non prouvée. Le motif compte autant que le verdict :
            « listée sans tarif » et « relevée pour d'autres dates » n'appellent
            pas le même geste. Le second est déjà détaillé par `priceStale`. */}
        {unconfirmed && avail.reason === 'unpriced' && (
          <p className="lodgcard__flag lodgcard__flag--warn">
            {t('avail_unconfirmed')} — {t('avail_reason_unpriced')}
          </p>
        )}
        {unconfirmed && avail.reason === 'other_dates' && !priceStale && (
          <p className="lodgcard__flag lodgcard__flag--warn">
            {t('avail_unconfirmed')} — {t('avail_reason_other_dates')}
          </p>
        )}

        {!redirect && !priceStale && deal && (
          <p className="lodgcard__flag" style={{ color: deal.color, fontWeight: 700 }}>
            {deal.txt}
          </p>
        )}
        {!redirect && lg.stock > 0 && lg.stock <= 2 && (
          <p className="lodgcard__flag lodgcard__flag--warn">
            Plus que {lg.stock} logement(s) à ce tarif sur {srcOf(lg)}
          </p>
        )}
        {lg.annul && <p className="lodgcard__flag" style={{ color: 'var(--ok)' }}>Annulation gratuite</p>}
        {/* Même bien sur plusieurs sources : la source gagnante — celle dont le
            prix est affiché — passe en bleu, les autres sont barrées. Une ligne
            de texte les mettait sur le même plan, alors que le classement les a
            déjà départagées. */}
        {dups.length > 0 && (
          <p className="lodgcard__srcs">
            <span className="lodgcard__srcwin">{srcOf(lg)}</span>
            {dups.map((x) => (
              <span key={`${x.src}-${x.total}`} className="lodgcard__srclost">
                {x.src} {eur(x.total)}
              </span>
            ))}
          </p>
        )}
        {!redirect && (
          <p
            className="lodgcard__sub"
            style={{
              fontSize: 11,
              fontWeight: fresh.stale ? 600 : 400,
              color: fresh.stale ? 'var(--warn)' : 'var(--muted)'
            }}
          >
            {fresh.txt}
          </p>
        )}

        <div className="lodgcard__actions">
          <button
            type="button"
            className="actpill"
            onClick={(e) => {
              stop(e)
              patch({
                compareIds: inCompare
                  ? state.compareIds.filter((i) => i !== lg.id)
                  : [...state.compareIds, lg.id].slice(-4)
              })
            }}
          >
            {inCompare ? '✓ Comparé' : '＋ Comparer'}
          </button>
          <button
            type="button"
            className="actpill"
            onClick={(e) => {
              stop(e)
              toggleTrack()
            }}
          >
            {tracked ? '✓ Suivi' : 'Suivre le prix'}
          </button>
          <span className="u-spacer" />
          {target && (
            <button
              type="button"
              className="actpill actpill--strong"
              onClick={(e) => {
                stop(e)
                void window.skitrack.openExternal(target)
              }}
            >
              {/* Le libellé suit la source de l'offre : une carte sans prix
                  n'est pas forcément une carte Airbnb. Une annonce dont la
                  disponibilité n'est pas prouvée s'annonce comme telle — le
                  clic reste possible, mais il ne promet plus rien. */}
              {unconfirmed || gone
                ? t('avail_open_anyway')
                : redirect
                  ? `Voir sur ${srcOf(lg)}`
                  : lg.url
                    ? 'Annonce'
                    : `Chercher sur ${srcOf(lg)}`}
              <ExternalIcon />
            </button>
          )}
        </div>
      </div>
    </ResultCard>
  )

  if (!picked) return card

  /**
   * Vignette élue depuis la carte.
   *
   * Un fond teinté, un retrait et un liseré épais, et non un liseré seul : la
   * vignette n'a pas de cadre, un trait de un pixel autour d'elle passerait
   * inaperçu au milieu d'une mosaïque. La pastille porte sa propre croix — la
   * mise en avant doit se retirer là où on la voit.
   */
  return (
    <div className="lodgcard__picked">
      <p className="lodgcard__pickedtag">
        {t('lodg_picked_on_map')}
        <button
          type="button"
          className="linkbtn linkbtn--sm"
          aria-label={t('lodg_picked_clear')}
          onClick={() => patch({ lodgPickId: null })}
        >
          ✕
        </button>
      </p>
      {card}
    </div>
  )
}
