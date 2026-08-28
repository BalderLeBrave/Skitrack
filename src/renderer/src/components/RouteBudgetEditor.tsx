/**
 * Saisie guidée du coût de la route.
 *
 * ## Ce que remplaçait ce formulaire
 *
 * Deux constantes en dur — 0,115 €/km de carburant, 0,058 €/km de péages —
 * appliquées à une distance elle-même estimée à vol d'oiseau tant qu'aucun
 * itinéraire n'a été calculé. Deux forfaits multipliés par une estimation,
 * additionnés au budget du séjour sans que rien ne le dise.
 *
 * ## Trois régimes, du plus fiable au moins fiable
 *
 * 1. Un **montant forfaitaire** aller-retour, quand l'utilisateur connaît son
 *    coût de trajet mieux que n'importe quel calcul. Il court-circuite tout.
 * 2. Le **prix du litre** et la **consommation** réels de son véhicule.
 * 3. À défaut, les barèmes — et l'écran les annonce comme estimés.
 *
 * Les péages se superposent aux trois : un montant saisi, ou relevé sur
 * ViaMichelin, remplace le barème kilométrique sans toucher au carburant.
 *
 * ## Le relevé ViaMichelin
 *
 * ViaMichelin ne publie pas d'API : le relevé lit une page, à la demande, et
 * **ne produit aucun chiffre en cas d'échec**. Voir `src/main/routeCost.ts`.
 * Le bouton ouvre aussi la page dans le navigateur, pour vérifier.
 */

import { useState } from 'react'
import type { RouteCostOutcome } from '@shared/ipc-contract'
import { routeOriginOf } from '@/domain/costs'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { ExternalIcon } from './Icons'

/** Un nombre positif, ou `undefined` — jamais `NaN`, jamais un zéro déguisé. */
function nombre(v: string): number | undefined {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export function RouteBudgetEditor(): JSX.Element {
  const { t, lang } = useI18n()
  const { state, patch, domains } = useApp()
  const { hh } = useDerived()
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<RouteCostOutcome | null>(null)

  const b = state.routeBudget
  const origin = routeOriginOf(b, state.avoidTolls)

  const set = (patchBudget: Partial<typeof b>): void =>
    patch({ routeBudget: { ...b, ...patchBudget } })

  /** Le foyer et la station qui servent au relevé : le premier départ géocodé
   *  et le domaine consulté. Sans l'un des deux, le relevé n'a pas de trajet. */
  const from = hh.find((o) => o.lat != null && o.lon != null)
  const to = domains.find((d) => d.id === (state.lodgingDomainId ?? state.selectedId))
  const relevable = from != null && to != null

  const relever = async (): Promise<void> => {
    if (!relevable || !from?.lat || !from.lon) return
    setBusy(true)
    setOutcome(null)
    try {
      const res = await window.skitrack.routeCost({
        fromLat: from.lat,
        fromLon: from.lon,
        toLat: to.lat,
        toLon: to.lon,
        fuelPricePerL: b.fuelPricePerL,
        avoidTolls: state.avoidTolls
      })
      setOutcome(res)
      // Seul un relevé abouti écrit dans le budget. Un échec ne touche à rien :
      // il ne doit pas effacer une saisie ni poser une valeur de repli.
      if (res.ok && res.tolls != null) {
        patch({ routeBudget: { ...b, tollsRoundTrip: Math.round(res.tolls * 2) }, routeCostAt: res.at })
      }
    } catch (err) {
      setOutcome({ ok: false, error: err instanceof Error ? err.message : String(err), url: '' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel settings__card" id="set-route-budget">
      <h2>{t('route_budget_title')}</h2>
      <p className="settings__help">{t('route_budget_help')}</p>

      <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            {t('route_fuel_price')}
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              className="field field--panel u-num"
              style={{ width: 110, padding: '6px 8px' }}
              placeholder={t('route_fuel_price_example')}
              value={b.fuelPricePerL ?? ''}
              onChange={(e) => set({ fuelPricePerL: nombre(e.target.value) })}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            {t('route_conso')}
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              className="field field--panel u-num"
              style={{ width: 110, padding: '6px 8px' }}
              placeholder={t('route_conso_example')}
              value={b.consoL100 ?? ''}
              onChange={(e) => set({ consoL100: nombre(e.target.value) })}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            {t('route_tolls')}
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              className="field field--panel u-num"
              style={{ width: 130, padding: '6px 8px' }}
              placeholder={t('route_tolls_example')}
              value={b.tollsRoundTrip ?? ''}
              onChange={(e) => set({ tollsRoundTrip: nombre(e.target.value) })}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            {t('route_flat')}
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={1}
              className="field field--panel u-num"
              style={{ width: 130, padding: '6px 8px' }}
              placeholder={t('route_flat_example')}
              value={b.flatTotal ?? ''}
              onChange={(e) => set({ flatTotal: nombre(e.target.value) })}
            />
          </label>
        </div>

        <p className="u-muted" style={{ margin: 0, fontSize: 11.5 }}>
          {t('route_flat_note')}
        </p>

        {/* Les deux postes portent leur origine séparément : on peut avoir saisi
            sa consommation sans connaître ses péages. */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11 }}>
          <span style={{ color: origin.fuel === 'saisi' ? 'var(--ok)' : 'var(--warn)' }}>
            {t(origin.fuel === 'saisi' ? 'route_fuel_entered' : 'route_fuel_estimated')}
          </span>
          <span style={{ color: origin.tolls === 'saisi' ? 'var(--ok)' : 'var(--warn)' }}>
            {t(origin.tolls === 'saisi' ? 'route_tolls_entered' : 'route_tolls_estimated')}
          </span>
          {/* La date du relevé survit au redémarrage, comme le montant :
              annoncer « relevé » sans dire quand, c'est le défaut que la
              pastille de fraîcheur des logements vient d'abandonner. */}
          {state.routeCostAt != null && (
            <span className="u-muted">
              {t('route_recorded_on').replace(
                '{d}',
                new Date(state.routeCostAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')
              )}
            </span>
          )}
        </div>

        <div
          className="inset"
          style={{ padding: 14, display: 'grid', gap: 8, borderColor: 'var(--border)' }}
        >
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{t('route_vm_title')}</p>
          <p className="u-muted" style={{ margin: 0, fontSize: 12 }}>
            {t('route_vm_help')}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="btn"
              disabled={busy || !relevable}
              onClick={() => void relever()}
            >
              {busy ? t('loading') : t('route_vm_fetch')}
            </button>
            {outcome?.url && (
              <button
                type="button"
                className="linkbtn"
                onClick={() => void window.skitrack.openExternal(outcome.url)}
              >
                {t('route_vm_open')}
                <ExternalIcon />
              </button>
            )}
          </div>
          {!relevable && (
            <p className="u-muted" style={{ margin: 0, fontSize: 12 }}>
              {t('route_vm_needs')}
            </p>
          )}
          {outcome && (
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: outcome.ok ? 'var(--ok)' : 'var(--warn)'
              }}
            >
              {outcome.ok
                ? t('route_vm_ok')
                    .replace('{t}', outcome.tolls != null ? `${outcome.tolls} €` : '—')
                    .replace('{f}', outcome.fuel != null ? `${outcome.fuel} €` : '—')
                    .replace('{k}', outcome.distanceKm != null ? `${outcome.distanceKm} km` : '—')
                : t('route_vm_failed').replace('{e}', outcome.error)}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
