import { useEffect, useState } from 'react'
import type { SidecarState } from '@shared/ipc-contract'
import { configureClient } from '@/api/client'

const INFO_TIMEOUT_MS = 8000

/**
 * Suit l'état du sidecar et configure le client HTTP dès qu'il est prêt.
 *
 * Sans `window.skitrack` (preload manquant, aperçu navigateur, pont cassé)
 * on n'appelle pas `.sidecar` — c'était un TypeError au premier rendu,
 * fenêtre blanche / crash au lancement.
 */
export function useSidecar(): { state: SidecarState; log: string[]; restart: () => void } {
  const [state, setState] = useState<SidecarState>({ status: 'starting' })
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    let mounted = true
    const api = typeof window !== 'undefined' ? window.skitrack : undefined
    if (!api?.sidecar) {
      setState({
        status: 'error',
        message: 'Le pont avec l’application n’est pas disponible.',
        hint: 'Relancez Skitrack depuis son raccourci. Vous pouvez passer outre pour voir l’accueil.'
      })
      setLog(['Pont Electron absent — preload non injecté.'])
      return
    }

    const info = Promise.race([
      api.sidecar.info(),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('Le moteur local met trop de temps à répondre.')), INFO_TIMEOUT_MS)
      })
    ])

    void info
      .then((payload) => {
        if (!mounted) return
        setState(payload.state)
        setLog(payload.log)
        if (payload.state.status === 'ready') configureClient(payload.state.baseUrl, payload.state.token)
      })
      .catch((err: unknown) => {
        if (!mounted) return
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Moteur local injoignable.',
          hint: 'Vous pouvez passer outre : l’accueil et le référentiel restent lisibles.'
        })
      })

    const offState = api.sidecar.onState((next) => {
      setState(next)
      if (next.status === 'ready') configureClient(next.baseUrl, next.token)
    })
    const offLog = api.sidecar.onLog((line) => {
      setLog((prev) => [...prev.slice(-199), line])
    })

    return () => {
      mounted = false
      offState()
      offLog()
    }
  }, [])

  const restart = (): void => {
    const api = typeof window !== 'undefined' ? window.skitrack : undefined
    if (!api?.sidecar) {
      setState({
        status: 'error',
        message: 'Le pont avec l’application n’est pas disponible.',
        hint: 'Relancez Skitrack depuis son raccourci.'
      })
      return
    }
    setState({ status: 'starting' })
    void api.sidecar.restart().then((next) => {
      setState(next)
      if (next.status === 'ready') configureClient(next.baseUrl, next.token)
    }).catch((err: unknown) => {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Redémarrage impossible.'
      })
    })
  }

  return { state, log, restart }
}
