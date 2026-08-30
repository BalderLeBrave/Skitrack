/**
 * Relevé des positions d'annonces qui n'en ont pas.
 *
 * ## Le défaut que ce crochet corrige
 *
 * Le relevé Booking ne rapportait pas de coordonnées : l'extracteur ne lisait
 * pas là où la page de **résultats** les publie. Ces annonces étaient donc
 * dispersées autour de la station par `lodgingCoords`, et l'épingle avait la
 * même tête qu'une position mesurée.
 *
 * Depuis, l'extracteur lit le magasin Apollo de la page de résultats et les
 * relevés neufs rapportent les positions. Restent les annonces relevées
 * **avant** ce correctif : elles n'ont pas de position, et seul un relevé
 * refait leur en donne une.
 *
 * ## Ce que le crochet fait, et d'où vient la donnée
 *
 * Le lecteur de pages existe déjà : `src/main/listing.ts`, celui de l'import
 * par URL. On l'appelle, annonce par annonce, **à la demande de
 * l'utilisateur** — jamais en fond.
 *
 * ## Correction du 2026-08-30 — ce que cet en-tête affirmait de faux
 *
 * Il disait : « Booking met un bloc JSON-LD avec `geo.latitude/longitude` sur
 * chaque fiche d'hôtel ». Mesuré sur une fiche réelle : le JSON-LD de Booking
 * ne porte **aucun** `geo`. Les coordonnées y sont ailleurs — attribut
 * `data-atlas-latlng`, variables `b_map_center_*` — et `listing.ts` sait
 * maintenant les lire (`readCoords`).
 *
 * Mais cela ne change rien pour Booking : son hôte figure sur la liste de
 * `shared/listingHosts.ts`, et `listing.ts` le refuse **avant d'émettre la
 * moindre requête**. Le crochet ne doit donc jamais recevoir d'annonce venant
 * d'un hôte de cette liste — l'écran les écarte du lot en amont, et dit à leur
 * sujet ce qui marche réellement : un relevé refait.
 *
 * Une page qui refuse ou ne publie rien est comptée et dite ; on n'écrit
 * jamais une position de repli. Les annonces positionnées passent ensuite par
 * l'enrichissement d'accès aux pistes, comme n'importe quel import.
 */

import { useCallback, useRef, useState } from 'react'
import type { Lodging } from '@/data/lodgings'
import { enrichWithAccess } from '@/data/lodgingAccess'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'

/** Pages lues par passe : le lecteur est séquentiel et les sites sont lents.
 *  Relancer la commande continue là où la passe précédente s'est arrêtée. */
const PAGES_PAR_PASSE = 15

export interface GeoResolve {
  busy: boolean
  /** Avancement lisible pendant la passe, compte rendu après. */
  message: string | null
  resoudre: (candidats: Lodging[], engineDomainId: number | undefined) => Promise<void>
}

export function useGeoResolve(): GeoResolve {
  const { t } = useI18n()
  const { state, patch } = useApp()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // `state.imported` est relu au moment de l'écriture, pas capturé : la passe
  // dure plusieurs secondes et un relevé peut aboutir entre-temps.
  const importedRef = useRef(state.imported)
  importedRef.current = state.imported

  const resoudre = useCallback(
    async (candidats: Lodging[], engineDomainId: number | undefined): Promise<void> => {
      const lot = candidats.filter((lg) => lg.url && (lg.lat == null || lg.lon == null)).slice(0, PAGES_PAR_PASSE)
      if (lot.length === 0) return
      setBusy(true)
      setMessage(null)

      let ok = 0
      let muets = 0
      let refus = 0
      const positions = new Map<number, { lat: number; lon: number }>()

      for (let i = 0; i < lot.length; i++) {
        setMessage(t('geo_resolve_busy').replace('{i}', String(i + 1)).replace('{n}', String(lot.length)))
        try {
          const extrait = await window.skitrack.fetchListing(lot[i].url as string)
          if (extrait.blockedReason) {
            refus++
          } else if (extrait.lat != null && extrait.lon != null) {
            positions.set(lot[i].id, { lat: extrait.lat, lon: extrait.lon })
            ok++
          } else {
            muets++
          }
        } catch {
          muets++
        }
      }

      let suivants = importedRef.current.map((lg) => {
        const pos = positions.get(lg.id)
        // La fiche publie sa position exacte — c'est tout l'intérêt d'aller la
        // lire — et l'épingle quitte le régime dispersé.
        return pos ? { ...lg, lat: pos.lat, lon: pos.lon, locPrecision: 'exact' as const } : lg
      })

      // Position acquise → distance aux pistes calculable. L'enrichissement est
      // un bonus, jamais un prérequis : son échec laisse les positions posées.
      if (ok > 0) {
        try {
          const positionnes = suivants.filter((lg) => positions.has(lg.id))
          const { lodgings: enrichis } = await enrichWithAccess(positionnes, engineDomainId)
          const parId = new Map(enrichis.map((lg) => [lg.id, lg]))
          suivants = suivants.map((lg) => parId.get(lg.id) ?? lg)
        } catch {
          /* moteur local absent : les positions restent, l'accès attendra */
        }
      }

      patch({ imported: suivants })
      setMessage(
        t('geo_resolve_done')
          .replace('{ok}', String(ok))
          .replace('{mute}', String(muets))
          .replace('{refus}', String(refus))
      )
      setBusy(false)
    },
    [patch, t]
  )

  return { busy, message, resoudre }
}
