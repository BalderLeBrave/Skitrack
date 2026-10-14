# Écarts entre la maquette v6 et l'application

Contrat : `docs/design/v6-contrat.md` (HTML `c9d97756…`, `image-slot.js`
`e30189ba…`). Captures : `docs/design-check/<ecran>/`, produites par
`node tools/design-check.mjs --ecran <ecran>` aux viewports 1440×900 et
390×844, maquette et application côte à côte.

Chaque écart dit ce qui diffère, pourquoi, et s'il est réparable.

## Décisions prises (12 septembre 2026)

1. **Pas de tiret cadratin.** Tout « — » de la maquette devient « – »
   (demi-cadratin) : valeur d'absence (`fmt(null)`, faits, cellules de
   comparaison, « – non relevé »), légende « « – » : donnée absente… », et les
   deux phrases (« ouvrez ses logements – dates et groupe suivent », « Photo de
   la station – créditée »). Pour le reste, la maquette est suivie, blanc pur
   compris (`--v6-blanc`).
2. **Photos : toutes les stations, référence Skiinfo.** `stationPhoto()`
   (`src/lib/parcours.ts`) donne la copie locale du dépôt (`/stations/<id>.jpg`)
   ou, à défaut, l'URL publiée par la fiche Skiinfo. État au 12 septembre :
   231 stations ont une fiche Skiinfo, toutes avec photo (229 locales, 2 par
   URL : Larche, Le Chazelet). **Les 89 stations que seul le classeur décrit
   n'ont pas de fiche Skiinfo dans le dépôt, donc pas de photo** : leur slot
   reste vide. Les combler demande un relevé Skiinfo de ces 89 fiches
   (`scripts/fetch-skiinfo-fr.py`, relevé manuel hors production, réseau),
   que je ne lance pas. Aucune photo n'est prise ailleurs que Skiinfo.
3. **Carte Leaflet 1.9.4**, comme la maquette : `leaflet` et `@types/leaflet`
   ajoutés aux dépendances (`package.json`, `package-lock.json`). Tuiles OSM,
   attribution, `divIcon` 12×12, étiquette 0×0, zoom en bas à droite, vue
   `[45.4, 4.6]` zoom 6, vol zoom ≥ 9 en 0,6 s, minicarte zoom 11 sans
   glisser ni molette. La capture Comparer ne diffère plus de la maquette que
   par les données.
4. **Logements : la chaîne en place.** L'écran charge `listingsForStay`
   (relevé gelé : Airbnb, Booking, Gîtes de France, Abritel, Centrale) puis la
   recherche en direct `searchStay` en trois parts, exactement comme
   l'ancienne route : `airbnb`, `gites`, `cozy` (= Abritel + Booking). Le code
   de collecte n'est pas modifié.

---

## 0. Écarts communs à tous les écrans

### 0.1 Données réelles à la place des valeurs de démonstration

| Sujet | Maquette | Application | Réparable |
| --- | --- | --- | --- |
| Compte de stations | 318 (`stations-map-data.json` de la maquette) | 320 (référentiel du dépôt : 284 du classeur + 36 du dépôt) | Non : donnée du dépôt. |
| Séjour | 6 voyageurs, 3 chambres, 7 nuits, « 6 – 13 févr. » figé | `useStay` : 8 voyageurs, 0 chambre, 6 → 13 févr. 2027 réels | Voulu : les dates suivent le séjour réel. |
| Chambres | bornées 1–6 | valeur réelle affichée (0 = « toutes ») ; le pas ± reste borné 1–6 | À trancher si 0 ne doit jamais s'afficher. |
| Photo de couverture | slot vide | `/hero.jpg` du dépôt | Retirer `src=` rétablit l'état vide. |
| Altitudes des pistes | `lo`/`hi` à l'échelle du domaine (toutes les stations des 3 Vallées affichent 1 110–3 223 m) | `minM`/`maxM` du dépôt, échelle station (Brides 600–3 200 m) | Non sans donnée : le référentiel n'a pas d'altitudes de domaine ; agréger serait recalculer. |
| Coordonnées | France Montagnes | dépôt : coordonnées curées quand la station a une fiche | Non. |
| `(Skiinfo)` sur les km | `pisteSrc === 'skiinfo'` | `pistesKmScale === 'fiche'`, jamais vrai aujourd'hui | Non : le dépôt ne rabat pas les km Skiinfo. |
| « Fiche Skiinfo, hors classeur » | `origin === 'depot'` | `!inClasseur` (36 stations) | Équivalent. |

