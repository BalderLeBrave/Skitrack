import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * La scène 3D (R3F / WebGL) ne doit jamais emporter l'accueil.
 * Un contexte GPU perdu ou un NaN Three.js = fond photo, pas un crash.
 */
export class SceneGuard extends Component<{ children: ReactNode; fallback?: ReactNode }, { dead: boolean }> {
  state = { dead: false }

  static getDerivedStateFromError(): { dead: boolean } {
    return { dead: true }
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    console.warn('[skitrack] scène 3D arrêtée', err.message, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.dead) return this.props.fallback ?? null
    return this.props.children
  }
}