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

## Politesse, pas tout à fait celle du dépôt

- robots.txt, dans le dépôt (`npm run catalogue:centrales`, `npm run forfaits:sitemap`) : lu, chaque `Disallow` journalisé puis ignoré, l'extraction continue, `Disallow: /` compris (`verdictPoli`, `src/lib/scrape/politesse.ts`).
- robots.txt, dans `skitrack-centrales-firecrawl.json` : lu avant tout appel et respecté. Un `Disallow` écarte la page, un `Disallow: /` (même hors groupe, comme booking.prazsurarly.com) écarte l'hôte. `skitrack-forfaits-firecrawl.json` ne lit pas robots.txt : il reprend les pages de `pagesTarifs.json`, trouvées par `npm run forfaits:sitemap`.
- Un 401, 403 ou 429 rendu par le site écarte l'hôte (lesangles.com répond 403 : il n'est pas lu). Dans le workflow des centrales, c'est la réponse à robots.txt qui en décide ; une fiche refusée ensuite est notée en erreur, et la suivante est lue.
- Une fiche à la fois, avec une pause égale au `Crawl-delay` publié (2 s au moins). Forfaits : une page par domaine, 3 s entre deux.
- Les bornes de `src/lib/scrape/catalogue.ts` et `src/lib/forfaits/firecrawlForfait.ts` sont recopiées dans les nœuds « Normaliser » et « Borner » : rien n'est inventé. Un prix « à partir de », « dès » ou une fourchette n'est jamais un prix : il est écarté et compté (`planchersEcartes`). Un total de séjour n'est gardé que si la page écrit ses deux dates.

`MAX_FICHES` (nœud « Cibles ») borne le coût Firecrawl : 200 fiches par hôte par défaut, soit au plus 2 000 crédits par relevé pour les 10 hôtes.
