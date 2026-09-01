/**
 * Vignette d'une offre de logement.
 *
 * Gabarit **propre à l'écran Logements**, et non le `ResultCard` partagé par
 * Domaines, Meilleures offres et Décision : la structure demandée ici — note
 * sur la ligne du titre, faits sur deux lignes, action principale pleine
 * largeur au-dessus des actions secondaires — ne vaut que pour un logement, et
 * l'imposer aux trois autres écrans les aurait déformés sans raison.
 *
 * Ce qui en est repris tel quel, pour ne pas diverger : le repli d'image
 * `NoImage`, le contrat d'accessibilité (`role="link"`, tabulation, Entrée et
 * Espace) et la gestion d'une URL de photo qui répond 404.
 *
 * Hiérarchie :
 *  1. photo + pastille de source
 *  2. nom + note
 *  3. domaine · altitude · capacité, puis distance aux pistes
 *  4. montant du séjour (teinte ok/warn)
 *  5. ouvrir sur la source, puis suivre / comparer
 *
 * La bande neige / remontées du domaine n'apparaît pas ici : c'est une donnée
 * du domaine, identique sur toutes les vignettes, et elle vit dans l'encadré
 * en tête d'écran.
 */

import { useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent } from 'react'
import { ExternalIcon } from './Icons'
import { NoImage } from './ResultCard'
import { ProviderBadge } from './ProviderBadge'
import type { Lodging } from '@/data/lodgings'
import type { Domain } from '@/data/referentiel'
import { freshnessOf, sizeLabel, srcOf, trackKey } from '@/data/lodgings'
import { hotelRoomsNeeded, isCombinableHotel, partyVerdict } from '@/data/lodgingFilter'
import { listingUrlWithStay, searchUrlFor } from '@/data/deeplinks'
import { availabilityOf } from '@/data/lodgingAvailability'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'

interface Props {
  lodging: Lodging
  domain: Domain
  /** Rang dans la grille : les 6 premières photos partent en priorité. */
  index?: number
}

