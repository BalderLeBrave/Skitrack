/**
 * Sources de logement annoncées avant le premier relevé.
 *
 * Le moteur sait dès son montage quels connecteurs sont enregistrés, donc
 * lesquels seront interrogés. Cette information n'a pas à attendre une
 * recherche, et elle n'a pas à attendre l'écran Logements : l'accueil affiche
 * un compteur « Sources de logement » qui annonçait **une** source — Airbnb, la
 * seule nommée hors moteur — tant que l'écran Logements n'avait pas été ouvert
 * une fois. Un chiffre faux sur l'écran d'entrée, corrigé plus loin dans
 * l'application, est pire qu'un chiffre absent.
 *
 * Le registre est donc lu une fois pour toute l'application, au montage de la
 * coque. Après un relevé, `runProviderSearch` réécrit la même liste depuis ses
 * `outcomes` : les deux disent la même chose, le registre la dit tout de suite.
 *
 * Les sources déclarées mais refusées sont écartées : elles ne seront pas
 * interrogées, et une ligne qu'aucun relevé ne peut rafraîchir n'est pas une
 * source.
 */

import { useEffect } from 'react'
import { sourceLabelOf } from '@/data/runProviderSearch'
import { useApp } from '@/state/appState'

export function useProviderRegistry(): void {
  const { patch } = useApp()
  useEffect(() => {
    let cancelled = false
    void window.skitrack?.providers
      ?.health?.()
      .then((list) => {
        if (cancelled) return
        const labels = [...new Set(list.filter((p) => p.registered).map((p) => sourceLabelOf(p.name)))]
        if (labels.length > 0) patch({ lodgQueried: labels })
      })
      .catch(() => {
        // Moteur injoignable : la liste reste celle du dernier relevé, ou le
        // seul socle hors moteur. Rien n'est inventé pour combler le trou.
      })
    return () => {
      cancelled = true
    }
  }, [patch])
}
