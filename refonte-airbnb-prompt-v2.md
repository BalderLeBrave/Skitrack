# SKITRACK — Refonte « Airbnb × Skiinfo » — PROMPT CORRIGÉ (v2)

> Version fiabilisée contre le code réel du dépôt (`BalderLeBrave/Skitrack@master`, vérifié le 2026-08-17).
> Les corrections par rapport au prompt initial sont marquées **⚠ CORRIGÉ**. Le reste est inchangé sur le fond.

---

## Écarts détectés entre le prompt initial et le dépôt (à lire avant d'exécuter)

1. **`npm test` et `npm run lint` n'existent pas.** La vérification réelle est `npm run verify`
   (typecheck:web + i18n:test + stations:test + cards:test + i18n:scan --ci). Tests unitaires ciblés :
   `npm run cards:test` (ResultCard.test.tsx) et `npm run stations:test` (stations.test.ts).
2. **L'app a un thème sombre fonctionnel** : `state.theme`, `ThemeSwitch` dans la nav, bloc de variables
   sombres dans `styles.css` (~ligne 78), et une section thème dans Réglages → Application. Le prompt initial
   ne définissait que la palette claire. Règle 1 interdit de retirer le toggle → **chaque nouveau jeton doit
   avoir sa valeur sombre** (voir Phase 1).
3. **La nav contient aussi `LangSelect` (`.nav__lang`) et `ThemeSwitch`** à droite, en plus de Suivi /
   Réglages / bouton personnes. À conserver et restyler (Phase 2).
4. **Réglages est déjà en 3 onglets** (`state.settingsTab`: 'app' / 'admin' / 'legal'), l'onglet Administration
   ayant des sous-onglets `engine` / `sources` / `routes` / `keys` (SettingsPage.tsx l.123–126, l.294–305).
   Il n'existe **ni** section « Poids du classement » **ni** « Raccourcis clavier ». Phase 10 réécrite.
5. **OffersPage a déjà un curseur de budget** : `state.offresBudget` (budget **total séjour**, 1500–9000 €,
   pas 250 €) qui **filtre** `derived.bestOffers`, plus un tri `state.offresSort`. Phase 5 réécrite pour ne pas
   entrer en conflit. OffersPage contient aussi des textes français **en dur** (h2, lede, « Trier par ») —
   exception connue à la règle 2, à ne pas aggraver.
6. **Les filtres d'altitude s'appellent `baseMin`/`baseMax`** dans l'état (`FILTER_RANGES.base`) ;
   `altitude_bottom` est une **clé i18n de libellé**, pas une clé d'état. Idem : `kmMin/kmMax`,
   `forfaitMin/forfaitMax`, `travelMin/travelMax` (cf. HomePage.tsx, raccourcis `home_sc_*`).
7. **Les stations/villages sont dans `data/stations.ts` (41 Ko)**, pas dans `data/domains.ts`.
   Les domaines viennent de `useApp().domains`.