export function LodgingCard({ lodging: lg, domain, index = 99 }: Props): JSX.Element {
  const { t } = useI18n()
  const { eur, fmt, fmtDay } = useFormat()
  const { lang } = useI18n()
  const { state, patch } = useApp()

  const criteria = {
    domainName: domain.name,
    arrDate: state.arrDate,
    depDate: state.depDate,
    travelers: state.travelers,
    rooms: state.rooms,
    officialUrl: domain.booking ?? domain.website
  }
  const searchUrl = searchUrlFor(srcOf(lg), criteria)
  // Le connecteur d'origine plutôt que le libellé affiché : « Centrale de
  // réservation » recouvre plusieurs moteurs, qui n'attendent pas les mêmes
  // paramètres de séjour dans leur URL.
  const target = lg.url
    ? listingUrlWithStay(lg.url, lg.srcConnector ?? srcOf(lg), criteria)
    : searchUrl

  const redirect = lg.total <= 0
  const priceStale =
    !redirect &&
    lg.priceCheckIn != null &&
    (lg.priceCheckIn !== state.arrDate || lg.priceCheckOut !== state.depDate)

  const avail = availabilityOf(lg, { checkIn: state.arrDate, checkOut: state.depDate })
  const gone = avail.status === 'gone'
  const unconfirmed = avail.status === 'unconfirmed'

  const accessKnown =
    lg.accessComputed ?? (lg.dist > 0 || lg.den > 0 || lg.liftDist > 0 || lg.skiIn)

  const selected = lg.id === state.ficheId
  const inCompare = state.compareIds.includes(lg.id)
  const inSelection = state.selLodgings[domain.id] === lg.id
  const tracked = state.tracked.some((tr) => tr.key === trackKey(lg))
  const fresh = freshnessOf(lg, lang, state.lastScan)
  const dups = lg.dups ?? []
  const dense = state.density === 'compact'

  // Une URL de photo peut répondre 404 : l'état est local à la vignette, et se
  // réarme de lui-même quand la liste change de clé React.
  const [broken, setBroken] = useState(false)

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

  const toggleCompare = (): void => {
    patch({
      compareIds: inCompare
        ? state.compareIds.filter((i) => i !== lg.id)
        : [...state.compareIds, lg.id].slice(-4)
    })
  }

  // Ligne 2 — domaine, altitude, puis capacité et type. Le domaine est répété
  // sur chaque vignette alors que l'écran n'en montre qu'un : c'est voulu, une
  // vignette isolée (comparateur, mise en avant depuis la carte) doit se
  // suffire. L'altitude vient de `lg.alt`, mesurée depuis la position, jamais
  // recopiée de la station.
  /*
   * Badge « capacité non annoncée » : les critères demandent quelque chose que
   * l'annonce n'annonce pas. Ces annonces s'affichent par défaut — c'est ce
   * badge qui porte l'avertissement, pas leur absence de la liste.
   */
  const nonAnnoncee =
    partyVerdict(lg, { travelers: state.travelers, rooms: state.rooms }) === 'non-annonce'

  const hotelOffer =
    isCombinableHotel(lg) && lg.pers > 0
      ? {
          rooms: hotelRoomsNeeded(lg.pers, { guests: state.travelers, bedrooms: state.rooms }),
          occupancy: lg.pers
        }
      : null

  const place = [
    domain.name || null,
    lg.alt ? `${fmt(lg.alt)} m` : null,
    lg.type || null,
    hotelOffer
      ? `${hotelOffer.rooms} ch. hôtel · ${hotelOffer.rooms * hotelOffer.occupancy} pers`
      : lg.pers
        ? `${lg.pers} pers`
        : null,
    hotelOffer ? null : sizeLabel(lg, t),
    lg.m2 ? `${lg.m2} m²` : null,
    nonAnnoncee ? `⚠ ${t('lodg_unannounced_badge')}` : null
  ]
    .filter(Boolean)
    .join(' · ')

  /*
   * Ligne 3 — l'accès aux pistes, tel que le moteur local l'a calculé sur les
   * tracés OpenSkiMap : distance, dénivelé signé, temps de marche. Chaque terme
   * n'apparaît que s'il a été mesuré — un « ±0 m · 0 min » inventerait un
   * logement au bord des pistes.
   */
  const factLeft = !accessKnown
    ? t('dist_not_computed')
    : [
        // L'étiquette nomme le point réellement mesuré. « des pistes » était
        // écrit en dur, y compris quand la mesure portait sur une remontée —
        // c'est-à-dire toujours, faute de tracés importés.
        lg.skiIn
          ? t('badge_ski_in')
          : lg.dist > 0
            ? t(lg.accessPoint === 'piste' ? 'lodg_dist_to_runs' : 'lodg_dist_to_lift').replace(
                '{n}',
                fmt(lg.dist)
              )
            : null,
        lg.den !== 0 ? `${lg.den > 0 ? '+' : ''}${fmt(lg.den)} m` : null,
        lg.walk > 0 ? `${lg.walk} min à pied` : null
      ]
        .filter(Boolean)
        .join(' · ')

  const conf = lg.priceConfidence
  const partial = conf === 'partial'
  const price = redirect
    ? { amount: t('lodg_price_on_source').replace('{s}', srcOf(lg)), unit: '' }
    : {
        amount: partial ? `${t('price_from')} ${eur(lg.total)}` : eur(lg.total),
        unit: partial
          ? t('price_unit_partial').replace('{pp}', eur(lg.pp))
          : t('price_unit_confirmed').replace('{pp}', eur(lg.pp))
      }

  /*
   * Plus de teinte selon la confiance du prix : la liste n'admet que des prix
   * vérifiés, la confiance vaut donc « confirmé » partout et le vert ne
   * séparait plus rien. Le montant prend le bleu de marque, comme les filtres.
   */

  /*
   * Aucune mention de confiance du prix sur la vignette : depuis
   * `confirmedPricesOnly` (voir `data/lodgingFilter.ts`), une annonce listée
   * porte forcément un prix complet relevé pour ces dates. L'écrire sur chaque
   * carte reviendrait à répéter une garantie que la liste tient déjà.
   */

  const picked = lg.id === state.lodgPickId

  const openSheet = (): void => patch({ ficheId: lg.id })
  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    // Espace ferait défiler la page sous la carte, Entrée validerait un
    // formulaire parent. Reprise telle quelle du gabarit partagé.
    e.preventDefault()
    openSheet()
  }
  const showImage = Boolean(lg.image) && !broken

  const card = (
    <article
      className={`lodgcard${selected ? ' lodgcard--on' : ''}`}
      role="link"
      tabIndex={0}
      aria-label={`${lg.name} — ${place || srcOf(lg)}${lg.note ? `, note ${lg.note}` : ''}${
        redirect
          ? ''
          : partial
            ? `, ${t('price_from')} ${eur(lg.total)}`
            : `, ${eur(lg.total)} ${t('price_all_in')}`
      }`}
      aria-current={selected ? 'true' : undefined}
      onClick={openSheet}
      onKeyDown={onKeyDown}
    >
      <div
        className={`lodgcard__media lodgcard__media--${dense ? 'square' : 'wide'}${
          fresh.stale || gone ? ' lodgcard__media--stale' : ''
        }`}
      >
        {showImage ? (
          <img
            className="lodgcard__img"
            src={lg.image as string}
            alt=""
            loading={index < 6 ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={index < 6 ? 'high' : 'low'}
            width={400}
            height={250}
            onError={() => setBroken(true)}
          />
        ) : (
          <NoImage label={domain.name} />
        )}
        {/* Les pastilles sont rangées dans une rangée, et non posées en absolu
            chacune de son côté : « Ski aux pieds » à gauche, la source à
            droite. Deux pastilles absolues finissaient par se chevaucher dès
            que le nom de la centrale s'allongeait — « Les Menuires
            Réservation » suffisait. La mention de confiance du prix, elle, est
            redescendue dans le corps de la vignette. */}
        <div className="lodgcard__badges">
          {lg.skiIn ? (
            <span className="lodgcard__badge lodgcard__badge--ski">{t('badge_ski_in')}</span>
          ) : (
            <span />
          )}
          {/* Le « +N » dit qu'un même bien a été reconnu sur N autres
              plateformes. La source nommée est celle du prix retenu — le moins
              cher. Le détail (quelle plateforme, à quel prix) est au survol, et
              répété en clair sous le prix. */}
          <span
            className="lodgcard__badge lodgcard__badge--src"
            title={
              dups.length > 0
                ? `${srcOf(lg)} — ${t('lodg_also_on').replace(
                    '{s}',
                    dups.map((x) => `${srcOf(x)} ${eur(x.total)}`).join(', ')
                  )}`
                : srcOf(lg)
            }
          >
            {/* La teinte de la plateforme, en repère de balayage ; le nom
                reste lu et tronqué exactement comme avant. */}
            <ProviderBadge provider={srcOf(lg)} size="sm" />
            {dups.length > 0 && (
              <span className="lodgcard__srcplus">+{dups.length}</span>
            )}
          </span>
        </div>
      </div>

      <div className="lodgcard__body">
        <div className="lodgcard__titlerow">
          <h3 className="lodgcard__name" title={lg.name}>
            {lg.name}
          </h3>
          {/* `'—'` est la marque « non renseigné » posée par l'import Airbnb
              sur une annonce trop neuve pour être notée. Une étoile suivie d'un
              tiret ne dit rien : mieux vaut ne rien mettre. */}
          {lg.note && lg.note !== '—' && (
            <span className="lodgcard__note">
              ★ {lg.note}
              {lg.avis > 0 && <span className="u-muted"> {lg.avis} avis</span>}
            </span>
          )}
        </div>

        <p className="lodgcard__sub" title={place}>
          {place}
        </p>
        <p className="lodgcard__sub" title={factLeft}>
          {factLeft}
        </p>

        <p className="lodgcard__price">
          <strong className="lodgcard__total crn-releve">{price.amount}</strong>{' '}
          <span className="lodgcard__unit">{price.unit}</span>
        </p>

        <div className="lodgcard__extra">
        {priceStale && (
          <p className="lodgcard__flag lodgcard__flag--warn">
            Prix du {fmtDay(lg.priceCheckIn!)} → {fmtDay(lg.priceCheckOut!)} — plus valable pour
            vos dates.
          </p>
        )}

        {gone && <p className="lodgcard__flag lodgcard__flag--warn">{t('lodg_gone_notice')}</p>}

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

        {/* Plus aucun verdict de prix sur la vignette. « Bon plan » puis
            « Au-dessus du marché » ont été retirés : le montant se compare tout
            seul aux vignettes voisines, et une médiane calculée sur une liste
            courte disait surtout la taille de la liste. */}
        {!redirect && lg.stock > 0 && lg.stock <= 2 && (
          <p className="lodgcard__flag lodgcard__flag--warn">
            Plus que {lg.stock} logement(s) à ce tarif
          </p>
        )}
        {lg.annul && (
          <p className="lodgcard__flag" style={{ color: 'var(--ok)' }}>
            Annulation gratuite
          </p>
        )}
        {dups.length > 0 && (
          <p className="lodgcard__srcs">
            <span className="lodgcard__srcwin">{srcOf(lg)}</span>
            {dups.map((x) => (
              <span key={`${x.src}-${x.total}`} className="lodgcard__srclost">
                {srcOf(x)} {eur(x.total)}
              </span>
            ))}
          </p>
        )}
        </div>

        {/* Hiérarchie des gestes : *retenir* est le seul qui fait avancer le
            parcours (étape 2 → 3), il prend donc la pilule d'accent pleine
            largeur. Ouvrir l'annonce sur sa source fait quitter l'application :
            utile, mais secondaire — il redescend avec Suivre et Comparer.

            Le pied est poussé en bas de la carte (`margin-top: auto`) : les
            boutons d'une même rangée tombent ainsi sur la même ligne, quel que
            soit le nombre de mentions affichées au-dessus. */}
        <div className="lodgcard__foot">
          <button
            type="button"
            className={`lodgcard__cta${inSelection ? ' lodgcard__cta--on' : ''}`}
            aria-pressed={inSelection}
            data-testid={`lodgcard-keep-${lg.id}`}
            onClick={(e) => {
              stop(e)
              const next = { ...state.selLodgings }
              if (inSelection) delete next[domain.id]
              else next[domain.id] = lg.id
              patch({ selLodgings: next })
            }}
          >
            {inSelection ? `✓ ${t('lodg_kept')}` : t('lodg_keep')}
          </button>

          <div className="lodgcard__actions">
            {target && (
              <button
                type="button"
                className="actpill actpill--open"
                data-testid={`lodgcard-open-${lg.id}`}
                onClick={(e) => {
                  stop(e)
                  void window.skitrack.openExternal(target)
                }}
              >
                {unconfirmed || gone ? t('avail_open_anyway') : `${t('lodg_open_on')} ${srcOf(lg)}`}
                <ExternalIcon />
              </button>
            )}
            <button
              type="button"
              className="actpill"
              onClick={(e) => {
                stop(e)
                toggleTrack()
              }}
            >
              {tracked ? '✓ Suivi' : 'Suivre'}
            </button>
            <button
              type="button"
              className={`actpill${inCompare ? ' actpill--on' : ''}`}
              onClick={(e) => {
                stop(e)
                toggleCompare()
              }}
            >
              {inCompare ? '✓ Comparé' : 'Comparer'}
            </button>
          </div>
        </div>
      </div>
    </article>
  )

  if (!picked) return card

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
