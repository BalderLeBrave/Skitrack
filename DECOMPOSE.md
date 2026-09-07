# DECOMPOSE — autopsie du renderer SKITRACK (Phase 0)

Renderer : `src/renderer/src`. Electron + React 18 + Vite, aucun router (navigation par
`state.tab`), store unique = `state/appState.tsx` (React context, persisté), dérivés =
`state/selectors.tsx`, météo = `state/weather.tsx`. Pas de Tailwind. CSS : `styles.css`
(7 000 lignes, pages + composants mêlés), `styles/cairn.css` (jetons), `styles/*.css`.

## Routes actuelles (`state.tab` → `App.tsx: Screens()`)

| tab | écran | devient |
|---|---|---|
| `accueil` | `pages/HomePage.tsx` | `/` (E1) |
| `recherche` (défaut) | `pages/DomainSearchPage.tsx` + `DomainCard`/`ResultCard` | `/comparer` (E2) |
| overlay `domFicheId` | `components/DomainSheet.tsx` | `/stations/:id` (E3) |
| `logements` | `pages/LodgingsPage.tsx` (1 126 l.) | `/logements` (E4) |
| — (n'existe pas) | — | `/reservation/:id` (E5, nouveau) |
| `offres` | `pages/OffersPage.tsx` | **supprimé** (couvert par E2/E4) |
| `combinaisons` | `pages/CombosPage.tsx` | **supprimé** |
| `decision` | `pages/DecisionPage.tsx` | **supprimé** (remplacé par E5) |
| `selection` | `pages/SelectionPage.tsx` | utilitaire `/favoris` (gardé tel quel, menu discret) |
| `suivi` | `pages/TrackingPage.tsx` | utilitaire `/suivi` (gardé tel quel) |
| `reglages` | `pages/SettingsPage.tsx` (admin moteur) | utilitaire `/reglages` (gardé tel quel) |
| `import-referentiel` | `pages/ReferentialPage.tsx` | utilitaire `/reglages/referentiel` (gardé) |

## Store (contrat gelé — `appState.tsx`)

Paramètres de séjour, **jamais perdus** : `arrDate`, `depDate`, `travelers`, `children`,
`rooms` (0 = sans minimum), `people`. Station : `selectedId`, `lodgingDomainId`,
`stationCompareIds` (nouveau, persisté). Logements : `imported` (relevés collecteur),
`lodgPhase` (`criteria|searching|results`), `lodgQueried/Failed/Empty`, filtres
`lodgBudgetMin/Max`, `lodgTypes`, `lodgDistMin/Max`, `lodgSort`, `lodgSrcOff`,
`lodgOnlyAvailable`, `selLodgings[domainId]`, `ficheId`, `compareIds`.
`stayCriteriaReady()`, `LODG_FILTER_RESET`, `FILTER_RANGES`. Thème `theme`, langue `lang`.

## Appels données (gelés)

- Référentiel domaines : `useApp().domains` (`data/referentiel.ts`, `Domain`).
- Collecteur : `data/runAirbnbSearch.ts`, `data/runProviderSearch.ts` (`window.skitrack.providers.*`),
  `data/lodgingAccess.ts` (`enrichWithAccess` → distance pistes si GPS), `data/useAirbnbRecheck.ts`.
- Filtre client : `data/lodgingFilter.ts`, `data/lodgingAvailability.ts` (`availabilityOf` :
  confirmed / unconfirmed(`unpriced`,`other_dates`) / gone / unrated) → `derived.lodgList`,
  `derived.lodgRejected`, `derived.lodgHidden`, `derived.lodgUnavailable`.
- Coûts : `derived.sejourCost(lodging, d)` (`domain/costs.ts`), `derived.forfaitOf(d)`,
  `derived.travelText(d)`, `derived.scoreOf(d)`.
- Météo/neige : `state/weather.tsx` (`weatherOf`), `data/domainWeather.ts` (`useDomainWeather`),
  `data/weather.ts` (`snowDepths` → `releve`), `data/bra.ts`, `data/webcams.ts`.
- Liens : `data/deeplinks.ts` (`deepLinks`, `listingUrlWithStay`), `window.skitrack.openExternal`.

## Tableau fichier | rôle | GARDER logique | JETER UI

| fichier | rôle | GARDER | JETER |
|---|---|---|---|
| `App.tsx` | shell, nav, écrans, boot | providers, `Boot`, `I18nBridge` → `app/AppRoot.tsx` | Nav, Screens, JourneyStepper, DomainSheet overlay |
| `pages/HomePage.tsx` | accueil | calcul massifs/stats (repris dans HomeScreen) | tout le JSX/CSS `.home*`, `.mcard*` |
| `pages/DomainSearchPage.tsx` | liste stations + carte | `MAX_RESULTS`, tri, filtres (via `derived.filtered`) | JSX, `.results*`, `.domcard*` |
| `components/DomainCard.tsx`, `ResultCard.tsx`, `ResultGrid.tsx`, `StationPhotoCard.tsx` | cartes station | — | supprimés (→ `StationCard`) |
| `components/DomainSheet.tsx` | fiche station (overlay) | widgets données `LevelCard`, `ForecastStrip`, `PassGrid`, `AvalanchePanel` → `app/widgets/StationWidgets.tsx` | overlay, profil altimétrique **factice** (`PROFILE_SHAPE`), `EXPOSURES` **factices**, historique de prix synthétique, champ logo |
| `pages/LodgingsPage.tsx` | recherche logements | orchestration collecteur (`launchSearch`, enrichissement accès, relance auto, chrono) → `app/features/useLodgingSearch.ts` | 600 lignes de JSX, `.lodg*`, split, popovers |
| `components/LodgingCard.tsx`, `LodgingFilters.tsx`, `LodgingSheet.tsx`, `ComparePanel.tsx`, `RejectedLodgings.tsx`, `StayBar.tsx`, `StaySummary.tsx`, `FilterPopover.tsx`, `RangeFilter.tsx`, `RangeSlicer.tsx`, `FilterPanel.tsx`, `SkiSearchLoading.tsx` | UI logements | `activeLodgingFilters.ts` (logique) | supprimés (→ `LodgeCard`, `FilterChips`, `EmptyHonest`, `PriceFirm`) |
| `components/SearchBar.tsx`, `StayDatesField.tsx`, `DateRangePicker.tsx` | saisie séjour | `DateRangePicker` (calendrier = logique de semaines `data/snow.ts`) | `SearchBar` (→ `SearchStayBar`), `StayDatesField` |
| `components/JourneyStepper.tsx`, `styles/journey.css` | fil d'Ariane | — | supprimés (le TopNav porte le parcours) |
| `components/PopularStations.tsx` | passe précédente | — | supprimé (→ `StationCard` + `HomeScreen`) |
| `pages/OffersPage.tsx`, `CombosPage.tsx`, `DecisionPage.tsx`, `SelectionNotes.tsx` (si orphelin) | écrans retirés | — | supprimés |
| `components/DomainMap.tsx`, `LodgingMap.tsx`, `LodgingGeoPanel.tsx` | cartes MapLibre | **gardés** (widgets données, demande utilisateur) | — |
| `components/AltitudeProfile.tsx`, `StationPhotos.tsx`, `DomainLogo.tsx`, `BrandLogo.tsx`, `Icons.tsx`, `Snowfall.tsx`, `Flocons.tsx`, `PeopleDrawer.tsx`, `Onboarding.tsx`, `ImportDialog.tsx` | widgets/outils | gardés | — |
| `pages/SelectionPage.tsx`, `TrackingPage.tsx`, `SettingsPage.tsx`, `ReferentialPage.tsx`, `LegalSection.tsx` | utilitaires | gardés tels quels (admin moteur) | — |
| `styles.css` | CSS global pages+composants | règles des widgets/utilitaires gardés | blocs `.home*`, `.mcard*`, `.sb*`, `.domcard*`, `.results*`, `.lodg*`, `.staybar*`, `.nav*`, `.journey*`, `.popcard*`, `.domsheet*`… |
| `styles/result-cards.css`, `styles/journey.css`, `styles/station-photos.css` | CSS des cartes/stepper | — | supprimés |
| `styles/cairn.css` | jetons | rampes/rôles → fusionnés dans `app/theme.css` | supprimé |
| `state/*`, `data/*`, `domain/*`, `api/*`, `hooks/*`, `i18n/*`, `dev-preview/*` | logique, contrats, collecteur | **gelés** | — |

## Plan (Phases 1 → 6)

1. `react-router-dom` (HashRouter). `app/theme.css` (jetons uniques : `--bg #F7FBFE`,
   `--glacier #E8F3FA`, `--ink #0B1F33`, `--cta #FF5A3C`, radius 16, variante sombre).
   `app/AppRoot.tsx` (providers + boot), `app/shell/{AppShell,TopNav,UtilityMenu}.tsx`,
   `app/router.tsx` (+ `RouteStoreSync` : URL ↔ `state.tab`, `lodgingDomainId`).
2. Blocs 21st-inspired (no registry, CLI exige un login) : `app/ui/{SearchStayBar,StationCard,
   CompareTable,LodgeCard,FilterChips,CheckoutPanel,EmptyHonest,PriceFirm}.tsx`.
3. Écrans `app/screens/{Home,Compare,Station,Lodgings,Reservation}Screen.tsx`, un par passe,
   preview après chacun.
4. Mobile : shell en pile + tab bar basse (`app/shell/MobileTabBar.tsx`).
5. Router à 100 % sur la nouvelle IA, `grep` = 0 import des anciens écrans, purge des fichiers
   JETER et des blocs CSS orphelins.
6. `RECOMPOSE.md` : créés / supprimés / gardés / route morte.
