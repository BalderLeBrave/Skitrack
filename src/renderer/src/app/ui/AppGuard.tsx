import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Dernier filet : une exception React au premier rendu ne doit pas
 * laisser une fenêtre blanche (crash au lancement).
 */
export class AppGuard extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }

  static getDerivedStateFromError(err: Error): { err: Error } {
    return { err }
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    console.error('[skitrack] crash interface', err.message, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.err) return this.props.children
    return (
      <div className="rc-boot" data-testid="app-guard">
        <div className="rc-boot__panel">
          <h1>SKITRACK</h1>
          <h2>L’interface a rencontré une erreur</h2>
          <p>{this.state.err.message || 'Erreur inattendue au démarrage.'}</p>
          <p>L’accueil peut tout de même s’ouvrir. Le moteur local n’est pas requis pour feuilleter les stations.</p>
          <div className="rc-boot__actions">
            <button
              type="button"
              className="rc-btn rc-btn--cta"
              onClick={() => this.setState({ err: null })}
              data-testid="app-guard-retry"
            >
              Réessayer
            </button>
          </div>
        </div>
      </div>
    )
  }
}
