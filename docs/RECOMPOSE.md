# RECOMPOSE — coquille Skitrack (Fable 5.1)

Date : 2026-09-04. Collecteur Electron **gelé** (hors de cette coquille web).

## Phase 0 — autopsie (dépôt `/tmp/skitrack`)

| Compression | Preuve |
|---|---|
| Nav sticky 64 px + onglets | `App.tsx` Nav · `styles.css:992` `min-height: 64px` |
| Hero accueil 68 vh / min 540 px | `HomePage.tsx` + `styles.css:1508` `min-height: max(540px, min(68vh, 720px))` photo plate |
| En-tête logements (station, dates, groupe, altitude, coût) **avant** la grille | `LodgingsPage.tsx` ~700–773 |
| Empty wrap 50 vh | `styles.css:6838` `.results__emptywrap { min-height: min(360px, 50vh) }` |
| Split carte / liste | `styles.css:4217` `.lodgsplit` — la carte mange la liste |
| Cards 250 px | `.lodggrid` minmax(250px) |

[VRAI] la liste n’occupe pas 70 %+ du viewport : chrome + hero + bandeaux.

## Phase 1 — jeter / garder

**Jeter (cette coquille)** : restyle de `HomePage.tsx`, nav 8 onglets, JourneyStepper, pile d’en-tête logements, 50 vh, carte en bandeau.

**Garder** : photos `station-*.jpg` (copiées, 1 fichier = 1 station), contrat séjour (station, dates, pers, chambres), champs card (photo, titre, ch., cap, prix ferme, Disponible), altitudes FM.

**Créer** : AppShell mince, MountainScene Three, SearchStayBar, StationCard 21:9, `/logements` plein viewport, `/comparer`, `/reservation/:id`.

## 3D

[VRAI] MNT procédural / Terrarium **retiré**.
[VRAI] Accueil = GLB du pack WeTransfer (Gaea Low Poly + albedo), pas une photo de fond.

## Photos

[VRAI] 8 fichiers depuis Skitrack assets. README crédits. Pas de photo d’une station sous le nom d’une autre.

## Logements

Relevé **uniquement** Les 2 Alpes 6–13 fév. 2027 8 pers. (live 2026-09-03). Autre station → vide honnête. Copains **4261,52 €**. Pas 1330.

## Gel

## Preuve Phase 5 (2026-09-04)

| | |
|---|---|
| innerHeight | **900** (1440×900) |
| listings top | **109** px (barre 64 + chips 45) |
| hauteur visible grille | **791** px |
| **ratio visible** | **88 %** ≥ 70 % |
| cards | 6 (relevé 2 Alpes uniquement) |
| rangées visibles sans scroll | **2** (4 + 2, xl 4 colonnes) |
| 390×844 | première card visible, ratio **87 %** |

Screenshots : `screenshots/logements-1440.png`, `logements-390.png`, `home-1440.png`.

Phase 5 **finie** (88 % > 75 %).

## Créés
- `src/routes/{index,logements,comparer,stations.$id,reservation.$id}.tsx`
- `src/components/{AppShell,SearchStayBar,MountainScene,StationCard,LodgingCard}.tsx`
- `public/stations/*.jpg` + README
- `docs/RECOMPOSE.md`

## Supprimés
- (coquille neuve `/workspace` : pas de HomePage Electron restylée)

## Gardés
- Photos station du repo Skitrack, contrat séjour, prix fermes du relevé 2026-09-03, altitudes FM.

## Gel
Collecteur / adapters / resolver : non touchés.
