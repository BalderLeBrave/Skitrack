/**
 * Revérification des prix Airbnb en un bouton.
 *
 * ## Le problème que ça résout
 *
 * Les prix Airbnb ne valent que pour les dates auxquelles ils ont été relevés.
 * Changer les dates de séjour les périme tous, et l'application ne peut pas
 * aller chercher les nouveaux toute seule : Airbnb n'expose aucune interface
 * pour cela et interdit l'accès automatisé. Le relevé passe donc forcément par
 * un geste humain — mais rien n'oblige à ce que ce geste soit pénible.
 *
 * ## Ce que le bouton automatise réellement
 *
 * 1. Ouvre la recherche Airbnb **déjà réglée sur les nouvelles dates**.
 * 2. Se met à surveiller le presse-papiers.
 * 3. Dès que la fenêtre reprend le focus (l'utilisateur revient après avoir
 *    cliqué le marque-page), lit le presse-papiers, reconnaît le collage, et
 *    **importe tout seul** : prix actualisés, nouvelles annonces ajoutées,
 *    aucun doublon.
 *
 * Il ne reste donc qu'un seul geste manuel : le clic sur le marque-page, dans
 * la page Airbnb. C'est ce clic qui fait toute la différence juridique — c'est
 * l'utilisateur qui consulte sa page, l'application n'émet aucune requête vers
 * Airbnb. On ne peut pas le supprimer sans devenir ce qu'on refuse d'être.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseAirbnbClipboard } from './airbnbClip'
import { mergeAirbnbPaste } from './airbnbMerge'
import { enrichWithAccess } from './lodgingAccess'
import type { Lodging } from './lodgings'

/** Combien de temps on guette le retour de l'utilisateur avant d'abandonner. */
const WATCH_TIMEOUT_MS = 5 * 60 * 1000

export interface RecheckState {
  /** En attente du collage (l'utilisateur est parti sur Airbnb). */
  waiting: boolean
  /** Dernier message à afficher : succès, rien de neuf, ou échec. */
  message: string | null
}

export interface RecheckParams {
  imported: Lodging[]
  domainId: number
  domainName: string
  checkIn: string
  checkOut: string
  capacity: number
  nights: number
  fallbackAltitude: number
  /** URL de recherche Airbnb pré-remplie aux dates courantes. */
  searchUrl: string | null
  /** Applique la nouvelle liste de logements. */
  onImported: (lodgings: Lodging[]) => void
}

export function useAirbnbRecheck(params: RecheckParams): {
  state: RecheckState
  start: () => void
  cancel: () => void
} {
  const [state, setState] = useState<RecheckState>({ waiting: false, message: null })
  // Les paramètres changent à chaque rendu ; on les garde dans une ref pour que
  // le gestionnaire de focus lise toujours les valeurs à jour sans se réabonner.
  const latest = useRef(params)
  latest.current = params

  /** Empreinte du presse-papiers déjà traité, pour ne pas réimporter en boucle. */
  const consumed = useRef<string>('')
  const deadline = useRef<number>(0)

  const ingest = useCallback(async (raw?: string): Promise<void> => {
    const p = latest.current
    let text = raw ?? ''
    if (!text) {
      try {
        text = await window.skitrack.readClipboard()
      } catch {
        return
      }
    }
    if (!text || text === consumed.current) return
    // On ne touche au presse-papiers que s'il contient vraiment un collage
    // SKITRACK : l'utilisateur peut très bien avoir copié autre chose entre-temps.
    if (!text.includes('"source"') || !text.includes('airbnb')) return

    const { listings, errors } = parseAirbnbClipboard(text)
    if (listings.length === 0) {
      setState({ waiting: false, message: errors[0] ?? 'Collage Airbnb illisible.' })
      return
    }

    consumed.current = text
    const { imported, added, updated, missing } = mergeAirbnbPaste(p.imported, listings, {
      checkIn: p.checkIn,
      checkOut: p.checkOut,
      domainId: p.domainId,
      capacity: p.capacity,
      nights: p.nights,
      fallbackAltitude: p.fallbackAltitude
    })

    if (added.length === 0 && updated === 0) {
      setState({ waiting: false, message: 'Aucun changement : ces annonces sont déjà à jour.' })
      // La liste porte tout de même les marques d'absence posées par la fusion.
      if (missing > 0) p.onImported(imported)
      return
    }

    // Les nouvelles annonces reçoivent leurs distances aux pistes ; les
    // anciennes gardent celles déjà calculées.
    let finalList = imported
    if (added.length > 0) {
      const { lodgings: enriched } = await enrichWithAccess(added, p.domainId)
      const byId = new Map(enriched.map((l) => [l.id, l]))
      finalList = imported.map((l) => byId.get(l.id) ?? l)
    }

    p.onImported(finalList)
    setState({
      waiting: false,
      message:
        `${updated} prix actualisé(s)` +
        (added.length > 0 ? `, ${added.length} nouvelle(s) annonce(s)` : '') +
        '.'
    })
  }, [])

  // Réception directe : le marque-page a déposé son relevé dans l'application
  // sans passer par le presse-papiers. On l'écoute en permanence — pas seulement
  // pendant une revérification — pour que le simple fait de cliquer le
  // marque-page mette la liste à jour, où qu'on en soit.
  useEffect(() => {
    const off = window.skitrack.onAirbnbPaste((payload) => {
      setState({ waiting: false, message: 'Relevé reçu, mise à jour…' })
      void ingest(payload)
    })
    return off
  }, [ingest])

  // Surveillance : on relit le presse-papiers quand la fenêtre reprend le focus.
  // C'est le moment exact où l'utilisateur revient d'Airbnb, et ça évite de
  // sonder le presse-papiers en continu — ce qui serait intrusif.
  useEffect(() => {
    if (!state.waiting) return
    const onFocus = (): void => {
      if (Date.now() > deadline.current) {
        setState({ waiting: false, message: null })
        return
      }
      void ingest()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [state.waiting, ingest])

  const start = useCallback((): void => {
    const p = latest.current
    if (p.searchUrl) void window.skitrack.openExternal(p.searchUrl)
    consumed.current = ''
    deadline.current = Date.now() + WATCH_TIMEOUT_MS
    setState({ waiting: true, message: null })
  }, [])

  const cancel = useCallback((): void => setState({ waiting: false, message: null }), [])

  return { state, start, cancel }
}
