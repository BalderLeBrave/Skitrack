# Centrales multi-villages — prix à jour & lieu exact

Objectif : pour **chaque station** rattachée à une centrale de réservation,
obtenir un **prix pour les dates demandées** et un **inventaire du bon village**
(pas le voisin sur la même centrale).

## Synthèse

| Famille | Exemple | Lieu | Prix live via `station-web` |
|---------|---------|------|-----------------------------|
| Ingénie + `criteres[]` | Val d'Arly (Giettaz, Bellecombe…) | Select village **obligatoire** | Oui si robots OK |
| Ingénie mono-station | Val Thorens, Les Menuires… | URL = station | Oui si robots OK |
| URL par village | Haute-Maurienne (La Norma, Val Cenis…) | Déjà dans l'URL (`ac54-…`) | Si formulaire reconnu |
| UI custom | **La Plagne** (`laplagneresort.com`) | Select custom | **Non** (hors Ingénie) |
| robots `Disallow: /` | Combloux, Montgenèvre, Praz-sur-Arly | — | **Non** (lien manuel) |

Le connecteur `station-web` ne parle **que** le moteur **Ingénie**
(`datedeb` / formulaire classique). Toute autre UI → erreur explicite +
lien à ouvrir à la main.

---

## 1. Val d'Arly — `reservation.valdarly-montblanc.com` (6 stations)

| Station app | Option `criteres[]` |
|-------------|---------------------|
| Crest-Voland | `LOCALISATIONVALDARLY\|CRESTVOLANDCOHENNOZ\|G` |
| Cohennoz | idem (même option groupée) |
| Flumet | `…\|FLUMETSTNICOLASLACHAPELLE\|G` |
| Saint-Nicolas-la-Chapelle | idem |
| **La Giettaz** | `…\|LAGIETTAZENARAVIS\|G` |
| **Notre-Dame-de-Bellecombe** | `…\|NOTREDAMEDEBELLECOMBE\|G` |

**Problème observé** : sans sélection du village, Giettaz renvoyait Bellecombe.

**Correctif** :
- `stationVillage.ts` : `matchVillageOption` + `cityMismatch`
- `station.ts` (patch) : remplir `select[name="criteres[]"]` avant « Rechercher »
- Écarter les fiches sans prix et celles dont `addressLocality` est une autre commune
- `deeplinks.ts` : recoller `datedeb` / `datefin` / `personnes` sur l'URL de fiche

Matching validé (St/Saint, tokens) : Crest-Voland, Cohennoz, Flumet,
Saint-Nicolas-la-Chapelle, La Giettaz, Notre-Dame-de-Bellecombe → OK.

---

## 2. La Plagne — `www.laplagneresort.com` (12 stations)

Plagne Centre, Belle Plagne, Montalbert, Aime 2000, Champagny, Montchavin,
1800, Bellecôte, Soleil, Villages, Hameaux de la Roche, « Vallée »…

- Formulaire **custom** (`div.custom-select__placeholder`, datepicker propriétaire)
- **Pas** de `datedeb` / `criteres[]` Ingénie
- `station-web` **ne peut pas** extraire de prix live aujourd'hui

**Requis pour un prix à jour + lieu exact** :
1. Connecteur dédié La Plagne Resort (custom-select village + dates), **ou**
2. Deep-link documenté vers la recherche pré-filtrée par village (si l'URL le permet), **ou**
3. Acceptation : lien manuel uniquement (pas de prix dans l'app)

Sans l'un de ces trois, afficher un statut clair « centrale non interrogeable »
plutôt que des offres d'un autre village ou sans prix.

---

## 3. Les Arcs / Peisey-Vallandry

- Centrals data : entrée « Les Arcs » → `www.peisey-vallandry.com` (incomplet)
- Stations map : `les-arcs.com`, `peisey-vallandry.com` selon le slug
- Pas de `criteres[]` homogène type Val d'Arly dans le relevé actuel

**Risque** : confondre Arc 1600/1800/2000, Peisey, Villaroger, Bourg-Saint-Maurice.

**Action** : relevé inspecteur par village (select localisation s'il existe) +
mapping `slug → option` comme pour Val d'Arly ; sinon URL de centrale
**par village** si le site en propose.

---

## 4. Haute-Maurienne — `reservation.haute-maurienne-vanoise.com` (4)

| Station | URL centrale (déjà discriminante) |
|---------|-----------------------------------|
| La Norma | `…/ac54-la-norma.htm` |
| Val Cenis | `…/ac57-val-cenis.htm` |
| Aussois | `…/ac62-aussois.htm` |
| Bonneval-sur-Arc | `…/ac64-bonneval-sur-arc.htm` |

Le **lieu est dans l'URL** : pas de select village. Vérifier que
`bookingCentralOf` / `stations.ts` pointe bien vers la page village (c'est le
cas pour Norma, Cenis, Aussois, Bonneval). Formulaire `datearrivee` / `nbpers`
≠ Ingénie classique → support `station-web` partiel ou absent.

---

## 5. Autres multi-hosts

| Host | Stations | Notes |
|------|----------|-------|
| `reservation.montgenevre.com` | Montgenèvre, Les Alberts | Options localisation 1/2 — **robots Disallow: /** → pas de scrape |
| `www.valdallos.com` | La Foux, Le Seignus | Pas d'options village dans le relevé |
| `www.sancy.com` | Super-Besse, Le Mont-Dore | Idem |

---

## 6. Règles productives (prix + lieu)

1. **Toujours** passer `destination` = nom de **station** (pas le domaine skiable).
2. Si le formulaire a `criteres[]` / localisation → **sélectionner** avant submit
   (`matchVillageOption`).
3. Après résultats → ne garder que les fiches **avec prix** pour les dates
   demandées ; filtrer `cityMismatch` si `addressLocality` est renseigné.
4. À l'ouverture d'une fiche → `listingUrlWithStay` avec `datedeb`/`datefin`
   (déjà en place pour « Site officiel de la station »).
5. Centrales non-Ingénie ou robots bloquants → **ne pas inventer** de prix ;
   exposer le deep-link / statut d'échec.

---

## 7. Checklist d'intégration `station.ts`

Le module `stationVillage.ts` est sur `master`. Il reste à **brancher** dans
`station.ts` (import + `FIELD.village` + select avant recherche + filtre post-cards).

```bash
git apply docs/patches/station-village.patch
# ou copier ready-to-push/station.ts
```

Sans ce branchement, Val d'Arly continuera de mélanger les villages.

---

## 8. Prochaines priorités techniques

1. Brancher le patch `station.ts` (critique Val d'Arly).
2. Connecteur ou deep-link **La Plagne Resort** (12 villages).
3. Relevé **Les Arcs** par village + mapping options.
4. Support formulaire Haute-Maurienne (`datearrivee` / `nbpers`) si robots OK.
5. Revue robots.txt périodique (Combloux, Montgenèvre, etc.).
