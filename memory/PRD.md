# SKITRACK — Amélioration de l'interface

## Contexte
App Electron (renderer React + Vite, TypeScript ; sidecar Python FastAPI). Compare
domaines skiables et logements. Styles : CSS variables (jetons « Cairn » +
refonte « Airbnb »), pas de Tailwind. i18n maison (fr, en). Pas de MongoDB.

## Problème utilisateur
« Améliorer l'interface : choisir une station selon des critères, puis un
logement dans cette station. » Choix utilisateur :
- Améliorer les DEUX écrans (station + logement), visuel ET UX.
- Suivre la piste « refonte Airbnb » déjà amorcée.
- Point de douleur : **parcours confus**.
- Validation par prévisualisation navigateur.

## Prévisualisation navigateur (dev-only, hors build Electron)
- `vite.preview.config.ts` (root=src/renderer, entrée `preview.html`).
- `src/renderer/preview.html` + `src/renderer/src/dev-preview/{shim.ts,main.tsx}` :
  pont `window.skitrack` simulé (moteur « ready » factice), données embarquées.
- Ouvrir un écran directement via le hash : `#recherche`, `#logements`,
  `#logements/dark`, etc. (le shim pose `window.__DEMO_OVERRIDES__`).
- Build + serve : `vite build --config vite.preview.config.ts` puis
  `vite preview --config vite.preview.config.ts` (port 3000, exposé par l'ingress).
- Note : en mode dev pur, l'ingress renvoie 429 (rafale d'images station-*.jpg) →
  utiliser le build de prévisualisation.

## Implémenté (2026-06)
- **Fil du parcours (JourneyStepper)** : ruban collant sous la barre, sur les
  écrans de la tâche (recherche / logements / offres / combinaisons / décision).
  3 étapes explicites : 1 Station → 2 Logement → 3 Décision. État actif / franchi
  (coche) / à venir / verrouillé (étape Logement bloquée tant qu'aucune station
  ouverte). Rappelle le nom de la station choisie. Clics = mêmes `patch({tab})`
  que les onglets. Clair + sombre. Aucune logique métier modifiée.
  - `components/JourneyStepper.tsx`, `styles/journey.css`, clés i18n `journey_*`,
    monté dans `App.tsx` (Shell), importé dans `main.tsx`.

## Vérifié
- `tsc -p tsconfig.web.json` ✓ · `i18n:test` (733×2) ✓ · `i18n:scan --ci` (dette
  sous plafond) ✓ · Rendu visuel #recherche et #logements en clair et sombre ✓.
- NON exécuté ici : suite `npm run verify` complète (tests Node/Python du dépôt),
  ni testing_agent (stack Electron non standard).

## Backlog / prochaines étapes
- P1 : hiérarchiser les 2 CTA des cartes station (« Voir les logements » = action
  primaire du parcours, « Retenir » = secondaire) et harmoniser avec le fil.
- P1 : bandeau de contexte logement plus lisible (rappel station + dates + groupe).
- P2 : réorganiser la barre pour regrouper visuellement le parcours vs utilitaires.
- P2 : animation d'entrée douce du fil + coche à la validation d'une étape.
