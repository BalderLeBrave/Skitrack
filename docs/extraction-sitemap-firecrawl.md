# Extraction par sitemap, Firecrawl et n8n

Relevé du 11 octobre 2026. Deux cibles : les **centrales sans connecteur** (fiches de logements : complétude et prix) et les **forfaits des domaines** (pages tarifs officielles).

## Ce qui a été ajouté

| Fichier | Rôle |
|---|---|
| `src/lib/scrape/sitemap.ts` | Lecture pure : lignes `Sitemap:` de robots.txt, index et listes XML (CDATA, entités, gzip), tri par profil (`hebergement`, `tarifs`), sitemaps dédiés d'abord, langue du site, `Disallow: /` hors groupe |
| `src/lib/scrape/sitemap.server.ts` | Découverte polie : robots.txt, puis sitemaps, puis index ouverts un par un. Chaque URL passe par `verdictPoli`, et un refus 401/403/429 arrête l'hôte |
| `src/lib/scrape/firecrawl.server.ts` | Client Firecrawl v2 : `/scrape` (extraction JSON par schéma), `/map`, `/crawl` (une page à la fois, au `Crawl-delay`). robots.txt est rejugé avant et après chaque appel |
| `src/lib/scrape/catalogue.ts` | Fiche de logement : schéma Firecrawl, lecture locale sans clé (JSON-LD, Open Graph, `data-lat`, texte) et bornes |
| `src/lib/scrape/catalogue.server.ts` | Extraction complète d'un hôte : sitemap, puis carte Firecrawl, puis crawl Firecrawl, puis lecture de chaque fiche |
| `scrape/catalogue/extraire.ts` | `npm run catalogue:centrales` : écrit `scrape/catalogue/sortie/<hôte>.json` et `resume.json` |
| `src/lib/forfaits/pagesTarifs.ts` (+ `.json`) | Pages tarifs découvertes, essayées par `refresh.server.ts` **avant** les chemins devinés, avec un contrôle de cohérence |
| `src/lib/forfaits/firecrawlForfait.ts` | Schéma et bornes d'une grille de forfaits lue par Firecrawl |
| `scripts/forfaits-sitemap.ts` | `npm run forfaits:sitemap [-- --lire] [-- --lecteur firecrawl]` : écrit `pagesTarifs.json` et `docs/sources/forfaits-sitemap-<date>.json` |
| `n8n/*.json` | Trois workflows à importer (voir `n8n/README.md`) |
| `src/lib/cles/registre.ts` | Clé `firecrawl` (`FIRECRAWL_API_KEY`), facultative, posable depuis l'écran Clés |

## Politesse

- robots.txt est lu et **respecté** pour chaque sitemap et chaque page : une règle `Disallow` écarte l'URL sans requête.
- booking.prazsurarly.com publie une seule ligne, `Disallow:/`, sans `User-agent`. La norme ignore une règle hors groupe ; on applique quand même l'intention du site : rien n'est lu.
- lesangles.com répond 403 : l'hôte est fermé dès ce refus, sans second essai, sans autre agent et sans proxy.
- Une requête à la fois par hôte, 2 s au moins entre deux, ou plus si le `Crawl-delay` publié l'exige. Plusieurs hôtes peuvent avancer en parallèle (`--concurrence`).
- Avec Firecrawl : `maxConcurrency: 1` et `delay` égal au `Crawl-delay` pour un crawl. Un 401, 403 ou 429 rendu par le site ferme l'hôte, et on ne demande jamais de proxy « renforcé ».

## Ce qui n'est pas inventé

- Les chambres ne sont **jamais déduites des pièces** : un « 3 pièces » reste `pieces: 3, chambres: null`, via `occupancyFromText`.
- Un prix « à partir de », « dès » ou une fourchette « 1 190 à 1 980 € » est un **plancher** (`plancher: true`, bas de la fourchette).
- Ces sites n'ont pas de moteur de réservation : ils publient une **grille** (« Semaine : 650 € + taxe de séjour »), rangée dans `tarifs`. `totalSejour` n'est rempli que si la page écrit un total avec ses deux dates. Aucun site de cette liste ne le fait en lecture directe.
- Une coordonnée hors de France métropolitaine (0,0, lat/lon inversées) est écartée.

## Résultat : centrales sans connecteur (lecture directe, sans clé)

`npm run catalogue:centrales -- --concurrence 10`

