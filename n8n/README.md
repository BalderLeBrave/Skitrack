# Workflows n8n — Skitrack

Trois workflows à importer dans n8n (menu ⋯ → Import from File). Aucun n'est déployé : ils sont prêts, pas actifs.

| Fichier | Où il tourne | Ce qu'il fait | Rythme |
|---|---|---|---|
| `skitrack-releve-commandes.json` | n8n auto-hébergé, sur la machine du dépôt | Lance `npm run catalogue:centrales` puis `npm run forfaits:sitemap -- --lire`, et résume leur sortie | lundi 5 h |
| `skitrack-centrales-firecrawl.json` | n8n Cloud ou auto-hébergé | robots.txt → carte Firecrawl (`/v2/map`, sitemap compris) → une fiche à la fois (`/v2/scrape`, extraction JSON) → fichier JSON | lundi 6 h |
| `skitrack-forfaits-firecrawl.json` | n8n Cloud ou auto-hébergé | Lit `src/lib/forfaits/pagesTarifs.json` sur GitHub → lit la grille de chaque domaine par Firecrawl → fichier JSON | le 1er du mois, 4 h |

## Mise en place

1. Firecrawl : créer un identifiant n8n de type **Header Auth**. Nom `Authorization`, valeur `Bearer fc-…` (clé sur [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)). Le choisir dans les nœuds « … (Firecrawl) ».
2. Commandes (premier workflow seulement) : poser la variable `SKITRACK_DIR` (chemin du dépôt). Le nœud Execute Command doit être autorisé : en n8n 2.x il est exclu par défaut (`NODES_EXCLUDE`).
3. Activer le workflow.

## Politesse, la même que dans le dépôt

- robots.txt est lu avant tout appel : un `Disallow` écarte la page, un `Disallow: /` (même hors groupe, comme booking.prazsurarly.com) écarte l'hôte.
- Un 401, 403 ou 429 rendu par le site écarte l'hôte (lesangles.com répond 403 : il n'est pas lu).
- Une fiche à la fois, avec une pause égale au `Crawl-delay` publié (2 s au moins).
- Les bornes de `src/lib/scrape/catalogue.ts` et `src/lib/forfaits/firecrawlForfait.ts` sont recopiées dans les nœuds « Normaliser » et « Borner » : rien n'est inventé. Un prix « à partir de » reste un plancher, et un total de séjour n'est gardé que si la page écrit ses deux dates.

`MAX_FICHES` (nœud « Cibles ») borne le coût Firecrawl : 200 fiches par hôte par défaut, soit au plus 2 000 crédits par relevé pour les 10 hôtes.
