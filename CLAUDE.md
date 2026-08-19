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
| Lint Python | `npm run lint:py` | **rouge, préexistant** |
| Typecheck complet | `npm run typecheck` | **rouge, préexistant** |

`npm run verify` enchaîne : typecheck renderer, catalogue i18n, alignement des
stations, index des lieux, vignettes, règle `robots.txt`, connecteurs, dette de
traduction.
Il est hermétique : aucun de ses tests n'appelle le réseau depuis le retrait des
connecteurs LiteAPI, Expedia et Gîtes de France (`PROVIDERS_OFFLINE` n'a plus
d'effet).

Il n'y a **ni ESLint ni script `lint`/`test`** dans ce projet : `npm run lint`
et `npm test` n'existent pas. Ne les invoque pas.

### Rouges préexistants — ne pas les signaler comme régressions

- `npm run typecheck`, moitié Node : une trentaine d'erreurs `Cannot find name
  'document' / 'window'` dans `src/main/providers/airbnb/*` et
  `webscrape/extractors.ts`. C'est du code exécuté *dans la page* par
  `page.evaluate`, et `tsconfig.node.json` n'a pas `lib: DOM`.
- `npm run lint:py` : 38 constats ruff, dont 13 `B008` qui visent l'idiome
  FastAPI `Depends()` en valeur par défaut — des faux positifs.

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
- **`robots.txt` fait autorité sur ce qu'on charge.** La règle est lue avant
  chaque relevé (`src/main/providers/station/robots.ts`, testée par
  `npm run robots:test`). Une centrale qui interdit tout son site n'est jamais
  interrogée. Le connecteur ne **fabrique** pas d'URL d'exploration : il remplit
  le formulaire et clique, comme l'utilisateur l'aurait fait — voir l'en-tête de
  `station/station.ts`, qui explique pourquoi.

## Zones à ne pas toucher

- `src/main/providers/airbnb/**` — couche Playwright/cheerio du relevé Airbnb.
  Tout défaut constaté se corrige **en aval**, jamais dedans.
- `tools/skitrack_v25.py` — la liste `STATIONS` y fait foi et `stations.test.ts`
  la relit ; l'alignement se fait côté application.
- `src/renderer/src/data/franceMontagnesStations.ts` — **fichier généré**. Une
  correction se fait dans le classeur de `docs/sources/`, puis
  `npm run catalogue:import`.
