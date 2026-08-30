# SKITRACK

Application Electron — renderer React, processus principal Node, sidecar Python
FastAPI. Compare des domaines skiables et des logements : altitudes réelles des
pistes, forfaits relevés, coût complet du séjour pour un groupe.

## Regard critique — IMPORTANT

- **Ne déclare jamais une tâche terminée sans preuve d'exécution.** « Terminé »
  signifie : `npm run verify` lancé, sa sortie collée, et chaque critère
  d'acceptation du prompt coché un par un.
- **Sépare toujours trois choses en fin de tâche** : ce qui a été *vérifié* en
  exécutant quelque chose, ce qui est *supposé* par lecture du code, et ce qui
  n'a *pas été ouvert*. Un critère qu'on ne peut pas vérifier se déclare non
  vérifié — il ne se coche pas. C'est la règle la plus utile du fichier : un
  faux « fait » coûte plus cher qu'un aveu d'incertitude.
- Après implémentation, relis ton propre diff (`git diff`) comme un reviewer
  qui cherche à faire échouer la PR, et liste les risques restants avant de
  conclure. Une relecture par un **contexte frais** vaut mieux que la tienne :
  `/critique`, ou le subagent `code-reviewer`, ou `/code-review` après `/clear`.
- Si une demande est techniquement une mauvaise idée, dis-le et propose une
  alternative. Ne valide pas un mauvais choix par complaisance.
- Pour un changement à risque — contrat IPC (`src/shared/ipc-contract.ts`),
  calculs de coût (`src/renderer/src/domain/costs.ts`), zone de recherche
  (`src/shared/geo.ts`), schéma des préférences (`state/appState.tsx`) —
  propose 2 ou 3 approches avec leurs compromis **avant** d'écrire du code.

## Commandes

| But | Commande | État |
| --- | --- | --- |
| Portail complet — le seul « done » | `npm run verify` | vert |
| Typecheck renderer | `npm run typecheck:web` | vert |
| Tests Python (53) | `npm run sidecar:test` | vert |
| Lancer l'application | `npm run dev` | — |
| Réimporter le catalogue | `npm run catalogue:import` | vert |
| Réimporter les centrales | `npm run centrales:import` | vert |
| Reconnaissance des centrales | `npm run centrales:recon` | vert, ~12 min, réseau |
| Régénérer les audits | `npm run areas:audit` · `npm run refs:audit` | vert |
| Écran vide au lancement (dev) | `npm run cache:clear` | vert |
| Refabriquer l'icône d'application | `npm run icon:build` | vert |
| Lint Python | `npm run lint:py` | **rouge, préexistant** |
| Typecheck complet | `npm run typecheck` | **rouge, préexistant** |

