import React from 'react'
import ReactDOM from 'react-dom/client'
// Archivo est empaquetée plutôt que tirée de Google Fonts : la CSP interdit
// toute origine distante, et l'application doit rester lisible hors ligne.
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/500.css'
import '@fontsource/archivo/600.css'
import '@fontsource/archivo/800.css'
import { App } from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