### 0.2 Règle 4 appliquée contre la maquette

| Sujet | Maquette | Application |
| --- | --- | --- |
| Glyphes en icône | `−` `+` (sélecteur), `✕` (tiroir), `✓` (« Choisi », « Dans la comparaison », liste de contrôle), `·` (liste de contrôle) | SVG en ligne (`src/components/v6/icons.tsx`), 12 px, trait 2,6 ; une règle CSS ajoutée pour ces cas. |
| Flèches dans le texte | « → », « ← » dans les liens | conservées : elles font partie du libellé. |
| Police secondaire | — | `IBM Plex Mono` reste chargée par `__root.tsx` pour les écrans non migrés (`.num`) ; aucun écran v6 ne l'emploie. |
| `image-slot` | `font: 13px/1.3 system-ui` | identique : typographie du composant, contrat § 4. |

### 0.3 Fuites de `styles.css` neutralisées dans `.v6`

La feuille v6 est préfixée `.v6` ; les écrans non migrés gardent leurs styles.
Remis à la valeur du navigateur : `backdrop-filter` de `.nav`, la bague de
focus de `.chip`/`.jl`, famille/graisse/interlettrage forcés des titres,
`line-height: 1.5` de Tailwind (ramené à `normal` : sans quoi toutes les
cartes dépassaient la maquette de 4 à 6 px).

Restent : la police des `input` (police système dans la maquette, Plus Jakarta
Sans héritée avec Tailwind) et la couleur du `::placeholder` de `.search
input`. La valeur exacte de l'agent utilisateur n'est pas reproductible.

### 0.4 Navigation

- Page unique dans la maquette, routes dans l'application (`/`, `/comparer`,
  `/stations/$id`, `/logements`, `/reservation`). `go()` porté avec ses
  verrous et bandeaux ; les boutons du parcours restent des `<button>`.
- **Persistance ajoutée** : station retenue, logement choisi, comparaison
  (`localStorage` `skitrack-parcours`), sinon un rechargement de `/logements`
  retombe sur l'écran vide. Réversible.
- Lien de partage (`#s=&l=&n=&t=&r=`) lu au montage de la coquille.
- L'ancien menu « Plus » n'existe pas dans la maquette ; ses routes restent
  accessibles par URL.
- `/reservation/$id` remplacé par `/reservation` ; `routeTree.gen.ts` régénéré.

---

## 1. Accueil

Captures : `docs/design-check/home/`.

| Écart | Pourquoi | Réparable |
| --- | --- | --- |
| Couverture et six cartes avec photo | décisions 2 et § 0.1 | — |
| « 320 stations · 7 massifs · 154 domaines », « Voyageurs 8 », « Chambres 0 » | § 0.1 | non |
| Six cartes dans le même ordre que la maquette | même règle | — |
| Recherche : sélection de la première station à l'arrivée sur Comparer (50 ms) | drapeau `selectFirst` | — |
| À 390 px | identique : `min-width: 1100px` + `overflow: hidden` clippent, maquette comme application | — |

Aucune différence de mise en page sur la capture 1440.

## 2. Comparer

Captures : `docs/design-check/compare/`.

| Écart | Pourquoi | Réparable |
| --- | --- | --- |
| Altitudes des lignes (Brides 600–3 200 m contre 1 110–3 223 m) | § 0.1 | non |
| Seuil de couleur en km affiché « ≥ ≈ 20 km » | règle 6 : km par couleur dérivés (part × km du domaine), notés ≈ dans `docs/REFERENTIEL.md` | — |
| « Fond IGN » : chip sans effet | comme la maquette | — |
| `#f-np` « Remontées, au minimum » compare `lifts` ; tri `np` = tronçons | comme la maquette | — |
| Carte, épingles, étiquette, zoom, attribution « Leaflet \| © OpenStreetMap contributors » | identiques (décision 3) | — |
| Liste vide, tiroir, panneau de comparaison, poignée (glisser, double-clic, flèches, repli, `skitrack.v6.side`) | portés | — |

