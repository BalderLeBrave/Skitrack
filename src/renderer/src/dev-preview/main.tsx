import './shim'
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/playfair-display/400.css'
import '@fontsource/playfair-display/500.css'
import '../app/theme.css'
import '../styles.css'
import '../app/app.css'
import { AppRoot } from '../app/AppRoot'

const show = (label: string, e: unknown): void => {
  const root = document.getElementById('root')
  const msg = e instanceof Error ? e.stack || e.message : String(e)
  if (root)
    root.innerHTML =
      '<pre style="padding:24px;font:13px monospace;color:#b00;white-space:pre-wrap">' +
      label +
      '\n\n' +
      msg +
      '</pre>'
}

window.addEventListener('error', (ev) => show('WINDOW ERROR', ev.error ?? ev.message))
window.addEventListener('unhandledrejection', (ev) => show('UNHANDLED REJECTION', ev.reason))

class Boundary extends React.Component<{ children: React.ReactNode }, { err: unknown }> {
  state = { err: null as unknown }
  static getDerivedStateFromError(err: unknown) {
    return { err }
  }
  render() {
    if (this.state.err) {
      const e = this.state.err
      return React.createElement(
        'pre',
        { style: { padding: 24, font: '13px monospace', color: '#b00', whiteSpace: 'pre-wrap' } },
        'RENDER ERROR\n\n' + (e instanceof Error ? e.stack || e.message : String(e))
      )
    }
    return this.props.children as React.ReactElement
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  React.createElement(Boundary, null, React.createElement(AppRoot))
)
