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

## Implémenté (2026-06-28, suite)
- **Vignette de logement — hiérarchie des gestes** (`LodgingCard.tsx`,
  `.lodgcard__cta`) : « Retenir ce logement » = pilule d'accent pleine largeur
  (l'action qui clôt l'étape 2) ; « Ouvrir sur <source> » redescend en pilule
  discrète avec Suivre / Comparer.
  `data-testid` : `lodgcard-keep-{id}`, `lodgcard-open-{id}`.
- **Bandeau de séjour** (`components/StayBar.tsx`, `.staybar`) : pied de l'écran
  Logements — logement retenu (ou le moins cher, annoncé comme tel), total
  `sejourCost` avec détail logement/forfaits/route, « Partager le récap » et
  « Comparer & trancher → » (va sur Offres).
  `data-testid` : `stay-bar`, `stay-bar-lodging`, `stay-bar-total`,
  `stay-bar-share`, `stay-bar-compare`.
- **Récapitulatif partageable** (`components/StaySummary.tsx`, monté dans
  `App.tsx` via `state.staySummaryOpen`) : texte brut (station, dates, groupe,
  logement + lien, détail des coûts, total et par personne), copie presse-papier
  et envoi par e-mail (`mailto:` via `openExternal`). Échap ferme.
  `data-testid` : `stay-summary`, `stay-summary-text`, `stay-summary-copy`,
  `stay-summary-mail`, `stay-summary-close`.
- **Parcours replié sous 1180 px** (`App.tsx`, `.nav__jump`) : les six pilules
  deviennent un menu déroulant « 1 · Stations / 2 · Logements / 3 · … ».
  `data-testid` : `nav-journey-select`.
- **Correction** : le coût de l'en-tête Logements lisait `state.lodgSelId`, que
  rien n'écrit — il lit désormais `state.selLodgings[domaine]`, le logement
  réellement retenu.
- **Prévisualisation** : `dev-preview/shim.ts` injecte 3 annonces factices sur
  `#logements` (tarifées pour les dates par défaut), sinon l'écran n'a rien à
  mettre en page hors Electron.

## Correctifs d'alignement (2026-06-28)
Signalement : « tous les textes ne sont pas forcément alignés ». Règle retenue
avec l'utilisateur : cartes de même hauteur, prix et boutons sur une même
ligne, libellés longs **tronqués** (ellipse) au lieu de passer à la ligne.
- `styles/result-cards.css` : `.resultgrid { align-items: stretch }` (au lieu de
  `start`) + `.resultgrid > * { height: 100% }`.
- `styles.css` : `.results__grid` idem ; `.lodgcard__body` en colonne flex ;
  nouveau `.lodgcard__foot` (CTA + pilules) avec `margin-top: auto` ;
  `.lodgcard__sub` sur une ligne tronquée (`title` porte le texte complet) ;
  `.actpill` tronquée, `.actpill--open` sur sa propre rangée pleine largeur ;
  `.domcard__col` colonne flex + `.domcard__footer { margin-top: auto }`.
- `.offerrow` : colonnes de largeur **fixe** `100px 1fr 56px 132px` — en `auto`,
  chaque rangée se dimensionnait sur son propre contenu, donc le nom et le prix
  se décalaient d'une rangée à l'autre. `.offerrow__meta` sur une ligne.
- `.lodgcard__badge--src` : encre fixe `#12181f` — le fond blanc est tenu dans
  les deux thèmes, mais `var(--text)` devenait clair en sombre et le nom de la
  source disparaissait (relevé par le testing agent).
- Aperçu navigateur : retour au **build + `vite preview`** via
  `scripts/preview-serve.sh` (build initial, `--watch`, puis serveur). En mode
  dev, les ~330 photos chargées par `import.meta.glob({ eager: true })` faisaient
  une requête chacune et l'ingress répondait 429 → page blanche intermittente.

## Vérifié
- `tsc -p tsconfig.web.json` ✓ · `i18n:test` (733×2) ✓ · `i18n:scan --ci` (dette
  sous plafond) ✓ · Rendu visuel #recherche et #logements en clair et sombre ✓.
- NON exécuté ici : suite `npm run verify` complète (tests Node/Python du dépôt),
  ni testing_agent (stack Electron non standard).

