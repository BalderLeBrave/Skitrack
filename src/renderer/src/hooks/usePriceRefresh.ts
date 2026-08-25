/**
 * Boucle de rerelevé des prix suivis, et déclenchement des alertes.
 *
 * Monté une fois, dans la coquille applicative. Toutes les décisions —
 * quoi relever, comment lire la réponse, faut-il notifier — sont dans
 * `data/priceRefresh` et `domain/priceAlerts`, deux modules purs et testés.
 * Ce fichier ne fait que les enchaîner et parler au monde extérieur.
 *
 * ## Trois précautions
 *
 * **Un seul tour à la fois.** Un relevé de centrale prend des dizaines de
 * secondes ; sans verrou, un second tour partirait par-dessus le premier et
 * doublerait le trafic sur des sites qu'on interroge déjà avec parcimonie.
 *
 * **Les lots sont relevés en série, pas en parallèle.** Le moteur du processus
 * principal a ses propres coupe-circuits et sa lecture de `robots.txt`, mais
 * rien ne l'oblige à sérialiser ce que le renderer lui envoie d'un coup. Deux
 * domaines à la fois, c'est deux fois la charge sur une centrale qui en héberge
 * plusieurs.
 *
 * **Le tour ne bloque jamais l'interface.** Une source en panne produit un lot
 * sans point, pas une erreur remontée à l'écran : l'échec d'une source reste
 * local, c'est un invariant du projet.
 */

import { useCallback, useEffect, useRef } from 'react'
import { runProviderSearch } from '@/data/runProviderSearch'
import { groupForRefresh, perPersonOf, readingsForGroup } from '@/data/priceRefresh'
import { evaluateAlert, valueFor } from '@/domain/priceAlerts'
import type { AlertFiring, PriceAlert } from '@/domain/priceAlerts'
import { hasCoords } from '@/data/referentiel'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import type { PriceReading } from '@/state/appState'
import { useUserData } from '@/state/userData'

/** Fréquence de réveil de la boucle. La cadence réelle est celle de `isDue`. */
const TICK_MS = 5 * 60_000

/** Nuits entre deux dates ISO — sert au prix par personne. */
function nightsBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`)
  const b = Date.parse(`${to}T12:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 1
  return Math.max(1, Math.round((b - a) / 86_400_000))
}

export function usePriceRefresh(): void {
  const { state, domains, history, recordReadings } = useApp()
  const { alerts, putAlerts } = useUserData()
  const { t } = useI18n()

  // Le tour lit l'état au moment où il s'exécute : des refs plutôt que des
  // dépendances, sinon chaque suivi ajouté relancerait l'intervalle et le tour
  // ne partirait jamais.
  const trackedRef = useRef(state.tracked)
  const domainsRef = useRef(domains)
  const alertsRef = useRef(alerts)
  const historyRef = useRef(history)
  const running = useRef(false)
  trackedRef.current = state.tracked
  domainsRef.current = domains
  alertsRef.current = alerts
  historyRef.current = history

  const runOnce = useCallback(async (): Promise<void> => {
    if (running.current) return
    const tracked = trackedRef.current
    if (tracked.length === 0) return

    running.current = true
    try {
      const now = Date.now()
      const groups = groupForRefresh(tracked, historyRef.current, now)
      if (groups.length === 0) return

      const collected: Record<string, PriceReading> = {}

      for (const group of groups) {
        const domain = domainsRef.current.find((d) => d.id === group.domainId)
        try {
          const { lodgings } = await runProviderSearch({
            domainId: group.domainId,
            domainName: domain?.name ?? group.domainName,
            lat: domain && hasCoords(domain) ? domain.lat : undefined,
            lon: domain && hasCoords(domain) ? domain.lon : undefined,
            checkIn: group.checkIn,
            checkOut: group.checkOut,
            adults: group.adults,
            children: group.children,
            nights: nightsBetween(group.checkIn, group.checkOut),
            existing: []
          })
          Object.assign(collected, readingsForGroup(group, lodgings, Date.now()))
        } catch {
          // Source injoignable : ce lot n'a pas de point pour ce tour. Le
          // prochain réessaiera. Aucune valeur n'est reconduite.
        }
      }

      if (Object.keys(collected).length === 0) return
      recordReadings(collected)

      // --- Alertes ---------------------------------------------------------
      const fired: AlertFiring[] = []
      const nextAlerts: PriceAlert[] = []
      let changed = false

      for (const alert of alertsRef.current) {
        const reading = collected[alert.trackedKey]
        if (!reading) {
          nextAlerts.push(alert)
          continue
        }
        const item = tracked.find((i) => i.key === alert.trackedKey)
        const nights = item?.checkIn && item.checkOut ? nightsBetween(item.checkIn, item.checkOut) : 1
        const value = valueFor(
          alert.mode,
          reading.v,
          item ? perPersonOf(item, reading.v, nights) : reading.v
        )
        const outcome = evaluateAlert(alert, { value, origin: 'measured', at: reading.t })
        nextAlerts.push(outcome.alert)
        if (outcome.alert !== alert) changed = true
        if (outcome.fired) fired.push(outcome.fired)
      }

      if (changed) await putAlerts(nextAlerts)

      for (const firing of fired) {
        const item = tracked.find((i) => i.key === firing.trackedKey)
        const title = t('alert_fired_title')
        const body = t('alert_fired_body')
          .replace('{n}', item?.name ?? firing.trackedKey)
          .replace('{v}', String(firing.value))
          .replace('{s}', String(firing.threshold))
        try {
          await window.skitrack.notify({ title, body })
        } catch {
          // Notification refusée par le système : l'alerte reste marquée
          // déclenchée et visible dans l'écran de suivi. Renotifier au tour
          // suivant serait pire que de se taire.
        }
      }
    } finally {
      running.current = false
    }
  }, [recordReadings, putAlerts, t])

  useEffect(() => {
    // Un premier tour peu après l'ouverture : la cadence horaire de `isDue`
    // fait le tri, mais ouvrir l'application le lendemain doit relever tout de
    // suite plutôt qu'au bout de cinq minutes.
    const kick = window.setTimeout(() => void runOnce(), 8_000)
    const timer = window.setInterval(() => void runOnce(), TICK_MS)
    return () => {
      window.clearTimeout(kick)
      window.clearInterval(timer)
    }
  }, [runOnce])
}
