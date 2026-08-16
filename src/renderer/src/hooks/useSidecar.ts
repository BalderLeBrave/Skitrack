import { useEffect, useState } from 'react'
import type { SidecarState } from '@shared/ipc-contract'
import { configureClient } from '@/api/client'

/**
 * Suit l'état du sidecar et configure le client HTTP dès qu'il est prêt.
 *
 * Le composant racine n'affiche l'application qu'après `ready` : sans cela,
 * chaque écran devrait gérer un cas « pas encore de moteur », ce qui ferait
 * fuiter un détail d'implémentation dans toute l'UI.
 */
export function useSidecar(): { state: SidecarState; log: string[]; restart: () => void } {
  const [state, setState] = useState<SidecarState>({ status: 'starting' })
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    let mounted = true

    void window.skitrack.sidecar.info().then((info) => {
      if (!mounted) return
      setState(info.state)
      setLog(info.log)
      if (info.state.status === 'ready') configureClient(info.state.baseUrl, info.state.token)
    })

    const offState = window.skitrack.sidecar.onState((next) => {
      setState(next)
      if (next.status === 'ready') configureClient(next.baseUrl, next.token)
    })
    const offLog = window.skitrack.sidecar.onLog((line) => {
      setLog((prev) => [...prev.slice(-199), line])
    })

    return () => {
      mounted = false
      offState()
      offLog()
    }
  }, [])

  const restart = (): void => {
    setState({ status: 'starting' })
    void window.skitrack.sidecar.restart().then((next) => {
      setState(next)
      if (next.status === 'ready') configureClient(next.baseUrl, next.token)
    })
  }

  return { state, log, restart }
}
