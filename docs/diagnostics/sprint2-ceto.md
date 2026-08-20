# Sprint 2 Ceto — notes, multi-SERP, deep-links

## Livré (workspace / paquet `sprint2-ceto/`)

| Fichier | Changement |
|---------|------------|
| `LodgingCard.tsx` | Badge ★ note (+ nombre d'avis) |
| `styles.css` | `.lodgcard__badge--note` |
| `deeplinks.ts` | Hash Orchestra par hôte + fallback `reservation.*` |
| `ceto/chamonix.ts` | SERP hotel+apartment+**residence** ; TA parallèle |

## Déjà sur master (sprint 1 partiel)

- `ceto/hosts.ts`, `ceto/chamonix.ts` (version antérieure), shim extract, CI, deploy script

## Déployer le reste

```bash
export GITHUB_TOKEN=…  # Contents: Read and write
# fusionner sprint2-ceto/ dans le clone puis :
node scripts/deploy-github.mjs --message "feat(ceto): sprint2"
```

## Comportement attendu

1. Recherche Chamonix → hôtels + appartements + résidences tarifés
2. Notes TA sur les 8 premières offres → badge ★ sur la carte + tri « Note voyageurs »
3. Clic annonce Chamonix → dates dans le hash, prix sans re-rechercher
4. Clic annonce `reservation.*` → `datedeb` / `datefin` injectés
