# RECOMPOSE — preuve de recomposition (Phase 6)

Routes servies (HashRouter, `src/renderer/src/app/router.tsx`) : `/`, `/comparer`,
`/stations/:id`, `/logements`, `/reservation/:id` + utilitaires `/favoris`, `/suivi`,
`/reglages`, `/reglages/referentiel`. `grep "from '@/pages/"` hors `router.tsx` = 0 ;
`App.tsx` n'existe plus ; les anciens hashes `#recherche`, `#logements`, `#offres`… ne
sont plus servis (route inconnue → redirection `/`).

## Fichiers CRÉÉS (31)

| fichier | rôle |
|---|---|
| `app/theme.css` | jetons uniques : `--bg #F7FBFE`, `--glacier #E8F3FA`, `--ink #0B1F33`, `--cta #FF5A3C`, `--radius 16px` + rôles Cairn dérivés, variante sombre |
| `app/app.css` | système de composants `rc-*` (21st-inspired, no registry) |
| `app/AppRoot.tsx`, `app/router.tsx` | fournisseurs, amorçage, routeur, `RouteStoreSync` (URL ⇄ `state.tab`) |
| `app/shell/AppShell.tsx`, `TopNav.tsx`, `MobileTabBar.tsx`, `Boot.tsx` | coquille, barre haute, tab bar mobile, amorçage |
| `app/ui/SearchStayBar.tsx` | station + dates + voyageurs + chambres + CTA, persistante hors accueil |
| `app/ui/StationCard.tsx`, `CompareTable.tsx`, `LodgeCard.tsx`, `FilterChips.tsx`, `CheckoutPanel.tsx`, `EmptyHonest.tsx`, `PriceFirm.tsx` | composants de base demandés |
| `app/ui/MountainScene.tsx` | montagne enneigée procédurale (three + @react-three/fiber 8), chargée à la demande |
| `app/ui/LiquidGlass.tsx` | verre liquide (flou, réfraction SVG animée, reflet suivant le pointeur) |
| `app/screens/HomeScreen.tsx` (E1), `CompareScreen.tsx` (E2), `StationScreen.tsx` (E3), `LodgingsScreen.tsx` (E4), `ReservationScreen.tsx` (E5) | les cinq écrans |
| `app/features/useLodgingSearch.ts` | orchestration collecteur extraite à l'identique de l'ancien écran |
| `app/widgets/StationWidgets.tsx` | widgets météo / forfaits / BRA repris de l'ancienne fiche (logique inchangée) |
| `app/lib/stay.ts`, `app/lib/journey.ts` | libellés séjour, geste « ouvrir les logements » |
| `DECOMPOSE.md`, `RECOMPOSE.md` | autopsie et preuve |

## Fichiers SUPPRIMÉS (32 sources)

`App.tsx` · `pages/HomePage.tsx` · `pages/DomainSearchPage.tsx` · `pages/LodgingsPage.tsx` ·
`pages/OffersPage.tsx` · `pages/CombosPage.tsx` · `pages/DecisionPage.tsx` ·
`components/DomainCard.tsx` · `ResultCard.tsx` · `ResultCard.test.tsx` · `ResultGrid.tsx` ·
`StationPhotoCard.tsx` · `DomainSheet.tsx` · `LodgingCard.tsx` · `LodgingFilters.tsx` ·
`LodgingSheet.tsx` · `ComparePanel.tsx` · `RejectedLodgings.tsx` · `StayBar.tsx` ·
`StaySummary.tsx` · `FilterPopover.tsx` · `RangeFilter.tsx` · `RangeSlicer.tsx` ·
`FilterPanel.tsx` · `SkiSearchLoading.tsx` · `SearchBar.tsx` · `StayDatesField.tsx` ·
`JourneyStepper.tsx` · `PopularStations.tsx` · `styles/cairn.css` (fusionné dans
`theme.css`) · `styles/result-cards.css` · `styles/journey.css` · `styles/station-photos.css`.
`styles.css` : 7 041 → 4 172 lignes (371 blocs de pages orphelins purgés ; il ne reste que
les règles des widgets et écrans utilitaires gardés). Données inventées retirées avec
l'ancienne fiche : profil altimétrique dessiné (`PROFILE_SHAPE`), expositions
(`EXPOSURES`), historique de prix synthétique.

## Fichiers GARDÉS

