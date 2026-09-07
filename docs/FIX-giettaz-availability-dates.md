# Correctifs logements — Giettaz / disponibilité / dates

## Problèmes signalés

1. **Annonces non valides / non disponibles** encore visibles après recherche.
2. **La Giettaz** renvoyait des appartements à **Notre-Dame-de-Bellecombe** (même centrale Val d'Arly).
3. Sur la **fiche** d'une annonce centrale, les **dates n'étaient pas pré-remplies** → il fallait recliquer « Rechercher » pour voir le prix.

## Causes

| Problème | Cause |
|----------|--------|
| Mélange Giettaz / Bellecombe | `submitSearch` ne sélectionnait jamais `select[name="criteres[]"]` (village). La centrale multi-stations renvoyait tout Val d'Arly. |
| Dates absentes sur la fiche | `listingUrlWithStay` ne gérait que Airbnb / Booking / Expedia — pas « Site officiel de la station ». |
| Offres non tarifées | Fiches sans prix étaient injectées comme disponibles. |

## Correctifs (fichiers)

### `src/main/providers/station/station.ts`
- Sélection automatique de l'option village (`criteres[]`) en matchant `params.destination` (ex. `LOCALISATIONVALDARLY\|LAGIETTAZENARAVIS\|G`).
- Filet de sécurité : filtre des fiches dont `addressLocality` est clairement une autre commune.
- Exclusion des fiches **sans prix** (disponibilité non prouvée).

### `src/renderer/src/data/deeplinks.ts`
- `STAY_PARAMS['Site officiel de la station']` : `datedeb` / `datefin` (JJ/MM/AAAA), `duree`, `personnes`, `adultes`.

### UI disponibilité
- Le filtre `lodgOnlyAvailable` est déjà **activé par défaut** (`appState`). Les offres sans prix / autres dates restent masquées.

## Fichiers prêts à appliquer

Voir le bundle agent `ready-to-push/station.ts` et `ready-to-push/deeplinks.ts`, ou appliquer le diff localement.

```bash
# depuis la racine du repo
cp path/to/station.ts src/main/providers/station/station.ts
cp path/to/deeplinks.ts src/renderer/src/data/deeplinks.ts
git add src/main/providers/station/station.ts src/renderer/src/data/deeplinks.ts
git commit -m "fix(station+deeplinks): village filter + stay params on official listings"
git push
```