8. **`#e0533f` existe aussi hors de styles.css** : `DomainMap.tsx` l.402 (contour de l'épingle sélectionnée).
   Le grep de contrôle doit couvrir `src/renderer/src/**`, pas seulement styles.css.
9. **`MAX_RESULTS = 40` est défini deux fois** : `DomainSearchPage.tsx` l.16 **et** `hooks/useShortcuts.ts` l.15.
   Ne toucher ni l'un ni l'autre.
10. **Les massifs de l'accueil sont dérivés dynamiquement** (top 6 par nombre de domaines, `MAX_MASSIFS = 6`),
    pas une liste codée en dur. Le mapping photo se fait par nom de massif, tuile générique sinon.
11. **Police locale : utiliser le pattern existant.** Le projet utilise déjà `@fontsource/archivo` (devDependency).
    Ajouter `@fontsource/plus-jakarta-sans` (imports des poids 400/500/600/700/800) plutôt que des fichiers manuels.
12. **i18n : chaque clé est un tableau de 7 langues** (fr, en, de, nl, es, it + 1). Toute nouvelle clé doit
    fournir les 7 entrées, sinon `i18n:test` échoue.
13. **Images annexe A : les 7 URLs répondent** (vérifié). `massif-massif-central` ne fait que **400×400**
    (limite pour une tuile 4:3 ; à remplacer si la tuile dépasse ~300 px de large). `massif-vosges` fait
    5000×3333 → redimensionner ≤ 1600 px. `LodgingMap` est bien à LodgingsPage.tsx l.840.
14. `styles.css` fait ~72 Ko. Le sélecteur d'épingle sélectionnée et le badge suivi utilisent `#e0533f`
    aux lignes ~2063–2065.

---

## Contexte

SKITRACK est une app Electron + React + Vite (renderer dans `src/renderer/src`), backend FastAPI sidecar,
styles dans un unique `src/renderer/src/styles.css` (CSS variables, pas de Tailwind, thèmes clair **et sombre**).
8 écrans routés par `App.tsx` via `screen` (dérivé de `state.tab`) : HomePage, DomainSearchPage, OffersPage,
CombosPage, DecisionPage, LodgingsPage (onglet visible seulement si `state.lodgingDomainId != null`),
TrackingPage, SettingsPage, + ReferentialPage (`import-referentiel`).

Objectif : direction visuelle « Airbnb × Skiinfo » — fond blanc, photo d'abord, un seul accent bleu, données
neige denses, Plus Jakarta Sans — agréable pour un skieur chevronné : la densité d'information utile
(altitudes, distance aux pistes, dénivelé, forfaits) est une qualité à préserver.

## Règles absolues

1. **Aucun changement de logique.** Ne pas modifier : `hooks/`, `data/`, `api/`, `domain/`, `ipc-contract.ts`,
   la logique de `state/appState.tsx` (seuls des ajouts d'état UI purs sont tolérés, ex. toggle neige).
   Handlers, calculs, tris, filtres identiques. Le `ThemeSwitch` et `state.theme` sont conservés.
2. **i18n intact.** Ne jamais remplacer un `t(...)` par du texte en dur. Nouvelles clés = 7 langues.
   (Exception préexistante : OffersPage contient du français en dur — ne pas l'aggraver, ne pas la corriger
   dans cette refonte.)
3. **Pas d'URL inventée.** Seules les 7 images de l'annexe A, téléchargées dans
   `src/renderer/src/assets/img/` au build initial. Usage personnel uniquement.
4. **Accessibilité et perfs** : focus visible, `prefers-reduced-motion` respecté (neige et transitions
   coupées), aucune animation de `blur`, 60 fps au scroll de la grille logements.
5. **Vérifications** : `npm run verify` doit passer (⚠ CORRIGÉ : pas de `npm test` / `npm run lint`).
   Si un test vérifie une classe CSS, seuls les sélecteurs peuvent être ajustés, jamais les assertions logiques.
6. Branche `refonte-ui`, commits par phase.

## Phase 1 — Design tokens et socle

Dans `styles.css`, bloc clair (`:root`) :

```css
:root {
  --bg: #FFFFFF;
  --panel: #FFFFFF;
  --surface: #F7F9FB;      /* remplace #f4f7fa */
  --border: #E4E7EB;       /* remplace #dfe5ec */
  --border-soft: #EFF2F5;
  --text: #222B33;         /* remplace #151c26 */
  --ink: #222B33;
  --muted: #6B7680;
  --dim: #A9B3BF;
  --accent: #0B6FC2;       /* ÉTAIT #e0533f — l'accent rouge disparaît */
  --accent-soft: #EAF4FC;
  --on-accent: #FFFFFF;
  --brand: #0B6FC2;        /* était #0a6fb8 */
  --brand-soft: #EAF4FC;
  --snow-light: #BFE0F7;
  --snow-ink: #133F63;
  --ok: #0E8A5F;
  --radius-card: 16px;
  --radius-pill: 999px;
  --shadow: rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.05) 0 2px 6px, rgba(0,0,0,0.09) 0 6px 18px;
  --shadow-hover: rgba(0,0,0,0.03) 0 0 0 1px, rgba(0,0,0,0.08) 0 8px 16px, rgba(0,0,0,0.13) 0 14px 32px;
  --nav-bg: #FFFFFF;       /* ABANDON du bandeau bleu nuit */
  --nav-fg: #222B33;
  --nav-muted: #6B7680;
  --nav-hover: #F7F9FB;
}
```

**⚠ CORRIGÉ — bloc sombre obligatoire.** Le bloc thème sombre existant (~l.78) doit être mis à jour avec les
équivalents de CHAQUE jeton ci-dessus (proposition — ajuster à l'œil) :

```css
--bg: #0F1519; --panel: #151C22; --surface: #1A222A; --border: #26313A;
--border-soft: #1F2830; --text: #E8EDF2; --ink: #E8EDF2; --muted: #8FA0AE; --dim: #5C6B78;
--accent: #3D9BE0; --accent-soft: #12283A; --on-accent: #FFFFFF;
--brand: #3D9BE0; --brand-soft: #12283A; --snow-light: #1E3E58; --snow-ink: #BFE0F7;
--nav-bg: #0F1519; --nav-fg: #E8EDF2; --nav-muted: #8FA0AE; --nav-hover: #1A222A;
```

Toute variable existante encore référencée non listée ici est conservée et mappée vers les nouvelles valeurs.

**Typographie** (⚠ CORRIGÉ) : `npm i -D @fontsource/plus-jakarta-sans`, puis dans `main.tsx` :
`import '@fontsource/plus-jakarta-sans/400.css'` (idem 500/600/700/800), et
`body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }`. Hiérarchie par graisse uniquement
(400 corps, 600–700 titres, 800 prix). Retirer les imports Archivo devenus inutiles s'il ne reste aucune référence.

**Images** : script ponctuel des 7 URLs de l'annexe A vers `assets/img/hero-montblanc.jpg` et
`assets/img/massif-*.jpg`. Optimiser : tuiles ≤ 1600 px / ≤ 300 Ko, hero ≤ 2560 px / ≤ 600 Ko.
⚠ `massif-massif-central.jpg` (400×400) : à n'afficher qu'en ≤ ~300 px de large, ou remplacer.

**Neige animée** : composant `Snowfall` (spans CSS, ~36 flocons, dérive latérale, `position:fixed`,
`pointer-events:none`, z-index au-dessus du contenu mais sous les modales et tiroirs — vérifier PeopleDrawer,
DomainSheet, LodgingSheet, ImportDialog), monté dans `App.tsx` (dans `Shell`, pas sur l'écran Boot),
désactivable via un réglage « Apparence » (nouvel état UI pur, ex. `state.snowfall`, défaut activé) et coupé
par `@media (prefers-reduced-motion: reduce)`.

**Critères Phase 1** : l'app compile en clair ET en sombre ; grep `#e0533f|#0d1b2a` vide sur
`src/renderer/src/**` (⚠ CORRIGÉ : inclut `DomainMap.tsx` l.402 — passer l'épingle sélectionnée sur `--accent`) ;
neige visible et désactivable ; `npm run verify` passe.

## Phase 2 — Navigation (`App.tsx` + styles `.nav*`)

Nav blanche sticky en grille 3 colonnes `1fr auto 1fr` :
- **Gauche** : logo typographique « ski » (400, `--muted`) + « track » (800, `--text`) + point bleu en exposant,
  26 px. Créer `components/BrandLogo.tsx`. Remplace `.nav__brand` + `LogoIcon` actuel (LogoIcon reste dans
  Icons.tsx, il peut servir ailleurs).
- **Centre** : les onglets actuels (`tab`/`tab2`, mêmes handlers `patch({ tab })`, mêmes conditions dont
  l'onglet Logements conditionné à `state.lodgingDomainId != null`) en chips : fond transparent, actif =
  texte `--text` + soulignement 2 px `--accent`. AUCUN onglet supprimé ni réordonné. Le compteur
  « Suivi · n » et « Voyageurs · n » conservés.
- **Droite** (⚠ CORRIGÉ) : Suivi, Réglages, **`LangSelect`**, bouton personnes (PeopleDrawer),
  **`ThemeSwitch`** — comportements inchangés, restylés pour fond blanc (le ThemeSwitch actuel force des
  couleurs de barre encre via styles inline `--nav-fg`/`--nav-muted` : elles suivront les nouveaux jetons).

**Critères** : navigation clavier inchangée, actif lisible, mode `narrow` conservé (`tab--narrow` existe).

## Phase 3 — Page 1 · Accueil (`HomePage.tsx`) — option A

Hero ~70 vh avec `assets/img/hero-montblanc.jpg` en cover, voile `rgba(13,32,52,.35) → transparent`, contenu centré :

1. **Titre** blanc — réutiliser `home_title_1` / `home_title_2` / `home_lead` / `home_badge` existants.
2. **Barre de recherche pill** (`components/SearchBar.tsx`, réutilisable en nav sur les autres pages), 4 segments :
   - **Destination** (⚠ CORRIGÉ) : autocomplétion sur les domaines (`useApp().domains`) ET les
     stations/villages (`data/stations.ts`). Suggestions dès 2 caractères, flèches + Entrée. La sélection
     reproduit exactement le comportement actuel : `patch({ domainQuery: <texte>, tab: 'recherche' })`.
   - **Dates** (⚠ CORRIGÉ) : réutiliser le sélecteur de semaines existant (`WEEKS` de `data/snow.ts`,
     actuellement dans LodgingsPage l.~728), branché sur la même clé d'état — vérifier son nom exact dans
     `appState.tsx` avant de câbler ; ne pas créer un second système de dates.
   - **Voyageurs** (⚠ CORRIGÉ) : stepper − / + (boutons ronds 24 px, traits SVG centrés, min 1 max 12)
     branché sur `state.travelers`.
   - **Altitude** (⚠ CORRIGÉ) : affiche `baseMin` (libellé i18n `altitude_bottom`), éditable via mini-popover
     avec le `RangeSlicer` existant (deux poignées) sur la plage `FILTER_RANGES.base`.
   - Bouton loupe rond bleu (SVG, flex centré).
3. **Chips critères** : les 4 raccourcis actuels (`home_sc_large/high/cheap/near`) avec leurs patches
   **complets** actuels (ex. `{ kmMin: 200, kmMax: FILTER_RANGES.km.max }`) — ne pas retirer les bornes hautes.
4. **Section Massifs** (⚠ CORRIGÉ) : la grille reste **dérivée dynamiquement** (top 6, `MAX_MASSIFS`).
   Mapping photo par nom : Alpes du Nord, Alpes du Sud, Pyrénées, Massif central, Vosges, Jura →
   `assets/img/massif-*.jpg` ; tout autre massif = tuile générique sans photo (dégradé `--accent-soft` +
   liseré `massifColor().ink`). Ratio 4:3, coin 16 px, nom en overlay bas. Le clic conserve **exactement**
   `openMassif` (remise à zéro documentée : `domainQuery:'', pinnedId:null, domBounds:null,
   domMapSync:false, domFitWanted:true, selectedId`).
5. **Stats du bas** : les 4 cartes `home_stat_*` conservées, restylées sobres.
6. **Bandeau bulletin neige** entre hero et massifs : données existantes via `useWeather()` /
   `data/weather.ts` / `bra.ts` — état « — » si absentes, jamais de donnée inventée.

**Critères** : destination retrouve un village ET un domaine ; tous les parcours actuels possibles ;
contraste AA sur le voile ; images locales.

## Phase 4 — Page 2 · Recherche domaines (`DomainSearchPage.tsx`) — option A

Split 55/45 : liste `DomainCard` à gauche (scroll indépendant), `DomainMap` collée à droite pleine hauteur.
Survol carte ↔ épingle : état UI `hoveredId` seulement. ⚠ CORRIGÉ : l'épingle sélectionnée de `DomainMap.tsx`
(l.402) passe de `#e0533f` à la valeur de `--accent` (MapLibre ne lit pas les variables CSS : dupliquer la
constante en haut du fichier avec un commentaire la liant au jeton).

**Filtres : `FilterPanel` repris à l'identique fonctionnellement** — libellés i18n `chip_base`, `chip_summit`,
`chip_km`, `chip_travel`, `chip_dist`, `chip_pass` (état : `baseMin/Max`, `summitMin/Max`, `kmMin/Max`,
`travelMin/Max`, `distMin/Max`, `forfaitMin/Max` — vérifier les noms exacts dans `appState.tsx`), éviter les
péages, glacier, domaines reliés, chips actives avec ✕ — restylés : rangée de chips au-dessus de la liste,
panneau des `RangeSlicer` en popover blanc à ombre douce. `MAX_RESULTS = 40` et le tri inchangés
(⚠ défini aussi dans `useShortcuts.ts` — ne pas toucher).

**Critères** : chaque filtre accessible en ≤ 2 clics ; épingles avec forfait ; survol croisé ; aucune régression
du `FilterPanel`.

## Phase 5 — Page 3 · Offres (`OffersPage.tsx`) — option C adaptée (⚠ CORRIGÉ en profondeur)

L'écran a DÉJÀ un curseur `state.offresBudget` (budget **total séjour**, 1500–9000 €, pas 250) qui filtre
`derived.bestOffers`, et un tri `state.offresSort`. **Les conserver tels quels.**

La partition « Dans le budget / Juste au-dessus » se fait **en aval, sur la liste déjà retournée** :
un second curseur **UI-local** « € / nuit / logement » (défaut = max) partitionne `derived.bestOffers` par
`o.c.lodging / derived.nights` en deux colonnes « Dans le budget (n) » / « Juste au-dessus (n) ».
Aucun refetch, aucune modification de sélecteur. À curseur au max, la colonne 2 est vide et le classement
affiché est identique à l'actuel.

Lignes denses : domaine, logement, jauge neige, source, prix (variante `dense` de `ResultCard` ou ligne dédiée).
Textes : les libellés français en dur préexistants restent en l'état (règle 2).

**Critères** : classement identique à l'actuel à curseur au max ; curseur fluide ; état vide propre par colonne.

## Phase 6 — Page 4 · Combinaisons (`CombosPage.tsx`) — option A

Grille semaine × domaine et calculs conservés. Dégradé **monochrome bleu** (interpolation entre
`--accent-soft` et un bleu foncé dérivé de `--accent` ; texte blanc au-delà de 55 % d'intensité), cellules 9 px
de rayon avec prix, liseré intérieur bleu 3 px sous les semaines de vacances scolaires (donnée existante),
légende donné/moyen/cher. Clic cellule inchangé. Vérifier le rendu en thème sombre.

**Critères** : contraste AA sur toute la gamme ; plus de multicolore ; calculs intacts.

## Phase 7 — Page 5 · Décision (`DecisionPage.tsx`) — option A

Colonne centrale max 560 px : carte du logement retenu en tête (format Phase 8), cartes blanches « Postes du
séjour » et « Par personne » (avatars = initiales sur pastille `--accent-soft`), montants en
`font-variant-numeric: tabular-nums`, écart vs partage égal en encart bleu pâle. **Calculs et éditabilité
conservés** (qui paie quoi, route au foyer conducteur).

**Critères** : mêmes montants qu'avant sur un même jeu de données ; édition des participants inchangée.

## Phase 8 — Page 6 · Logements (`LodgingsPage.tsx` + `ResultCard`/`LodgingCard`) — option A

La page maîtresse. Restyler au format validé **sans perdre un seul fait affiché** :
- Photo 16:10 en tête (placeholder « sans photo » restylé : dégradé bleu pâle + pictogramme montagne au trait) ;
  badges « Ski aux pieds » et source conservés ; pas de cœur favori si aucun état favori n'existe — ne pas en inventer.
- Corps : titre + note s'il y a lieu, ligne `place` actuelle (station · altitude · pers · ch · m²), ligne
  distance aux pistes / dénivelé / minutes inchangée (`dist_not_computed` compris), flags actuels conservés.
- **Bande neige** : jauge base/sommet + remontées si la donnée existe (`domainWeather.ts` / `bra.ts`) ;
  sinon altitude du domaine — état « — » propre, jamais inventé.
- Prix : montant + « tout compris · X €/pers/nuit » conservés ; multi-sources : gagnante en bleu, autres barrées
  (la donnée existe dans le modèle).
- Actions (Ouvrir l'annonce, Suivre le prix, Comparer) : pills discrètes, mêmes handlers.
- ⚠ Attention : `ResultCard.test.tsx` (`npm run cards:test`) vérifie cette carte — ajuster uniquement des
  sélecteurs de classes si besoin.

Page : bulletin neige en tête, grille `repeat(auto-fill, minmax(290px,1fr))`, skeletons épousant la carte
pendant `SkiSearchLoading`, `LodgingFilters` restylés comme Phase 4. **`LodgingMap` préservée** : même toggle
`state.lodgMapOpen` (raccourci clavier « m » existant), même emplacement (l.840), restylée seulement (coins
16 px, ombre douce). `ComparePanel` : tiroir bas sticky pill, même logique. `ImportDialog` et
`LodgingGeoPanel` restylés, comportements intacts.

**Critères** : aucune info perdue ; carte ouvre/ferme comme avant ; comparateur et import OK ; 60 fps au
scroll ; skeletons sans layout shift ; `npm run cards:test` passe.

## Phase 9 — Page 7 · Suivi (`TrackingPage.tsx`) — option D

Tableau lignes-cartes : Logement · Prix actuel · Min/Max · Tendance (▾ `--ok` en baisse, → gris stable) ·
Sparkline SVG. **Règle sacrée** : tant que les points manquent (`track_first_reading`, fenêtre
`track_six_weeks` — utilisées à TrackingPage l.~250), sparkline en pointillés + mention de simulation.
Clic ligne = détail actuel.

**Critères** : distinction simulation/réel évidente ; tri et actions conservés.

## Phase 10 — Page 8 · Réglages (`SettingsPage.tsx` + `ReferentialPage.tsx`) (⚠ CORRIGÉ en profondeur)

La page est déjà organisée en **3 onglets** (`state.settingsTab` : Application / Administration / Mentions
légales) avec sous-onglets Administration (`engine` / `sources` / `routes` / `keys`) et `LegalSection`.
**Conserver cette structure** (ne pas revenir aux ancres — l'onglet est de l'état existant).

Restylage : gabarit deux colonnes PAR ONGLET — sommaire sticky à gauche listant les sections réelles de
l'onglet actif, contenu à droite en cartes blanches, une ligne par réglage (libellé + contrôle à droite).
Sections réelles relevées : thème (`theme_light`/`theme_dark`/`theme_follows`), Densité (`density`),
Langue (`settings_language`) dans Application ; Moteur local (`settings_engine`), Sources de données
(`settings_sources`), Sources logements (`settings_lodging_sources`), Itinéraires (`settings_routing`),
Clés (`settings_keys`), Provenance (`settings_provenance`) dans Administration ; À propos (`settings_about`).
Ajouter dans Application une section « Apparence » regroupant thème + **toggle Neige animée** (nouvelle clé
i18n 7 langues, ex. `settings_snowfall`).

`ReferentialPage` au même gabarit : aperçu (n domaines, dernière modification) + trois actions en cartes +
avertissement d'effacement en encart orange doux (`#FDF3E7` / `#7A5320` — définir aussi les équivalents sombres).

**Critères** : aucun réglage perdu ; l'avertissement référentiel impossible à rater avant action destructive.

## Vérifications finales (⚠ CORRIGÉ)

```bash
npm run verify && npm run dev
```
1. Parcours complet : accueil → recherche destination « Val Thorens » → filtres domaine → logements → carte →
   comparer → suivre un prix → suivi → décision → réglages. En clair PUIS en sombre.
2. `prefers-reduced-motion` activé dans Windows : neige coupée, transitions coupées.
3. Grep de contrôle : `#e0533f` et `#0d1b2a` absents de **tout** `src/renderer/src/` (styles.css ET DomainMap.tsx).
4. Captures avant/après de chaque page dans le commit final.

## Annexe A — Images (vérifiées le 2026-08-17, toutes accessibles)

| Fichier cible | Dimensions source | Note |
|---|---|---|
| `assets/img/hero-montblanc.jpg` | 3840×2160 | OK, compresser ≤ 600 Ko |
| `assets/img/massif-alpes-nord.jpg` | 1160×870 | OK |
| `assets/img/massif-alpes-sud.jpg` | 1000×667 | OK |
| `assets/img/massif-pyrenees.jpg` | 1344×768 | OK |
| `assets/img/massif-massif-central.jpg` | **400×400** | limite — remplacer si tuile > 300 px |
| `assets/img/massif-vosges.jpg` | 5000×3333 | redimensionner ≤ 1600 px |
| `assets/img/massif-jura.jpg` | 2048×1363 | OK |

URLs sources : voir prompt initial (inchangées). Usage personnel uniquement, à remplacer par des photos
libres avant toute distribution.

## Annexe B — Maquette de référence

Maquette interactive validée : `SKITRACK - App v4 (Airbnb).dc.html` (projet Skitrack). Valeurs exactes à reprendre :

- **Nav** : hauteur 64 px, fond `rgba(255,255,255,.94)` + `backdrop-filter: blur(8px)`, bordure basse `#EFF2F5`.
  Logo : « ski » 400 `#6B7680` + « track » 800 `#222B33` + point `#0B6FC2`, 23 px. Onglet actif :
  `box-shadow: inset 0 -2px 0 #0B6FC2` + 700. La nav passe en `flex-wrap` sous ~1100 px (groupes
  dimensionnés au contenu) — ne pas figer une grille qui déborde.
- **Pill de recherche** : radius 999, `padding: 8px 8px 8px 28px`, séparateurs 1 px `#EFF2F5`, labels
  segments 11 px 800 uppercase, loupe : cercle 52 px `#0B6FC2`.
- **Hero** : 68 vh min 540 px, voile `linear-gradient(180deg, rgba(13,32,52,.50), rgba(13,32,52,.25) 55%, rgba(13,32,52,.35))`.
- **Tuiles massif** : ratio 4:3, radius 16, overlay bas `rgba(13,32,52,.72)`, liseré bas 4 px `massifColor().ink`.
- **Cartes (domaines, logements, lignes)** : radius 16 (14 pour les lignes denses), `--shadow` au repos,
  `--shadow-hover` au survol, chiffres en `font-variant-numeric: tabular-nums`.
- **Heatmap Combinaisons** : interpolation RGB linéaire `#EAF4FC → #0B5A9E`, texte `#133F63` puis `#fff`
  au-delà de t = 0.55 ; cellules radius 9 ; vacances scolaires : `inset 0 -3px 0 #0B6FC2`.
- **Sparklines Suivi** : réel = trait 2 px `#0B6FC2` plein ; simulé = `#A9B3BF` `stroke-dasharray: 4 5`
  + mention sous la courbe.
- **Toggle** : piste 42×24 radius 999 (`#0B6FC2` actif / `#E4E7EB` inactif), pastille 20 px blanche.
- **Placeholder photo logement** : `linear-gradient(155deg, #EAF4FC, #BFE0F7)` + pictogramme montagne
  au trait `#0B6FC2` opacité .55.
