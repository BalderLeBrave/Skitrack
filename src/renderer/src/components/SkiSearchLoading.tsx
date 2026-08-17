/**
 * Écran de relevé des logements — transposition de la maquette Claude Design.
 *
 * Structure reprise telle quelle : rotor, titre « Recherche de logements à X »,
 * ligne de critères, compteur d'offres à droite, barre de progression, puis
 * l'état source par source avec pastille, libellé et décompte.
 *
 * ## Un écart assumé avec la maquette
 *
 * La maquette fait défiler les cinq sources l'une après l'autre — « interrogée »,
 * « interrogation… », « en attente » — en s'appuyant sur un `scanStage` que le
 * prototype incrémente tout seul. C'est une animation, pas une mesure.
 *
 * Les cinq sources sont bien toutes interrogées désormais : Airbnb par
 * `runAirbnbSearch`, les autres par `runProviderSearch`. Mais les deux appels
 * sont opaques — aucun événement intermédiaire ne remonte du processus
 * principal — donc le rendu ne peut pas savoir laquelle a déjà répondu. Le
 * défilement resterait une fiction : toutes les lignes actives affichent le
 * même état, « interrogation… », jusqu'au retour des résultats.
 *
 * Le décompte de chaque ligne est le nombre d'offres déjà connues pour ce
 * domaine, et la barre mesure le temps écoulé face au délai maximum — ce
 * qu'elle annonce explicitement en pied de panneau.
 */

import { lodgingSources, srcOf } from '@/data/lodgings'
import type { Lodging } from '@/data/lodgings'
import type { Domain } from '@/data/referentiel'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'

interface Props {
  domain: Domain
  /** Message de progression émis par la recherche, s'il y en a un. */
  message?: string | null
  elapsedSec?: number
  /** Délai max affiché, en secondes. */
  timeoutSec?: number
  /** Offres déjà connues, toutes sources, pour ce domaine. */
  known?: Lodging[]
}

export function SkiSearchLoading({
  domain,
  message,
  elapsedSec = 0,
  timeoutSec = 120,
  known = []
}: Props): JSX.Element {
  const { state } = useApp()
  const { fmtDate } = useFormat()
  const { t } = useI18n()

  const counts = new Map<string, number>()
  for (const lg of known) {
    const key = srcOf(lg)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const criteria = [
    `${fmtDate(state.arrDate)} → ${fmtDate(state.depDate)}`,
    `${state.travelers} ${t('scan_travelers')}`,
    `${state.rooms} ${t('scan_rooms_min')}`
  ].join(' · ')

  const progress = Math.min(0.95, elapsedSec / Math.max(1, timeoutSec))

  return (
    <div className="lodgscan" role="status" aria-live="polite" aria-busy="true">
      <div className="lodgscan__head">
        <div className="lodgscan__spinner" aria-hidden />
        <div className="lodgscan__ident">
          <p className="lodgscan__title">
            {t('scan_searching_lodgings')} {domain.name}
          </p>
          <p className="lodgscan__criteria">{message?.trim() || criteria}</p>
        </div>
        <div className="lodgscan__tally">
          <p className="lodgscan__count u-num">{known.length}</p>
          <p className="lodgscan__count-label">{t('scan_offers_found')}</p>
        </div>
      </div>

      <div className="lodgscan__bar">
        <div className="lodgscan__bar-fill" style={{ width: `${Math.max(4, progress * 100)}%` }} />
      </div>

      <div className="lodgscan__rows">
        {lodgingSources(known, state.lodgQueried).map((name) => {
          // Toutes les sources non désactivées sont réellement interrogées :
          // Airbnb par `runAirbnbSearch`, les autres par `runProviderSearch`.
          const off = state.lodgSrcOff.includes(name)
          const active = !off
          const n = counts.get(name) ?? 0

          const status = off ? t('scan_src_disabled') : t('scan_src_querying')

          return (
            <div
              key={name}
              className={`lodgscan__row${off ? ' lodgscan__row--off' : active ? '' : ' lodgscan__row--idle'}`}
            >
              <span
                className={`lodgscan__dot${off ? ' lodgscan__dot--off' : active ? ' lodgscan__dot--active' : n > 0 ? ' lodgscan__dot--done' : ''}`}
              />
              <span className="lodgscan__name">{name}</span>
              <span className="lodgscan__status">{status}</span>
              <span style={{ flex: 1 }} />
              <span
                className={`lodgscan__row-count${n > 0 && !off ? ' lodgscan__row-count--strong' : ''}`}
              >
                {off ? '—' : n > 0 ? `${n} ${t(n > 1 ? 'scan_offers_plural' : 'scan_offers_one')}` : ''}
              </span>
            </div>
          )
        })}
      </div>

      <p className="lodgscan__foot">
        {t('scan_elapsed_note')
          .replace('{e}', String(elapsedSec))
          .replace('{t}', String(timeoutSec))}
      </p>
    </div>
  )
}
