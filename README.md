# SKITRACK

Recherche et comparaison de séjours au ski **par domaine skiable et altitude réelle des pistes**,
et non par ville ou par hôtel.

Application desktop **Electron + React + Vite**, avec un **sidecar Python (FastAPI)** qui porte
toute la logique métier et une base **SQLite**. Aucun serveur distant : l'app tourne entièrement
sur votre machine, avec vos propres clés d'API stockées chiffrées.

**État : interface v3 complète, premier connecteur de logement tarifé opérationnel.** Les neuf écrans de la
maquette sont implémentés — recherche de domaines, meilleures offres, combinaisons semaine ×
domaine, décision et partage des frais, logements avec fiche, comparateur et import par URL, suivi
de prix, voyageurs, réglages.

Les **domaines viennent de la base OpenSkiMap du moteur local** — 277 domaines français en
exploitation. Le fichier JSON livré (`src/renderer/src/data/referentiel.json`) sert de secours quand
le moteur n'a pas démarré, et porte les **tarifs de forfaits relevés à la main** ainsi que la
saisonnalité. Les deux se rejoignent par le slug du domaine. Les forfaits non relevés sont estimés
d'après les kilomètres de pistes et l'altitude, marqués « ≈ », et **n'entrent pas dans le score**.

La **neige et la météo sont réelles** : Open-Meteo, sans clé, hauteur de neige au sol interpolée à
l'altitude du bas des pistes **et** du point culminant, prévisions à 7 jours au sommet. Ce qui est
affiché est ce que le modèle donne, zéro compris. Le risque d'avalanche affiché est un **indice
dérivé** des chutes annoncées et du vent : le BRA officiel est publié par Météo-France et demande
une clé.

Les **offres de logement peuvent maintenant être relevées**. Expedia Rapid et Booking Demand restent
bloqués sur une validation de compte partenaire, mais **LiteAPI / Nuitee Connect** distribue le même
type d'inventaire avec une clé obtenue en libre service, sans validation ni volume d'affaires. Le
connecteur cherche **par coordonnées et rayon autour du domaine**, pas par nom de commune — Val
Thorens est administrativement *Les Belleville*, et une recherche textuelle rate la moitié du
domaine. Il parle au REST ou au **serveur MCP** de l'éditeur, au choix, avec le même mapping : la
parité entre les deux est vérifiée à chaque exécution des tests. D'autres serveurs MCP s'ajoutent
sans recompiler, par un fichier `mcp-sources.json` décrivant serveur, outil et champs.

Ce que ça ne couvre pas, et qu'aucune API ne couvrira : la **location entre particuliers**.
L'inventaire d'Airbnb n'est distribué nulle part ailleurs, et les serveurs MCP « Airbnb » qui
circulent lisent les pages du site — ce que les CGU interdisent, et ce que leur propre `robots.txt`
refuse. Voir [PROVIDERS.md](PROVIDERS.md).

La **distance aux pistes et le dénivelé d'accès sont calculés localement**, à partir des tracés
OpenSkiMap déjà en base : une API ne rend qu'un couple de coordonnées, le reste est du calcul. La
mesure se fait au segment et non au sommet le plus proche — l'écart atteint un facteur six sur un
tracé peu densifié, assez pour classer à tort un logement en « skis aux pieds ». Sur une position
seulement approximative, les distances sont arrondies à la centaine plutôt que d'afficher une
précision qu'on n'a pas.

Le catalogue de biens types reste en place pour les domaines sans clé configurée. L'**import par
URL** reste l'autre chemin vers de vraies annonces :
l'application lit *une* page, celle que vous collez, en respectant `robots.txt`, sous un User-Agent
qui l'identifie, et uniquement via les métadonnées publiques (JSON-LD, Open Graph). Sur les hôtes
dont les CGU interdisent l'accès automatisé, aucune requête n'est émise et la saisie manuelle prend
le relais. **Aucun scraping** : ni parcours de catalogue, ni contournement de protection anti-bot.

Toute la chaîne en aval — filtres, fusion des doublons, médiane du domaine, comparateur, suivi de
prix — travaille sur la forme d'objet que renverront ces connecteurs. L'écran Réglages → Sources de
données indique, poste par poste, ce qui est relevé, calculé, estimé ou simulé.

Le **moteur local Python reste en place** : base OpenSkiMap, altimétrie, géocodage, itinéraires et
isochrones. Il n'est plus bloquant au démarrage — l'interface fonctionne sans lui, avec les durées
de trajet en mode estimé.

---

## Installation sur Windows 11

### 1. Prérequis

| Outil | Version | Vérification |
|---|---|---|
| Node.js | ≥ 20 | `node --version` |
| Python | ≥ 3.11 | `python --version` |
| Git | — | `git --version` |