| Hôte | Moteur | URL | Fiches | Capacité | Chambres | GPS | Photo | Tarif publié | Grille ou plancher | Note |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| beuil.fr | aucun | 10 | 4 | 2 | 4 | 0 | 4 | 0 | 0 |  |
| booking.prazsurarly.com | Orchestra | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | robots.txt `Disallow: /` : rien lu |
| font-romeu.fr | aucun | 115 | 88 | 85 | 38 | 0 | 88 | 1 | 6 | carte en JavaScript : pas de GPS |
| lesangles.com | aucun | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 403 : hôte fermé |
| sites.valdabondance.com | aucun | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | URL opaques : Firecrawl nécessaire |
| www.chioula.fr | aucun | 6 | 1 | 1 | 0 | 0 | 1 | 0 | 0 |  |
| www.haut-giffre.fr | aucun | 110 | 102 | 40 | 93 | 0 | 102 | 25 | 48 | position de l’office retirée des 102 fiches |
| www.mole-brasses.com | aucun | 74 | 70 | 44 | 54 | 64 | 68 | 14 | 48 |  |
| www.sancy.com | Diffusio | 1377 | 1361 | 1297 | 1275 | 1357 | 1356 | 731 | 1209 |  |
| www.valleesdegavarnie.com | Tourinsoft | 425 | 425 | 203 | 222 | 425 | 425 | 46 | 58 |  |
| **Total** | | **2117** | **2051** | **1672** | **1686** | **1846** | **2044** | **817** | **1369** | |

« Tarif publié » : au moins une ligne de grille qui n'est pas un plancher. Aucune fiche n'a de total daté : ces sites n'ont pas de moteur de réservation.

Le détail de chaque hôte est dans `scrape/catalogue/sortie/<hôte>.json`.

Ce qui reste à faire avec une clé Firecrawl :
- **sites.valdabondance.com** : 1 191 URL opaques (`/?p=85c25145616`). Le tri par chemin n'y trouve rien. Il faut passer par la carte Firecrawl (`search`) ou le crawl : `--lecteur firecrawl --decouverte carte,parcours`.
- **font-romeu.fr** : pas de coordonnées dans le HTML (la carte est chargée en JavaScript). Firecrawl rend la page.
- **beuil.fr, www.chioula.fr** : petits sites, peu de fiches publiées.

## Résultat : forfaits des domaines

`npm run forfaits:sitemap -- --lire --concurrence 8`

| Domaines avec site | Sitemap lu | Page tarifs trouvée | Grille lue et cohérente | Grille écartée (incohérente) | Refus 401/403/429 | robots.txt interdit |
|---:|---:|---:|---:|---:|---:|---:|
| 168 | 130 | 100 | 24 | 22 | 6 | 17 |

`src/lib/forfaits/pagesTarifs.json` liste les pages des 100 domaines (4 au plus par domaine, la grille d'hiver en français d'abord). Le détail par domaine est dans `docs/sources/forfaits-sitemap-2026-10-11.json`.

- Les lectures `--lire` passent par `extractForfaits`, le lecteur existant. Il donnait parfois des grilles impossibles : Val d'Isère à 67 € la journée et 90 € les 6 jours, Les Saisies à 46 € et 46 €, La Plagne à 21 € la journée. `grilleCoherente` les écarte : 6 jours valent entre 2,5 et 7 journées, la journée coûte entre 30 et 110 €, les 6 jours entre 150 et 650 €, et l'enfant ne paie pas plus que l'adulte. Dans `refresh.server.ts`, ce contrôle ne s'applique **qu'aux pages découvertes** : les pages déjà retenues gardent leur comportement.
- Les grilles lues sont des candidates. Elles passent ensuite par le contrôle habituel (`npm run forfaits:temoins`) avant d'être publiées.

## Firecrawl et n8n

- Clé : `FIRECRAWL_API_KEY`, ou l'écran Clés. Sans clé, tout fonctionne en lecture directe.
- `npm run catalogue:centrales -- --lecteur firecrawl` : sitemap, puis carte, puis crawl, et lecture JSON de chaque fiche (une page coûte un crédit, plus l'extraction JSON).
- `npm run forfaits:sitemap -- --lire --lecteur firecrawl` : lit les pages tarifs rendues en JavaScript (boutiques).
- n8n : `n8n/README.md`. Les trois workflows ont été importés avec succès dans n8n 1.123 (`n8n import:workflow`) et le JavaScript de leurs nœuds Code a été vérifié. Aucun n'est déployé.

## Tests

`src/lib/scrape/sitemap.test.ts`, `src/lib/scrape/catalogue.test.ts` et `src/lib/forfaits/pagesTarifs.test.ts` sont ajoutés à `npm test`.
