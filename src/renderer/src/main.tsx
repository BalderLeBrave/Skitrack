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
// IBM Plex Mono ne sert qu'aux valeurs RELEVÉES : altitudes, forfaits, hauteurs
// de neige, prix de centrale. C'est la règle centrale des jetons Cairn, et elle
// ne tient que si la chasse fixe reste réservée à ce rôle. Trois poids, ceux
// qu'appellent `--gras-donnee` et ses voisins.
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import { App } from './App'
// Cairn passe AVANT `styles.css` : il pose les rôles, et son pont de
// compatibilité en fin de fichier réexpose les anciens noms (--bg, --panel,
// --muted…) que toute la feuille suivante consomme encore.
import './styles/cairn.css'
import './styles.css'
import './styles/result-cards.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