## Backlog / prochaines étapes
- P1 : l'écran Décision pourrait rappeler le logement retenu et rouvrir le
  récapitulatif partageable (aujourd'hui accessible du seul bandeau Logements).
- P2 : version étroite de l'écran Logements — la carte occupe encore la moitié.
- P2 : carte du domaine absente en prévisualisation (MapLibre non chargé dans le
  shim) — vérifier dans l'app Electron.

## Passe « 21st-inspired » (2026-06, brief Fable 5.1) — Phase A/B/C
Décisions utilisateur : (1) jetons du brief — CTA corail #FF5A3C, fond #F7FBFE,
glacier #E8F3FA, texte #0B1F33 ; (2) E2 = panneau « Comparer » sur l'écran
Stations (cases sur les cartes → tableau) ; (3) E5 = écran « Demande de
réservation » (récap + formulaire court → récap texte + deep link OTA, aucun
envoi serveur) ; (4) livrer E1 seul, valider, puis E2→E5.
- 21st.dev : CLI présent mais exige un login → blocs reconstruits
  « 21st-inspired, no registry ». Pas de Tailwind/shadcn ajouté.
- **Jetons** (`styles/cairn.css`) : rampe `--crn-corail-*` ; `--accent` = corail
  (CTA unique), nouveau rôle `--marque` = azur (données, états, liens, focus) ;
  pont `--brand/--brand-soft/--link` → marque. Sombre : corail-400. Rayon carte
  16px. Dans `styles.css`/`journey.css`/`result-cards.css`, les usages « état »
  de `--accent` (onglet actif, toggles, votes, calendrier, avatars, survols de
  carte…) sont passés à `--brand` ; seuls les CTA restent corail.
- **E1 Accueil** : `SearchBar.tsx` — segment Altitude remplacé par **Chambres**
  (`state.rooms`, 0 = Toutes, max 6) ; loupe → pilule corail « Rechercher »
  (`sb-go`, `sb-rooms-less/more/count`) ; pilule empilée sous 760 px. Mot géant
  en `background-clip: text` retiré (interdit par le brief). Nouveau
  `components/PopularStations.tsx` : 6 cartes = plus grands domaines du
  référentiel (un par forfait relié ; représentant = photo créditée puis
  village le plus haut), photo + crédit CC, neige **seulement** si relevé, km
  pistes, altitudes, case « Comparer » → `state.stationCompareIds` (persisté),
  lien « Comparer {n} stations → » vers `recherche` (tableau à venir en E2).
  Clic photo → fiche (`domFicheId`). `data-testid` : `home-popular`,
  `popcard-{id}`, `popcard-open-{id}`, `popcard-compare-{id}`,
  `popcard-snow-{id}`, `home-popular-compare-go`.
- Vérifié : tsc ✓, i18n:test (774×2) ✓, aperçu clair/sombre/390 px ✓.
- Rouge restant (Phase F) : `.map__btn--accent` « Afficher les zones de temps
  de trajet » est un 2ᵉ CTA corail sur l'écran Stations ; contraste blanc sur
  corail 3.1:1 (AA large seulement) ; nav utilitaire déborde sous 390 px.

## Recomposition — passe correctifs (2026-06, fork 3)
Demandes utilisateur : bug de navigation entre pages ; météo valable par
station ; belles photos par station ; « vraie » montagne 3D animée (neige,
remontées, skieurs, village, flocons) ; améliorer l'interface Logements.
- **Routeur** (`app/router.tsx`) : URL = seule source de vérité. `RouteStoreSync`
  sens unique (chemin → `state.tab`) ; `/stations` et `/reservation` mappés ;
  tous les `patch({ tab })` gelés remplacés par `useNavigate` (useShortcuts,
  Onboarding, SelectionPage, TrackingPage, SettingsPage, ReferentialPage).
- **Météo** (`state/weather.tsx`) : couvre `domFicheId` (posé par la fiche) et
  `lodgDomain` ; rejoue une liste arrivée pendant une requête ; lots de 10
  domaines (`BATCH_LOCATIONS = 20`). Fiche : bloc `station-hero-weather`.
- **Scène 3D** (`app/ui/MountainScene.tsx`) : relief ridged + 3 sommets + chaîne
  lointaine + vallée, couleurs par sommet, ombres, piste damée, village de 14
  chalets (fenêtres allumées, point light), 170 sapins instanciés, télésiège
  (7 pylônes, 2 câbles, 10 cabines animées), 16 skieurs instanciés, 1 400 flocons.
  Plus d'erreur NaN. Camera (0,20,84) → lookAt (0,3,-20).
- **Photos** : outils `tools/commons-candidates.py` (planche-contact Commons) et
  `tools/commons-fetch.py` (téléchargement 1600 px + crédit dans
  `data/stationPhotos.json`). Remplacées : avoriaz-1800, plagne-villages,
  serre-chevalier-le-monetier, combloux, saint-sorlin-d-arves, tignes-le-lac,
  alpe-d-huez-grand-domaine.
- **Logements** : `StationRibbon` (`lodgings-ribbon*`), repères calculés
  (`lodge-badges-{id}` : moins cher / plus près des pistes), vignette sans photo
  = photo station floutée + « Photo non fournie par {source} », `StayBar`
  collant (`stay-bar`, `stay-bar-lodging`, `stay-bar-total`, `stay-bar-go`).
  Mobile : pilule `stay-bar-summary` « Modifier » remplace la barre compacte.
  Garde `#/logements` sans station centrée (`rc-page--guard`).
- **Coût** : `costPeople` dans `selectors.tsx` — forfaits × `travelers` même si
  `state.people` n'a pas la même taille (bug iteration_2).
- **Sombre** : `.rc-h1` / `.rc-muted` tenus. testids `sel-go-search`, `track-go-search`.
- Testé : iteration_3.json (95 %), tsc ✓, i18n:test (909×2) ✓.

## Backlog restant
- P2 : La Daille / Le Fornet / Tignes affichent les mêmes agrégats (forfait
  relié Espace Killy) — décider si l'on montre les données village.
- P2 : découper `appState.tsx` (1166 l.) et `selectors.tsx`.
- P2 : le shim n'injecte les 3 annonces qu'au chargement direct de
  `#/logements` — navigation in-app depuis la fiche montre l'état vide (attendu
  hors Electron).
- P3 : scène 3D — textures (neige scintillante), nuages, cycle jour/nuit.
