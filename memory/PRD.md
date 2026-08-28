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

## Implémenté (2026-06-28)
- **Aperçu navigateur réparé** : `frontend/package.json` lance désormais
  `vite --config /app/vite.preview.config.ts` (mode dev, hot reload) et le config
  ajoute un middleware qui réécrit `/` → `/preview.html` (le panneau d'aperçu
  charge la racine, qui renvoyait 404 → page blanche).
- **Hiérarchie des CTA cartes station** (`DomainCard.tsx`, `styles.css`) :
  « Voir les logements » = pilule d'accent pleine (`.domcard__cta`, lift au
  survol) ; « Retenir » = `.domcard__save` sans cadre, marque-page + libellé
  atténué, plein et accentué quand la station est retenue.
  `data-testid` : `domcard-see-lodgings-{id}`, `domcard-save-{id}`.
- **En-tête de contexte Logements** (`LodgingsPage.tsx`, `.lodgctx*`) : lien de
  retour, œillard « LOGEMENTS À » + nom de station en titre, jetons Séjour
  (dates + nuits) / Groupe (voyageurs + chambres) / Altitude, coût du séjour à
  droite. Clés i18n `lodg_ctx_eyebrow|dates|group`.
  `data-testid` : `lodgings-context-header`, `lodgings-station-name`,
  `lodgings-context-chips`, `lodgings-back-to-domains`.
- **Barre de navigation épurée** (`App.tsx`, `.nav__journey`, `.nav__utils`) :
  Stations › Logements › segment (Offres/Combinaisons/Décision) réunis dans un
  cadre tenu ; Favoris/Suivi/Réglages/langue/voyageurs/thème isolés par un filet.
- **Animations d'étapes** (`journey.css`, `styles.css`) : tracé de la coche +
  dilatation de la pastille + anneau d'accent à la validation, remplissage
  gauche→droite du trait de liaison, montée courte de l'écran (`.main--enter`,
  `key={screen}`). Tout coupé sous `prefers-reduced-motion`.

## Vérifié
- `tsc -p tsconfig.web.json` ✓ · `i18n:test` (733×2) ✓ · `i18n:scan --ci` (dette
  sous plafond) ✓ · Rendu visuel #recherche et #logements en clair et sombre ✓.
- NON exécuté ici : suite `npm run verify` complète (tests Node/Python du dépôt),
  ni testing_agent (stack Electron non standard).

## Backlog / prochaines étapes
- P1 : vignette de logement (`LodgingCard`) — même hiérarchie de CTA que les
  cartes station (« Retenir ce logement » primaire vs actions secondaires).
- P1 : barre de résumé collante en bas de l'écran Logements (station + total +
  « Comparer ») pour boucler l'étape 3.
- P2 : version étroite (<900 px) de la barre : parcours en menu déroulant.
- P2 : carte du domaine absente en prévisualisation (MapLibre non chargé dans le
  shim) — vérifier dans l'app Electron.
