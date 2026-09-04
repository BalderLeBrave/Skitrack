interface Props {
  message: string
  hint?: string
  isError: boolean
  log: string[]
  onRetry: () => void
  onSkip: () => void
}

/** Écran d'amorçage : réservé aux problèmes de démarrage du moteur local. */
export function Boot({ message, hint, isError, log, onRetry, onSkip }: Props): JSX.Element {
  return (
    <div className="rc-boot" data-testid="boot-screen">
      <div className="rc-boot__panel">
        <h1>SKITRACK</h1>
        <h2>{isError ? 'Le moteur local ne démarre pas' : 'Démarrage du moteur local…'}</h2>
        <p>{message}</p>
        {hint && <p>{hint}</p>}
        {isError && (
          <div className="rc-boot__actions">
            <button type="button" className="rc-btn rc-btn--cta" onClick={onRetry} data-testid="boot-retry">
              Réessayer
            </button>
            <button type="button" className="rc-btn rc-btn--ghost" onClick={onSkip} data-testid="boot-skip">
              Continuer sans le moteur
            </button>
          </div>
        )}
        {log.length > 0 && (
          <details className="rc-boot__log">
            <summary>Journal</summary>
            <pre>{log.slice(-40).join('\n')}</pre>
          </details>
        )}
      </div>
    </div>
  )
}