## 3. Fiche station

Captures : `docs/design-check/fiche/` (Les 2 Alpes).

| Écart | Pourquoi | Réparable |
| --- | --- | --- |
| Photo Skiinfo | décision 2 | — |
| 1 300–3 600 m (maquette 1 284–3 511 m), 45.0090, 6.1220 (maquette 45.0067, 6.1228) | § 0.1 | non |
| « Forfaits et neige » branchés sur `getForfait` et `getSnowPair`, « – » tant que rien ne répond | règle 6 | — |
| La phrase « Tarifs et hauteurs de neige non relevés pour cette maquette… » conservée au-dessus | règle 2 | à trancher : fausse dès qu'une valeur arrive |
| `image-slot` sans `credit` | le dépôt ne porte pas de crédit photo | oui si le pipeline le fournit |

## 4. Logements

Captures : `docs/design-check/lodging/` (Les 2 Alpes, seule station à
annonces relevées).

| Écart | Pourquoi | Réparable |
| --- | --- | --- |
| Annonces réelles (décision 4) au lieu de six annonces d'exemple | règle 6 | — |
| « Charger des annonces d'exemple » désactivé (en-tête et état vide) | fabriquer des annonces est interdit | à trancher : retirer le bouton |
| « Importer une annonce » : bandeau littéral de la maquette | comme la maquette | à trancher |
| Étiquette « Exemple » absente | annonces réelles | — |
| Type de bien, note, avis, annulation : champs absents du dépôt, non affichés ; les filtres « type » et « Annulation gratuite » ne retiennent alors rien | idiome de la maquette pour les valeurs manquantes ; règle du filtre = son code | non sans donnée |
| Capacité inconnue → annonce écartée | `l.personnes >= S.trav` sur `undefined` est faux dans la maquette | comme la maquette |
| Budget « tous » (curseur à sa butée de 5 000) = aucun plafond ; la maquette appliquait quand même `total ≤ 5000` | décision du 12 septembre 2026 : prix maximal infini | — |
| `#lo-count` rempli → `.lfilters` sur deux lignes à 1240 px | même CSS (`flex-wrap`) | — |
| Photo d'annonce cassée → fond du cadre | comportement d'`image-slot` | — |
| Prix = `total` relevé (la maquette calculait `nuit × nuits`) | donnée du dépôt | — |
| Pas d'état de chargement pendant la recherche en direct | la maquette n'en a pas | — |

## 5. Réservation

Captures : `docs/design-check/booking/`.

| Écart | Pourquoi | Réparable |
| --- | --- | --- |
| Logement réel (La Citriere, 727 €) | § 0.1 | — |
| « Ouvrir l'annonce et réserver » ouvre `listing.url` ; désactivé sans URL | la maquette n'avait qu'un bandeau de démonstration | à trancher |
| Étiquette source sans « Exemple · » | annonce réelle | — |
| Méta : « 3 chambres » seul (distance non mesurée, pas de note ni d'annulation) | § 4 | — |
| « chambres non annoncées » si `bedrooms` nul | libellé de l'ancienne route | à trancher |
| Coches et puces en SVG | § 0.2 | — |

---

## 6. `image-slot.js` — porté / non porté

Porté (`src/components/v6/ImageSlot.tsx`) : les neuf attributs, le DOM interne
dans l'ordre, le dimensionnement (`100 % × 100 %`, repli `aspect-ratio: 3/2`),
`fit`, `shape`/`radius`/`mask`, l'erreur d'attribution Unsplash, le crédit à
deux liens avec paramètres de référence, l'image cassée qui laisse le fond du
cadre.

Non porté, parce que la maquette ne le fait pas hors de son runtime : dépôt de
fichier, recadrage, boutons Replace/Edit, sidecar, ré-encodage WebP. Le shadow
DOM devient des classes `.islot__*`.

---

## 7. Vérification

- `npx tsc --noEmit` : vert.
- `npx eslint src/` : 4 erreurs et 3 avertissements, tous préexistants et hors
  des fichiers touchés.
- `npm test` : 144 / 144.
- `tools/design-check.mjs` : cinq écrans, deux viewports, régénérés après les
  quatre décisions.