`npm run verify` enchaîne : typecheck renderer, catalogue i18n, alignement des
stations, index des lieux, vignettes, tranches de prix Airbnb, comportement
`robots.txt` — permissif, voir plus bas —, connecteurs, dette de traduction.
Il est hermétique : aucun de ses tests n'appelle le réseau depuis le retrait des
connecteurs LiteAPI, Expedia et Gîtes de France (`PROVIDERS_OFFLINE` n'a plus
d'effet).

Il n'y a **ni ESLint ni script `lint`/`test`** dans ce projet : `npm run lint`
et `npm test` n'existent pas. Ne les invoque pas.

### Écran vide au lancement, en développement

Symptôme : `npm run dev` ouvre une fenêtre noire, à chaque lancement, sans
message. Cause observée le 2026-08-29 : une entrée **corrompue** du cache HTTP
de Chromium (`%APPDATA%/skitrack/Cache`) servait des octets nuls pour l'une des
257 photos de station. Les photos passent par un `import.meta.glob` empressé
(`components/photos.ts`) : une seule illisible fait échouer le graphe de
modules entier, et rien ne s'affiche.

Le fichier sur disque était intact et `curl` recevait le bon module — seul le
navigateur embarqué voyait des zéros, et le cache survivait aux redémarrages.
Remède : `npm run cache:clear` (les réglages et les annonces sont conservés).
L'application **construite** n'est pas concernée : ses images sont dans le
paquet.

### Moteur local — sans import, il ne calcule rien

Constaté le 2026-08-30 : sur le profil réel, `ski_domain`, `domain_lift` et
`domain_slope` étaient **à zéro**, et la distance aux pistes valait donc « non
calculée » sur les 592 annonces enregistrées. Rien ne le signalait :
`enrichWithAccess` sort en silence quand le domaine n'est pas rapproché du
moteur, et l'écran affiche seulement « distance non calculée » par annonce.

Remède : `npm run sidecar:import` (dump OpenSkiMap, ~130 Mo, réseau). Après
import : 282 domaines, 3 233 remontées, et l'accès se calcule — mesuré à
145 annonces sur 165 pour un domaine.

Deux choses à savoir.

- **`domain_slope` reste vide après l'import** : aucun chemin d'ingestion ne
  remplit cette table, nulle part dans le sidecar. Elle est pourtant lue par
  `api/routes/lodgings.py`. Ce qui est mesuré est donc la distance à la
  **remontée**, pas à la piste — choix assumé de `ingest/openskimap.py`
  (« personne ne chausse au milieu d'une rouge »), mais l'étiquette de
  l'interface parle de pistes.
- **Le CLI et l'application partagent la même base** — `%APPDATA%\SKITRACK`
  et `%APPDATA%\skitrack` sont le même dossier sous Windows. En revanche,
  lancer le binaire par `npx electron out/main/index.js` **sans**
  `--user-data-dir` ouvre `%APPDATA%\Electron`, un profil distinct et vide :
  une vérification faite là mesure autre chose que ce que voit l'utilisateur.

### Rouges préexistants — ne pas les signaler comme régressions

- `npm run typecheck`, moitié Node : une trentaine d'erreurs `Cannot find name
  'document' / 'window'` dans `src/main/providers/airbnb/*` et
  `webscrape/extractors.ts`. C'est du code exécuté *dans la page* par
  `page.evaluate`, et `tsconfig.node.json` n'a pas `lib: DOM`.
- `npm run lint:py` : 38 constats ruff, dont 13 `B008` qui visent l'idiome
  FastAPI `Depends()` en valeur par défaut — des faux positifs.

### Icône d'application

`build/icon.html` est la **source** : le logo typographique réduit à ses deux
initiales — le S de « ski », le T de « track » — en graisse 800, avec la bille
d'accent en exposant. Les couleurs sont les jetons Cairn, pas des valeurs
choisies là.

`npm run icon:build` la rasterise en `build/icon.ico` (sept définitions, de 16 à
256 px) et `build/icon.png`. Le rendu passe par Electron : c'est le même moteur
que celui qui dessine le logo à l'écran, donc exactement la même lettre. Une
fenêtre s'affiche une seconde pendant la capture — Chromium ne compose aucune
trame pour une fenêtre qu'il ne dessine pas, et les variantes hors écran ou
transparentes rendent une image vide ou ne rendent jamais la main.

electron-builder prend `build/icon.ico` par convention (`buildResources: build`).
En développement, c'est `BrowserWindow` qui la porte, sans quoi la barre des
tâches affiche l'icône d'Electron.

## Invariants du projet

- **Rien n'est inventé.** Aucun prix, aucune ville, aucun pays, aucune URL
  produits par défaut. Une valeur absente reste absente : l'interface sait
  afficher « non renseigné », elle ne sait pas rattraper une estimation
  déguisée en mesure. Voir l'en-tête de `src/main/providers/types.ts`.
- **Tout texte visible passe par `t()`** — `src/renderer/src/i18n/index.ts`,
  **français et anglais**, index 0 = français. `npm run i18n:scan` tient un
  plafond de dette qui ne doit que baisser.
- **Le catalogue fait foi** pour la liste des stations, leurs coordonnées,
  leurs altitudes et leur domaine : `docs/sources/stations-ski-france-montagnes.xlsx`,
  converti par `npm run catalogue:import` en `data/franceMontagnesStations.ts`
  — fichier **généré**, jamais édité à la main. Le **référentiel** ne porte plus
  que ce que le classeur ignore : forfaits relevés, saisonnalité, glaciers,
  logos ; le **moteur local** enrichit les liens officiels. Le géocodage ne
  comble que les trous, et chaque candidat est confronté au modèle d'élévation
  avant d'être retenu.
- **Un logement hors de la zone du domaine est rejeté, pas signalé.** La zone
  se construit dans `src/shared/geo.ts`, en kilomètres, jamais en degrés.
- **Un échec de source reste local** : une source en panne produit une erreur
  motivée, jamais un résultat vide global.
- **`robots.txt` ne fait plus autorité pour les centrales** — depuis le
  2026-08-26. `src/main/providers/station/robots.ts` est une version
  permissive : elle n'analyse plus les règles, ne demande plus le fichier, et
  rend `allowed: true` sur tout chemin. Le garde-fou de `station/station.ts`
  est donc **inerte** : une centrale qui interdit tout son site est interrogée
  quand même. `npm run robots:test` constate ce comportement au lieu de le
  contredire, et le dit dans son en-tête ; l'implémentation qui appliquait la
  règle — groupes `User-agent`, préfixe le plus long, jokers, cache — est dans
  l'historique Git.
  Une chose reste vraie : le connecteur ne **fabrique** pas d'URL
  d'exploration : il remplit le formulaire et clique, comme l'utilisateur
  l'aurait fait — voir l'en-tête de `station/station.ts`, qui explique
  pourquoi.

  **Correction du 2026-08-30.** Ce fichier affirmait jusqu'ici que « l'import
  par URL garde sa propre lecture de `robots.txt` (`src/main/listing.ts`,
  indépendante de `robots.ts`) : une page interdite y est toujours refusée ».
  C'était faux sur les deux points, vérifié en lisant le code :
  `listing.ts:27` importe `allowsPath` **depuis** `providers/station/robots.ts`
  — la lecture n'est donc pas indépendante — et cette fonction rend
  `{ allowed: true }` sur tout chemin depuis le 2026-08-26. La branche de refus
  de `listing.ts:265` est **inatteignable** : aucune page n'est refusée au nom
  de `robots.txt`, nulle part dans l'application.

  Ce qui protège encore l'import par URL est d'une autre nature : la liste
  d'hôtes de `src/shared/listingHosts.ts` (Airbnb, Booking, Expedia,
  Hotels.com, Vrbo, Abritel), refusés au titre de leurs CGU **avant qu'aucune
  requête ne parte**. C'est un refus par hôte, pas par chemin, et il ne dépend
  d'aucun fichier distant.

## Zones à ne pas toucher

- `src/main/providers/airbnb/**` — couche Playwright/cheerio du relevé Airbnb.
  Tout défaut constaté se corrige **en aval**, jamais dedans.
- `tools/skitrack_v25.py` — la liste `STATIONS` y fait foi et `stations.test.ts`
  la relit ; l'alignement se fait côté application.
- `src/renderer/src/data/franceMontagnesStations.ts` — **fichier généré**. Une
  correction se fait dans le classeur de `docs/sources/`, puis
  `npm run catalogue:import`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