> **Piège Windows 11.** La commande `python` livrée par défaut est un raccourci vers le Microsoft
> Store : elle ouvre le Store au lieu d'exécuter Python. Installez le vrai interpréteur :
>
> ```powershell
> winget install --id Python.Python.3.12 --source winget
> ```
>
> puis **ouvrez un nouveau terminal** — le `PATH` n'est pas rafraîchi dans une session déjà ouverte.
> Alternative : [python.org](https://www.python.org/downloads/windows/) en cochant
> « Add python.exe to PATH ».

### 2. Installation

```powershell
cd C:\Users\<vous>\Dev\skitrack

npm install
npm run bootstrap     # crée sidecar\.venv et installe les dépendances Python
```

`npm install` peut signaler des scripts d'installation bloqués (npm ≥ 12). Electron et esbuild
en ont besoin :

```powershell
npm install-scripts approve electron esbuild
```

### 3. Vérification

```powershell
npm run typecheck        # TypeScript (main + preload + renderer)
npm run sidecar:test     # 42 tests Python
```

Les deux doivent passer sans erreur. Le dernier lance aussi un vrai processus sidecar pour
vérifier le handshake et l'authentification par token.

### 4. Lancement

```powershell
npm run dev
```

Au premier démarrage la base est vide : l'application propose d'importer le référentiel
OpenSkiMap. Comptez ~22 Mo pour les domaines et ~107 Mo pour les remontées, une seule fois.

Si le réseau est contraint (proxy d'entreprise), l'import passe aussi en ligne de commande, avec
des dumps téléchargés à la main :

```powershell
npm run sidecar:import
# ou, avec des fichiers locaux :
sidecar\.venv\Scripts\python.exe -m skitrack.cli import --countries FR `
    --file C:\dumps\ski_areas.geojson --lifts-file C:\dumps\lifts.geojson
npm run sidecar:stats
```

### 5. Empaquetage

```powershell
npm run dist
```

⚠️ L'installeur **n'embarque pas d'interpréteur Python** : la machine cible doit en avoir un.
Pour une distribution autonome, gelez d'abord le sidecar avec PyInstaller — la procédure est
documentée en commentaire dans [`electron-builder.yml`](electron-builder.yml).

---

## Utilisation

### Écran 1 — recherche de domaines

- **Altitude minimum du bas des pistes** : le critère décisif. Attention, c'est le point *skiable*
  le plus bas, pas l'altitude du village — la distinction est expliquée sur le curseur.
- **Point culminant**, kilomètres de pistes, pays, massif, glacier, domaine relié.
- **Temps de trajet en voiture** depuis une adresse de départ que vous saisissez (géocodée par la
  Base Adresse Nationale). Les itinéraires sont **pré-calculés une fois** puis stockés ; rien n'est
  recalculé à l'affichage.
- Résultats en liste + carte MapLibre sur fond OpenTopoMap, avec clusters, profil altimétrique par
  domaine et isochrones de temps de trajet.

Le **score de pertinence** est affiché avec son détail : chaque critère, sa contribution, et la
part de pondération réellement couverte quand une donnée manque.

### Clés d'API

Aucune clé n'est nécessaire pour l'altimétrie, le géocodage ni le référentiel : ces sources sont
ouvertes. Une clé **OpenRouteService** (gratuite) est nécessaire pour les temps de trajet et les
isochrones — Réglages → Clés d'API. Le détail de chaque source est dans [PROVIDERS.md](PROVIDERS.md).

Les clés sont chiffrées par `safeStorage` d'Electron (DPAPI Windows, lié à votre compte) et
poussées **en mémoire** au sidecar. Elles ne sont jamais écrites en clair, jamais en base, jamais
versionnées.

---

## Arborescence

```
skitrack/
├─ package.json                electron-vite, scripts npm
├─ electron.vite.config.ts     3 cibles : main / preload / renderer
├─ electron-builder.yml        packaging Windows (+ note PyInstaller)
├─ PROVIDERS.md                statut légal et accès de chaque source
├─ docs/
│  ├─ ARCHITECTURE.md          handshake, sécurité, cache, migrations
│  ├─ DATA_MODEL.md            schéma SQL commenté
│  └─ RISQUES.md               ce qui est fragile, impossible ou risqué
├─ scripts/
│  ├─ bootstrap.ps1            création du venv Python
│  └─ gen-types.mjs            OpenAPI -> types TypeScript
├─ src/
│  ├─ shared/ipc-contract.ts   canaux IPC typés, partagés main <-> renderer
│  ├─ main/
│  │  ├─ index.ts              fenêtre, IPC, politique de navigation
│  │  ├─ sidecar.ts            cycle de vie du process Python, handshake
│  │  ├─ python.ts             localisation de l'interpréteur
│  │  └─ secrets.ts            coffre DPAPI
│  ├─ preload/index.ts         pont contextIsolé (surface fermée)
│  └─ renderer/
│     ├─ index.html            CSP stricte
│     └─ src/
│        ├─ App.tsx            coque, navigation, écran d'amorçage
│        ├─ styles.css         feuille unique, thèmes clair et sombre
│        ├─ api/{client,types}.ts
│        ├─ i18n/index.ts      FR/EN typé
│        ├─ hooks/             useSidecar, useJob, useShortcuts
│        ├─ data/              référentiel embarqué, neige et semaines,
│        │                     catalogue de logements
│        ├─ domain/            logique pure : format, scoring, travel, costs
│        ├─ state/             appState (état + persistance), selectors
│        ├─ components/        FilterPanel, DomainCard, DomainMap, DomainSheet,
│        │                     AltitudeProfile, LodgingCard, LodgingFilters,
│        │                     LodgingSheet, LodgingMap, ComparePanel,
│        │                     ImportDialog, PeopleDrawer, Onboarding, Icons
│        └─ pages/             DomainSearchPage, LodgingsPage, OffersPage,
│                              CombosPage, DecisionPage, TrackingPage,
│                              SettingsPage, ReferentialPage
└─ sidecar/
   ├─ pyproject.toml
   └─ skitrack/
      ├─ __main__.py           handshake stdout + uvicorn sur socket réservée
      ├─ app.py                assemblage FastAPI
      ├─ cli.py                import / stats / curated / glaciers hors UI
      ├─ config.py             chemins, TTL, réglages process
      ├─ security.py           middleware token de session
      ├─ db/                   base déclarative, session, bootstrap
      ├─ models/               SQLAlchemy — 17 tables (phases 1 à 4)
      ├─ schemas/              Pydantic (source des types TS)
      ├─ api/routes/           health, domains, geo, referential, settings
      ├─ services/             http+cache, elevation, geocoding, routing,
      │                        scoring, massif, jobs, secrets, geo_math
      ├─ ingest/               openskimap, curated, glaciers
      ├─ providers/            BaseProvider, registry, deeplinks.yaml
      └─ data/
         ├─ reference/massifs.yaml
         └─ curated/domains_fr.yaml
```

---

## Types partagés

Le front est typé depuis les modèles Pydantic :

```powershell
npm run gen:types      # sidecar -> openapi.json -> src/renderer/src/api/types.gen.ts
```

`src/renderer/src/api/types.ts` est un miroir écrit à la main, utilisé par l'application. En cas
de divergence, **c'est le fichier généré qui fait foi**.

---

## Données et licences

Le référentiel dérive d'**OpenStreetMap** via **OpenSkiMap**, sous licence **ODbL**.
L'attribution « © contributeurs OpenStreetMap — OpenSkiMap.org » est affichée dans l'application
et doit être conservée en cas de redistribution des données.

Le fond de carte **OpenTopoMap** est sous **CC-BY-SA** ; sa politique d'usage impose une
sollicitation modérée du serveur de tuiles (pas de préchargement, zoom plafonné à 15).

---

## Phases suivantes

## Vérifié en conditions réelles

Sur cette machine (Windows 11, Node 24.18, Python 3.12.10), le 2026-08-11 :

| Étape | Résultat |
|---|---|
| `npm run typecheck` · `npm run build` | ✅ |
| `npm run sidecar:test` | ✅ 42 tests |
| Import du dump complet, France | ✅ 12 209 domaines lus → **277 importés**, 33 116 remontées → **3 052** sur 232 domaines, 6 entrées curatées appliquées |
| Altimétrie | ✅ IGN 2 314,1 m (Val Thorens) · OpenTopoData/EU-DEM 1 441,8 m (Tyrol) |
| Géocodage | ✅ adresse de test → coordonnées BAN |
| Handshake, token, isolation | ✅ 401 sans token, 200 avec |
| `npm run dev` | ✅ fenêtre, import depuis l'UI, liste + carte + profils altimétriques |

Trois bugs ont été trouvés **en lançant l'application**, pas en la compilant, et corrigés avec
leurs tests de non-régression : CORS absent (toute l'UI en « Failed to fetch »), endpoints de
tâches de fond déclarés `def` au lieu de `async def` (HTTP 500 sur l'import), et token de session
lisible dans la ligne de commande du processus.

## Phases suivantes

| Phase | Contenu | Prérequis bloquant |
|---|---|---|
| 2 | Moteur distances/altitudes logement, fiche logement, import manuel par URL, comparateur, export CSV/PDF | aucun |
| 3 | Connecteur Expedia Rapid, générateur de deep-links complet | compte partenaire Expedia Group |
| 4 | Connecteur Booking, extension Europe, suivi de prix et alertes | validation partenaire Booking |

L'interface `BaseProvider` et l'ensemble du schéma de données (logements, offres, historique de
prix, recherches sauvegardées) sont **déjà en place** : les phases suivantes remplissent des
emplacements existants plutôt que de migrer le schéma.

Avant d'attaquer la phase 3, lisez [docs/RISQUES.md](docs/RISQUES.md) § « Bloquants » : deux des
trois sources prévues n'apporteront probablement pas ce que le cahier des charges en attend.