- Contrats gelés : `state/appState.tsx` (+ `stationCompareIds`), `state/selectors.tsx`,
  `state/weather.tsx`, `data/*` (adapters, collecteur, filtres client, disponibilité,
  deep links), `domain/*`, `api/*`, `hooks/*`, `i18n/*` (+ clés `rc_*`), `dev-preview/*`.
- Widgets de données : `components/DomainMap.tsx`, `LodgingMap.tsx`, `LodgingGeoPanel.tsx`,
  `DateRangePicker.tsx`, `AltitudeProfile.tsx`, `StationPhotos.tsx`, `DomainLogo.tsx`,
  `BrandLogo.tsx`, `Icons.tsx`, `Snowfall.tsx`, `Flocons.tsx`, `PeopleDrawer.tsx`,
  `Onboarding.tsx` (monte désormais `SearchStayBar compact`), `ImportDialog.tsx`,
  `SelectionNotes.tsx`, `photos.ts`, `activeLodgingFilters.ts`.
- Écrans utilitaires non redessinés : `pages/SelectionPage.tsx`, `TrackingPage.tsx`,
  `SettingsPage.tsx`, `ReferentialPage.tsx`, `LegalSection.tsx`.

## Route morte

`/preview.html#recherche` (ancienne entrée) → le routeur ne connaît pas `/recherche` →
`<Navigate to="/">`. `#offres`, `#combinaisons`, `#decision` : idem, aucun écran ne les sert.

## Parcours vérifié (aperçu)

Accueil → Comparer (2 cases cochées → tableau) → Fiche `/stations/1050` (carte collante :
« 7 – 14 févr. · 7 nuits ») → Logements (`/logements`, contexte dates + groupe) →
Réservation `/reservation/9002` (récap dates/voyageurs/source Airbnb, total ventilé).
Desktop 1920 et mobile 390 (pile + tab bar).

## Ce qui n'a pas pu être prouvé

- Prix : seuls les relevés du collecteur sont affichés ; l'aperçu navigateur n'a que les
  3 annonces factices du shim. Prix médian logements du tableau = « — » sans relevé.
- GPS / distance aux pistes : dépend de `enrichWithAccess` (moteur local) → « Distance aux
  pistes non mesurée » sinon.
- Météo / neige : Open-Meteo via le moteur ; « — » ou « Aucun relevé » sans réponse.
- Cartes MapLibre : non chargées dans le shim d'aperçu, à vérifier dans Electron.
- 21st.dev : CLI présent mais exige un login → structures de blocs reconstruites.

## Passe correctifs (2026-06, suite)
- Routeur : l'URL est la seule source de vérité. `RouteStoreSync` n'écrit plus que
  `state.tab` depuis le chemin (sens unique) ; tous les `patch({ tab })` gelés
  (raccourcis, Onboarding, Favoris, Suivi, Réglages, Référentiel) passent par
  `useNavigate`. `/stations/:id` mappe sur `recherche`. Fin de l'oscillation.
- Météo : `WeatherProvider` couvre la station ouverte (`domFicheId` posé par la
  fiche, `lodgDomain` des logements) et rejoue une liste arrivée pendant une
  requête. Fiche : bloc « Météo du jour » (sommet / bas / neige 24 h) dans le hero.
- Accueil : `MountainScene.tsx` réécrit — relief ridged + sommets + vallée,
  couleurs par sommet (neige/roche), ombres portées, village de chalets (fenêtres
  allumées), sapins instanciés, télésiège (pylônes, câbles, cabines qui
  circulent), skieurs sur la piste, flocons. Plus d'erreur NaN.
- Photos : `tools/commons-candidates.py` + `tools/commons-fetch.py` (Wikimedia
  Commons, crédits CC écrits dans `stationPhotos.json`). Remplacées : Avoriaz,
  Plagne Villages, Serre Chevalier Le Monêtier, Combloux, Saint-Sorlin, Tignes
  Le Lac, Alpe d'Huez.
- Logements : `StationRibbon` (photo, altitudes, km, neige, forfait, lien fiche),
  repères calculés « Le moins cher / pers. » et « Le plus près des pistes »,
  vignette sans photo = photo station floutée + « Photo non fournie par {source} »,
  `StayBar` collant (logement retenu ou le moins cher, détail, total, CTA
  réservation). Mobile : barre de séjour repliée en pilule « Modifier ».
- Coût : le groupe tarifé suit `travelers` même si `people` n'a pas la même
  taille (`selectors.tsx`, `costPeople`).
- Sombre : `.rc-h1` et `.rc-muted` tenus.
