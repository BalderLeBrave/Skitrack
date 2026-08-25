/**
 * Mes favoris — stations suivies et séjours en préparation.
 *
 * Deux listes sur un même écran plutôt que deux entrées de navigation : elles
 * répondent à la même question — « où en étais-je ? » — et l'une est presque
 * toujours vide quand on découvre l'autre.
 *
 * Un séjour enregistré porte l'identifiant d'une station du référentiel. Le
 * référentiel peut changer entre deux sessions (réimport, correction du
 * classeur) : quand l'identifiant ne désigne plus rien, le séjour reste dans la
 * liste et le dit. Le supprimer d'office ferait disparaître sans prévenir un
 * séjour que l'utilisateur a délibérément enregistré.
 */

import { useMemo, useState } from 'react'
import { CloseIcon } from '@/components/Icons'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useUserData } from '@/state/userData'
import { useTripShare } from '@/state/tripShare'
import type { SavedTrip } from '@/store/userData'

export function FavoritesPage(): JSX.Element {
  const { t, lang } = useI18n()
  const { eur } = useFormat()
  const { state, patch, domains } = useApp()
  const { favorites, removeFavorite, trips, removeTrip } = useUserData()
  const { shareTrip, exportTrip, importFromFile } = useTripShare()
  // Accusé de réception éphémère, indexé par séjour : « lien copié » doit
  // s'afficher sur la ligne qu'on vient d'actionner, pas sur toutes.
  const [flash, setFlash] = useState<{ id: string; text: string } | null>(null)

  const announce = (id: string, text: string): void => {
    setFlash({ id, text })
    window.setTimeout(() => setFlash((f) => (f?.id === id ? null : f)), 2400)
  }

  const byId = useMemo(() => new Map(domains.map((d) => [d.id, d])), [domains])

  const fmtDay = (iso: string): string => {
    try {
      return new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', {
        day: 'numeric',
        month: 'short'
      })
    } catch {
      return iso
    }
  }

  /**
   * Rouvre un séjour : ses paramètres redeviennent ceux de la recherche.
   *
   * Le budget n'est reposé que s'il en portait un. Un séjour enregistré sans
   * plafond ne doit pas en poser un au retour — « absent » est une valeur, pas
   * un trou à combler.
   */
  const reopen = (trip: SavedTrip): void => {
    patch({
      selectedId: trip.stationId,
      lodgingDomainId: trip.stationId,
      arrDate: trip.dates.from,
      depDate: trip.dates.to,
      travelers: trip.party.adults + trip.party.children,
      children: trip.party.children,
      ...(trip.budget ? { budgetMax: trip.budget.max, budgetMode: trip.budget.mode } : {}),
      tab: 'recherche'
    })
  }

  return (
    <div className="page">
      <div className="page__inner" style={{ maxWidth: 1100 }}>
        <header className="page-head" style={{ marginBottom: 18 }}>
          <h2>{t('fav_title')}</h2>
        </header>

        <section className="panel" style={{ padding: '18px 20px', margin: '0 0 18px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>
            {t('fav_stations_title')}
            {favorites.length > 0 ? ` · ${favorites.length}` : ''}
          </h3>

          {favorites.length === 0 ? (
            <p className="u-muted" style={{ margin: 0, fontSize: 14, maxWidth: '56ch' }}>
              {t('fav_stations_empty')}
            </p>
          ) : (
            <ul className="favlist">
              {favorites.map((fav) => {
                const domain = byId.get(fav.stationId)
                return (
                  <li key={fav.stationId} className="favlist__row">
                    <span className="favlist__name u-ellipsis">
                      {domain?.name ?? `#${fav.stationId}`}
                      {!domain && (
                        <span className="u-muted" style={{ fontWeight: 400 }}>
                          {' '}
                          — {t('fav_station_gone')}
                        </span>
                      )}
                    </span>
                    <span className="u-muted favlist__meta">
                      {domain ? [domain.massif || domain.region, `${domain.village} m`].filter(Boolean).join(' · ') : ''}
                    </span>
                    <span className="u-spacer" />
                    {domain && (
                      <button
                        type="button"
                        className="linkbtn"
                        onClick={() => patch({ selectedId: domain.id, domFicheId: domain.id, tab: 'recherche' })}
                      >
                        {t('fav_open')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="iconbtn"
                      aria-label={t('fav_remove')}
                      title={t('fav_remove')}
                      onClick={() => void removeFavorite(fav.stationId)}
                    >
                      <CloseIcon />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="panel" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '0 0 12px' }}>
            <h3 style={{ margin: 0, fontSize: 15, flex: 1, minWidth: 0 }}>
              {t('fav_trips_title')}
              {trips.length > 0 ? ` · ${trips.length}` : ''}
            </h3>
            <button type="button" className="linkbtn" onClick={() => void importFromFile()}>
              {t('trip_import_open')}
            </button>
          </div>

          {trips.length === 0 ? (
            <p className="u-muted" style={{ margin: 0, fontSize: 14, maxWidth: '56ch' }}>
              {t('fav_trips_empty')}
            </p>
          ) : (
            <ul className="favlist">
              {trips.map((trip) => {
                const domain = byId.get(trip.stationId)
                const budgetTxt = trip.budget
                  ? (trip.budget.mode === 'perso' ? t('trip_budget_perso') : t('trip_budget_total')).replace(
                      '{v}',
                      eur(trip.budget.max)
                    )
                  : t('trip_no_budget')
                return (
                  <li key={trip.id} className="favlist__row">
                    <span className="favlist__name u-ellipsis">
                      {trip.label}
                      {!domain && (
                        <span className="u-muted" style={{ fontWeight: 400 }}>
                          {' '}
                          — {t('fav_station_gone')}
                        </span>
                      )}
                    </span>
                    <span className="u-muted favlist__meta">
                      {[
                        `${fmtDay(trip.dates.from)} → ${fmtDay(trip.dates.to)}`,
                        t('trip_party')
                          .replace('{a}', String(trip.party.adults))
                          .replace('{c}', String(trip.party.children)),
                        budgetTxt
                      ].join(' · ')}
                    </span>
                    <span className="u-spacer" />
                    {flash?.id === trip.id && (
                      <span className="u-muted" style={{ fontSize: 12 }}>
                        {flash.text}
                      </span>
                    )}
                    <button
                      type="button"
                      className="linkbtn"
                      onClick={() => {
                        void shareTrip(trip).then((outcome) => {
                          if (outcome.kind === 'canceled') return
                          announce(
                            trip.id,
                            outcome.kind === 'copied'
                              ? t('trip_share_copied')
                              : outcome.kind === 'exported'
                                ? t('trip_share_exported')
                                : t('trip_share_failed')
                          )
                        })
                      }}
                    >
                      {t('trip_share')}
                    </button>
                    <button
                      type="button"
                      className="linkbtn linkbtn--muted"
                      onClick={() => {
                        void exportTrip(trip).then((outcome) => {
                          if (outcome.kind === 'canceled') return
                          announce(
                            trip.id,
                            outcome.kind === 'exported' ? t('trip_share_exported') : t('trip_share_failed')
                          )
                        })
                      }}
                    >
                      {t('trip_share_export')}
                    </button>
                    <button type="button" className="linkbtn" onClick={() => reopen(trip)}>
                      {t('trip_reopen')}
                    </button>
                    <button
                      type="button"
                      className="iconbtn"
                      aria-label={t('trip_remove')}
                      title={t('trip_remove')}
                      onClick={() => void removeTrip(trip.id)}
                    >
                      <CloseIcon />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {state.tracked.length > 0 && (
          <p className="u-muted" style={{ fontSize: 13, marginTop: 14 }}>
            <button type="button" className="linkbtn" onClick={() => patch({ tab: 'suivi' })}>
              {t('nav_tracking')} · {state.tracked.length}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
