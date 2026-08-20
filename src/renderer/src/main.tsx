import React from 'react'
import ReactDOM from 'react-dom/client'
// Plus Jakarta Sans est empaquetée plutôt que tirée de Google Fonts : la CSP
// interdit toute origine distante, et l'application doit rester lisible hors
// ligne. La hiérarchie ne joue que sur la graisse — 400 pour le corps, 600/700
// pour les titres, 800 pour les prix — d'où les cinq poids et aucune italique.
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'
import { App } from './App'
import './styles.css'
import './styles/result-cards.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
