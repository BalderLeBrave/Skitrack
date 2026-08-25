/**
 * Partage de séjour : export, et import **prévisualisé**.
 *
 * Trois chemins d'entrée — un fichier `.skitrip` ouvert à la main, un lien
 * `skitrack://` cliqué dans une messagerie, un lien collé — et un seul point
 * d'arrivée : `pending`. Rien n'est appliqué tant que la prévisualisation n'a
 * pas été confirmée.
 *
 * **Pourquoi jamais d'application silencieuse.** Un séjour reçu remplace la
 * station, les dates, le groupe et le budget de la recherche en cours. Le faire
 * sans montrer quoi ferait disparaître, sur un simple clic dans un message,
 * une comparaison en cours. Et un lien vient d'un tiers : ce qui vient d'un
 * tiers se regarde avant d'être appliqué.
 *
 * Le décodage et la validation sont dans `domain/tripCodec`, qui repasse par le
 * validateur du stockage local. Ce module n'ajoute aucun contrôle : il en
 * ajouterait un quatrième qui finirait par diverger des trois autres.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  decodeTripFile,
  decodeTripLink,
  isLinkTooLong,
  tripFileContent,
  tripFileName,
  tripLink
} from '@/domain/tripCodec'
import type { SavedTrip } from '@/store/userData'

/** Ce qu'un partage vient de produire, pour l'accusé de réception. */
export type ShareOutcome =
  | { kind: 'copied' }
  | { kind: 'exported' }
  | { kind: 'canceled' }
  | { kind: 'error'; message: string }

export interface TripShareValue {
  /** Séjour reçu, en attente de confirmation. */
  pending: SavedTrip | null
  /** Renseigné quand un import a échoué — payload illisible ou refusé. */
  importError: string | null
  /** Copie le lien du séjour ; bascule sur le fichier s'il est trop long. */
  shareTrip: (trip: SavedTrip) => Promise<ShareOutcome>
  /** Exporte explicitement en fichier `.skitrip`. */
  exportTrip: (trip: SavedTrip) => Promise<ShareOutcome>
  /** Ouvre un fichier de séjour et le met en prévisualisation. */
  importFromFile: () => Promise<void>
  /** Met un lien collé en prévisualisation. */
  importFromLink: (url: string) => void
  /** Referme la prévisualisation sans rien appliquer. */
  dismiss: () => void
}

const TripShareContext = createContext<TripShareValue | null>(null)

export function useTripShare(): TripShareValue {
  const ctx = useContext(TripShareContext)
  if (!ctx) throw new Error('useTripShare doit être utilisé dans TripShareProvider')
  return ctx
}

export function TripShareProvider({ children }: { children: ReactNode }): JSX.Element {
  const [pending, setPending] = useState<SavedTrip | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const present = useCallback((trip: SavedTrip | null, failure: string): void => {
    if (trip) {
      setImportError(null)
      setPending(trip)
    } else {
      setPending(null)
      setImportError(failure)
    }
  }, [])

  // Lien ouvert depuis le système. L'abonnement vit aussi longtemps que
  // l'application : un lien peut arriver à n'importe quel moment.
  useEffect(() => {
    const off = window.skitrack.trip.onOpened((url) => {
      present(decodeTripLink(url), 'link')
    })
    // Un lien peut être arrivé avant ce montage — application lancée *par* le
    // lien, ou `open-url` émis avant que la fenêtre n'existe. On vient donc le
    // chercher plutôt que d'attendre une poussée qui a déjà eu lieu.
    void window.skitrack.trip.pending().then((url) => {
      if (url) present(decodeTripLink(url), 'link')
    })
    return off
  }, [present])

  const exportTrip = useCallback(async (trip: SavedTrip): Promise<ShareOutcome> => {
    const result = await window.skitrack.trip.export(tripFileContent(trip), tripFileName(trip))
    if (result.saved) return { kind: 'exported' }
    if (result.canceled) return { kind: 'canceled' }
    return { kind: 'error', message: result.error ?? '' }
  }, [])

  const shareTrip = useCallback(
    async (trip: SavedTrip): Promise<ShareOutcome> => {
      const link = tripLink(trip)
      // Un lien trop long est coupé par les clients de messagerie, et un lien
      // coupé a l'air valide sans se décoder. Le fichier est alors le seul
      // partage honnête — on ne propose pas le lien « au cas où ».
      if (isLinkTooLong(link)) return exportTrip(trip)
      const ok = await window.skitrack.trip.copyLink(link)
      return ok ? { kind: 'copied' } : { kind: 'error', message: '' }
    },
    [exportTrip]
  )

  const importFromFile = useCallback(async (): Promise<void> => {
    const result = await window.skitrack.trip.import()
    if (result.canceled) return
    if (result.error || result.content == null) {
      present(null, result.error || 'file')
      return
    }
    present(decodeTripFile(result.content), 'file')
  }, [present])

  const importFromLink = useCallback(
    (url: string): void => {
      present(decodeTripLink(url), 'link')
    },
    [present]
  )

  const dismiss = useCallback((): void => {
    setPending(null)
    setImportError(null)
  }, [])

  const value = useMemo<TripShareValue>(
    () => ({ pending, importError, shareTrip, exportTrip, importFromFile, importFromLink, dismiss }),
    [pending, importError, shareTrip, exportTrip, importFromFile, importFromLink, dismiss]
  )

  return <TripShareContext.Provider value={value}>{children}</TripShareContext.Provider>
}
