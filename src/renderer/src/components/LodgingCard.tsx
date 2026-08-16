/**
 * Vignette d'une offre de logement, dans la mosaïque de l'écran Logements.
 *
 * Elle **compose** `ResultCard` : le gabarit — média, titre, lieu, deux faits,
 * prix — vient de là, et rien de ce que cet écran sait faire n'y est perdu.
 * Ce qui reste ici est ce que la vignette générique n'a pas à connaître :
 * pastilles de source et de ski aux pieds, écarts au marché, doublons fusionnés,
 * prix devenu caduc, annonce disparue du dernier relevé, comparateur, suivi de
 * prix et ouverture de l'annonce.
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
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'

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
   * Annonce que le dernier relevé n'a pas retrouvée à ces dates.
   *
   * Une recherche Airbnb ne liste que ce qui est libre : son absence signifie
   * presque toujours « réservée ». On le dit sur la vignette plutôt que de
   * laisser l'utilisateur l'apprendre en ouvrant la page, mais on ne l'affirme
   * pas — un relevé ne voit que les premiers écrans de résultats.
   */
  const gone =
    lg.missingSince != null &&
    lg.missingSince.checkIn === state.arrDate &&
    lg.missingSince.checkOut === state.depDate

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

  return (
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
      ariaLabel={`${lg.name} — ${place || lg.src}${redirect ? '' : `, ${eur(lg.total)} tout compris`}`}
      badges={
        <>
          {lg.skiIn && <span className="lodgcard__badge lodgcard__badge--ski">{t('badge_ski_in')}</span>}
          <span className="lodgcard__badge lodgcard__badge--src">{lg.src}</span>
        </>
      }
    >
      <div className="lodgcard__extra">
        {priceStale && (
          <p className="lodgcard__flag lodgcard__flag--warn">
            Prix relevé pour le {fmtDay(lg.priceCheckIn!)} → {fmtDay(lg.priceCheckOut!)} — plus valable pour vos
            dates. Airbnb le recalcule ; relevez-le à nouveau.
          </p>
        )}

        {gone && <p className="lodgcard__flag lodgcard__flag--warn">{t('lodg_gone_notice')}</p>}

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
        {dups.length > 0 && (
          <p className="lodgcard__sub" style={{ fontSize: 11 }}>
            Aussi sur {dups.map((x) => `${x.src} à ${fmt(x.total)} € (+${fmt(x.total - lg.total)} €)`).join(' · ')}
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
            className="linkbtn"
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
            className="linkbtn"
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
              className="linkbtn"
              onClick={(e) => {
                stop(e)
                void window.skitrack.openExternal(target)
              }}
            >
              {/* Le libellé suit la source de l'offre : une carte sans prix
                  n'est pas forcément une carte Airbnb. */}
              {redirect
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
}
