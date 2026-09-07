/**
 * Racine de l'application recomposée : fournisseurs, amorçage du moteur
 * local, puis le routeur. Rien d'autre ne vit ici.
 */

import { useEffect, useMemo, useState } from 'react'
import { I18nContext, isLanguage, type Language } from '@/i18n'
import { useSidecar } from '@/hooks/useSidecar'
import { AppProvider, useApp } from '@/state/appState'
import { DerivedProvider } from '@/state/selectors'
import { WeatherProvider } from '@/state/weather'
import { AppRouter } from './router'
import { Boot } from './shell/Boot'
import { AppGuard } from './ui/AppGuard'

const BOOT_GRACE_MS = 2000

function I18nBridge({ children }: { children: React.ReactNode }): JSX.Element {
  const { state, patch } = useApp()
  const value = useMemo(
    () => ({
      lang: isLanguage(state.lang) ? state.lang : 'fr',
      setLang: (l: Language) => patch({ lang: l })
    }),
    [state.lang, patch]
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

function Gate(): JSX.Element {
  const { reloadDomains } = useApp()
  const { state: sidecar, log, restart } = useSidecar()
  const [skipped, setSkipped] = useState(false)

  useEffect(() => {
    if (sidecar.status === 'ready') reloadDomains()
  }, [sidecar.status, reloadDomains])

  // Le sidecar Python peut rester « starting » 30 s (ou jamais). Pendant ce
  // temps l'ancien écran masquait Continuer — l'app paraissait crashée.
  useEffect(() => {
    if (sidecar.status === 'ready' || skipped) return
    const t = window.setTimeout(() => setSkipped(true), BOOT_GRACE_MS)
    return () => window.clearTimeout(t)
  }, [sidecar.status, skipped])

  if (!skipped && sidecar.status !== 'ready') {
    return (
      <Boot
        message={
          sidecar.status === 'error'
            ? sidecar.message
            : 'Lecture des domaines, des forfaits et des tarifs.'
        }
        hint={
          sidecar.status === 'error'
            ? sidecar.hint
            : 'Vous pouvez continuer tout de suite : le référentiel est déjà dans l’application.'
        }
        isError={sidecar.status === 'error'}
        log={log}
        onRetry={restart}
        onSkip={() => setSkipped(true)}
      />
    )
  }
  return <AppRouter />
}

export function AppRoot(): JSX.Element {
  return (
    <AppGuard>
      <AppProvider>
        <DerivedProvider>
          <WeatherProvider>
            <I18nBridge>
              <Gate />
            </I18nBridge>
          </WeatherProvider>
        </DerivedProvider>
      </AppProvider>
    </AppGuard>
  )
}
