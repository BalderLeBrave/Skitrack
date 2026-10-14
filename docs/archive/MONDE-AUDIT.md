# Ce qui suppose la France

Inventaire préalable à l'extension mondiale. Il recense, fichier par ligne,
chaque endroit où le code tient pour acquis que la station est française, et
dit ce qu'on en fait.

Révision auditée : `7a57162` (`master`). Aucun fichier de code n'est modifié
par cette phase.

## Les trois stratégies

- **Généraliser.** La source est déjà mondiale, ou la règle ne doit rien à la
  France. Le code perd son hypothèse et rien ne la remplace.
- **Brancher par pays.** La France garde sa source, qui est meilleure ; les
  autres pays reçoivent une autre source, ou une absence affichée. Le
  branchement se fait sur `country`, jamais sur une devinette.
- **Laisser français.** Le champ ou l'écran n'a de sens qu'en France. Il vaut
  `null` ailleurs, et l'écran ne le montre pas.

Une quatrième issue existe et n'est pas une stratégie : **arrêter et
signaler**. Elle vaut pour tout ce qui tombe sous une surface verrouillée par
`CLAUDE.md`.

## 1. Libellés et découpages

| Où | Hypothèse | Stratégie |
| --- | --- | --- |
| `src/lib/stations.ts:40` (`massif`) | Le champ est obligatoire et porte un massif français. | **Brancher par pays.** `massif` reste renseigné en France et alimente le nouveau `region` ; ailleurs `region` porte la subdivision ISO 3166-2 et `massif` vaut le même libellé. |
| `src/lib/stations.ts:65-66` (`dept`, `commune`) | Découpage administratif français. | **Laisser français.** Déjà `null` pour les 36 stations hors classeur ; devient `null` pour tout l'étranger. |
| `src/lib/alpine.ts:6` (`ALPINE_MASSIFS`) | Deux massifs alpins français codés en dur. | **Laisser français.** Le fichier sert la carte des Alpes françaises et l'écran `/altitudes`, qui travaillent sur `DEPOT_STATIONS`. |
| `src/lib/alpine.ts:9-28` (`MapFilter`, `MASSIF`) | Sept massifs français en union de types littéraux. | **Laisser français**, même raison. Un type littéral fermé ne peut pas accueillir « Valais » sans devenir un `string`. |
| `src/lib/carte.ts:117` (`stationMassifs`) | Rend les valeurs distinctes de `massif`, triées en `fr`. | **Généraliser** en `stationRegions`, avec le tri dans la langue de l'interface et non en `fr` codé en dur. |
| `src/routes/carte.tsx:31` (`MASSIFS`) | Calculé une fois, au chargement du module, sur `STATIONS` entier. | **Généraliser.** Devient dépendant du pays choisi, donc calculé dans le composant, pas au module. |
| `src/routes/index.tsx:152-158` (`massifCards`) | Les tuiles « Par massif » de l'accueil. | **Généraliser** en tuiles « Par \<découpage\> », le libellé venant de `geo/pays.ts`. |
| `src/routes/comparer.tsx:150` (`massifs`) | Le sélecteur de massif du panneau de filtres. | **Généraliser** en sélecteur de région, dont les valeurs dépendent du pays. |
| `src/lib/filtres.ts:84,104-120` (`EtatRecherche.massif`) | Le jeton de filtre s'appelle `massif` et cherche dans `s.massif`. | **Généraliser.** Le jeton devient `region` ; deux jetons nouveaux, `continent` et `pays`, s'ajoutent. |
| `src/lib/criteres.ts:30` (`massif?`) | Paramètre d'URL `massif`. | **Généraliser.** `massif` reste lu pour ne pas casser les liens déjà partagés, et `continent` et `pays` s'ajoutent. |
| `src/routes/stations.$id.tsx:654,665,675` | « Massif Météo-France », « Station non rattachée à un massif Météo-France ». | **Laisser français.** Ces phrases ne s'affichent que si `country === "FR"`. |

## 2. Sources exclusivement françaises

| Où | Hypothèse | Stratégie |
| --- | --- | --- |
| `src/lib/alt.ts:7` (`AltSourceId`) | Cinq sources, dont `ign`, qui ne couvre que la France. | **Brancher par pays.** Une source `dem` s'ajoute pour l'étranger. Les deux ne se mélangent jamais : `altitudeBands` affiche celle qui existe. |
| `src/lib/alt.ts:45-49` | « IGN au pin (sommet) », « IGN au pin (village) », « IGN au pin GPS ». | **Brancher par pays.** Libellés propres à `ign` ; `dem` porte les siens, qui nomment le modèle numérique de terrain servi par Open-Meteo. |
| `src/lib/alt.ign.json` | 5 Ko de relevés IGN, par identifiant de station française. | **Laisser français.** Le cache `dem` est un fichier distinct, pour ne pas mêler deux référentiels d'altitude. |
| `src/lib/meteo/arome.server.ts:17` | `models=arome_france` et `timezone=Europe%2FParis` en dur. | **Brancher par pays.** AROME reste la France. Ailleurs, pas de `models` (Open-Meteo choisit), et le fuseau vient de `geo/pays.ts`. Le modèle retenu se nomme à l'écran. |
| `src/lib/snow/openMeteo.server.ts:38` | `timezone=Europe%2FParis` en dur, sur un service pourtant mondial. | **Généraliser.** Le fuseau devient un paramètre. C'est le même appel qui servira le service d'altitude. |
| `src/lib/bra/` (7 fichiers) | Bulletins Météo-France, rattachement par massif en trois voies. | **Brancher par pays.** Intact pour la France. Un registre `avalanche/registre.ts` sert les autres pays, ou affiche le lien officiel. |
| `src/lib/bra/massifs.ts:33,71` (`BRA_KEYWORDS`, `MF_CODES`) | Les massifs Météo-France et leurs codes. | **Laisser français.** |
| `src/lib/franceMontagnes.data.ts` (173 Ko) | Le classeur France Montagnes, généré. | **Laisser français.** Aucun équivalent mondial n'existe : c'est la raison pour laquelle OpenSkiMap devient la colonne vertébrale hors de France. |
| `src/lib/classeur.ts` | Appariement classeur × OpenSkiMap, `DOMAIN_FIXES`, `MANUAL_PAIRS`, `NAME_MATCH_EXCEPTIONS`, `GPS_FIXES`, `NOMS_FIXES`. | **Laisser français.** Son équivalent mondial est `monde/corrections.ts`, construit sur le même modèle, jamais en fusionnant les deux. |
| `src/lib/centrales.ts` | Centrales de réservation officielles françaises. | **Laisser français.** Hors de France, le compte rendu par source dira qu'aucune centrale n'est référencée pour ce pays. |
| `src/lib/stay/territoire.ts:10,85-117` | `LIMITE_TERRITOIRE_M`, et une vérification par numéro de département tirée de l'URL Gîtes de France. | **Brancher par pays.** La limite en mètres se généralise ; la vérification par département reste française et propre aux gîtes. |
| `src/lib/webcams.ts` | Table vérifiée à la main, France seulement. | **Brancher par pays.** Le type `Webcam` ne change pas ; la table sort par pays. Rien avant la partie C. |
| `src/lib/forfaits/catalog.json` (86 Ko) | 173 domaines, tous `country: "FR"`. | **Brancher par pays.** Le champ `country` existe déjà et est filtré partout (`listStored`, `listSources`, `listForfaitDomains`) : la structure accueille l'étranger sans changer de forme. |

## 3. Formats et devises

Le référentiel n'a aujourd'hui qu'une devise, et le code ne le dit nulle part :
il l'écrit. C'est le point le plus diffus de l'audit.

| Où | Hypothèse | Stratégie |
| --- | --- | --- |
| `src/lib/parcours.ts:319,327,339-343` (`fmt`, `eur`, `eurCents`) | Séparateur `fr-FR`, symbole `€` collé au nombre. | **Généraliser.** Un formateur prend la devise en argument ; `eur` devient un cas particulier et non la règle. |
| `src/lib/accommodation.ts:47-49` | `Intl.NumberFormat("fr-FR", { currency: "EUR" })`. | **Généraliser**, même formateur. |
| `src/lib/forfaits/age.ts:27` (`formatEuroTarif`) | `€` en dur. Employé par l'écran Forfaits et par `cout.ts`. | **Généraliser.** Le nom de la fonction ment déjà dès qu'un tarif suisse existe. |
| `src/lib/forfaits/cout.ts:43-58` | Additionne `j6` et `enf6` sans regarder leur devise. | **Généraliser.** Un total ne mélange jamais deux devises : si elles diffèrent, le total s'affiche par devise. |
| `src/lib/forfaits/grille.ts:59,134,188,221` | `devise: "EUR"` écrit en dur à quatre endroits. | **Généraliser.** La devise vient du pays du domaine. Le champ existe déjà, ce qui limite la reprise à son alimentation. |
| `src/lib/filtres.ts:58,128` | Le seuil « Forfait 6 j adulte, au plus » a `unit: "€"` et un maximum de 400. | **Brancher par pays.** Un seuil en euros n'a pas de sens sur un forfait en francs suisses ou en yens. Le filtre ne s'applique qu'aux stations dont la devise est celle du seuil, et écarte les autres, comme il écarte déjà une station dont le champ n'est pas mesuré. |
| `src/lib/forfaits/extract.ts:7,83-85` | L'extraction ne reconnaît que `€`, `eur`, `euros`. | **Brancher par pays.** Hors de France la voie par défaut est `manuelle` (voir §6), donc l'extraction automatique n'est pas sollicitée. Le motif reste à élargir le jour où une voie automatique s'ouvre. |
| `src/lib/liftSpan.ts:9,47`, `src/lib/gpx.ts:145,150`, `src/lib/carte.ts:190` | `toLocaleString("fr-FR")` pour des mètres et des kilomètres. | **Généraliser.** Le séparateur suit la langue de l'interface. Les unités restent métriques, y compris aux États-Unis : c'est un choix, et il s'écrit. |
| `src/components/v7/useForfait.ts:38`, `src/lib/forfaits/age.ts:68`, `src/lib/skiinfoStore.ts:49` | Dates en `fr-FR`. | **Généraliser**, même règle. |

## 4. Carte

| Où | Hypothèse | Stratégie |
| --- | --- | --- |
| `src/components/v7/CarteEpingles.tsx:37` (`VUE_VIDE`) | Centre `[45.5, 3.5]`, zoom 5 : la France. | **Généraliser.** Le cadrage par défaut vient du pays choisi, sinon du continent. |
| `src/lib/mapStyle.ts:29` (`FRANCE_BOUNDS`) | `[-5.3, 41.2, 9.8, 51.2]`, l'emprise servie par les couches IGN. | **Laisser français**, et c'est déjà correct : le champ `bounds` existe précisément pour empêcher une requête hors emprise. Les fonds IGN disparaissent simplement du sélecteur hors de France. |
| `src/components/v7/CarteEpingles.tsx:322` (`fitBounds`) | Cadre sur les épingles présentes. | **Généraliser**, sans changement : le comportement est déjà bon. |
| `src/components/v7/CarteEpingles.tsx:330-338` (désencombrement) | Empile les noms et n'en garde qu'un par zone. | **Généraliser**, et compléter : un regroupement en pastilles numérotées aux faibles niveaux de zoom, que 320 épingles ne rendaient pas nécessaire et que plusieurs milliers rendront indispensable. |
| Attribution | OpenStreetMap et OpenSnowMap sont déjà cités (`mapStyle.ts:34-36`). | **Généraliser.** OpenSkiMap s'ajoute sur les écrans qui affichent ses chiffres. |

## 5. Scripts

| Où | Hypothèse | Stratégie |
| --- | --- | --- |
| `scripts/build-openskimap.py:42` | `iso3166_1Alpha2 == "FR"` : tout le reste du monde est jeté à la lecture. | **Généraliser** dans un script distinct, `build-monde.py`. Le script français n'est pas modifié : il alimente un référentiel que la règle 4 de la mission interdit de bouger. |
| `scripts/build-openskimap.py:167` | Compte rendu « areas FR downhill ». | Idem. |
| `scripts/fetch-skiinfo-fr.py` | Relève les fiches Skiinfo françaises. | **Brancher par pays**, en partie C seulement. Le nom du fichier porte déjà `-fr`, ce qui laisse la place à `-monde`. |
| `scripts/build-stations-from-skiinfo.py` | Construit le référentiel depuis le relevé français. | Idem, partie C. |
| `scripts/import-france-montagnes.mjs` | Lit le classeur. | **Laisser français.** |
| `scripts/fetch-missing-photos.mjs` | **Surface verrouillée** (`images`). | **Arrêter et signaler.** Rien avant la partie C, et seulement avec l'accord écrit. |

## 6. Surfaces verrouillées rencontrées

Ces points sont nommés ici parce que l'audit les traverse, pas parce qu'ils
sont à traiter. Aucun n'est touché par la partie A.

- `src/lib/scrape/` en entier, dont `politesse.ts` et `centrales/`. Les
  connecteurs de logements y vivent : c'est la partie B, et elle attend
  l'accord écrit.
- `src/lib/scrape/robots.ts` et les cinq autres fichiers `robots`. La politique
  ne se discute pas et ne s'étend pas aux forfaits. **Conséquence directe pour
  la phase 6 :** hors de France, la voie par défaut d'un forfait est
  `manuelle`, c'est-à-dire le lien officiel et la saisie assistée, et non un
  relevé automatique.
- `public/stations/`, `src/lib/skiinfo.photos.json`,
  `src/lib/skiinfo.photos.local.json`, `scripts/fetch-missing-photos.mjs`. Ce
  sont les photos : partie C, accord écrit.

Le relevé tarifaire **lit** `src/lib/scrape/politesse.ts` depuis
`src/lib/forfaits/refresh.server.ts:21`. Lire est autorisé. La même dépendance
vaudra pour un relevé mondial : il réutilise la politesse existante au lieu
d'en écrire une seconde, ce qui reste une lecture.

## 7. Chargement

C'est le point qui décide si l'extension tient ou non.

Aujourd'hui, tout est importé statiquement au module :

| Fichier | Taille | Importé par |
| --- | --- | --- |
| `src/lib/osmAccess.snapshot.json` | 1 867 Ko | `osmAccess.data.ts:2` |
| `src/lib/osmLifts.json` | 449 Ko | `osmAccess.data.ts:3` |
| `src/lib/franceMontagnes.data.ts` | 173 Ko | `classeur.ts:18` |
| `src/lib/forfaits/catalog.json` | 86 Ko | `forfaits/catalog.ts:1` |
| `src/lib/openskimap.snapshot.json` | 66 Ko | `openskimap.ts:3` |
| `src/lib/stations.data.json` | 64 Ko | `stations.ts:30`, `classeur.ts:19`, `stationMigration.ts:29` |
| `src/lib/skiinfo.snapshot.json` | 56 Ko | `skiinfo.ts:3` |

Soit environ 2,7 Mo de données pour 320 stations, dont 2,3 Mo pour le seul
accès OSM. Le rapport est d'environ 200 Ko de référentiel pour 320 stations,
hors accès OSM.

**Ce qui ne tiendra pas.** `src/lib/stations.ts:234` construit `STATIONS` au
chargement du module, et trente-six fichiers l'importent. Avec plusieurs milliers de
stations, tout écran qui touche `stations.ts` paie le monde entier.

**Stratégie : généraliser, avec deux portes.**

- `stationsFrance()` reste synchrone et garde le comportement actuel, y compris
  `STATIONS` pour les écrans français ;
- `stationsPays(cc)` est asynchrone et fait un `import()` dynamique de
  `monde/data/<cc>.json` ;
- `monde/data/index.json` reste léger et peut, lui, être importé statiquement :
  il ne porte que des compteurs par pays.

Aucun écran ne charge le monde d'un bloc. La carte ne charge que les pays
visibles dans le cadre.

## 8. Ce que l'audit n'a pas trouvé

Deux absences méritent d'être écrites, parce qu'elles se remarquent moins qu'un
`€` en dur.

- **Aucun champ ne porte la source d'une valeur.** `measuredAt` date le relevé
  Skiinfo, `pistesKmScale` dit l'échelle, mais rien ne dit d'où vient une
  altitude ou un prix. La règle 3 de la mission le demande : c'est le champ
  `sources` à ajouter au type `Station`, et c'est une reprise transversale, pas
  un ajout local.
- **Aucune notion de pays n'existe.** Pas de `country`, pas de continent, pas
  de devise, pas de fuseau. Le socle de la phase 1 ne remplace donc rien : il
  s'ajoute, et c'est la raison pour laquelle il vient avant tout le reste.

## 9. Volume attendu par phase

Estimation du nombre de fichiers touchés, comptés sur le dépôt actuel. Les
créations sont comptées à part des reprises.

| Phase | Créés | Repris | Points sensibles |
| --- | --- | --- | --- |
| 1. Socle géographique | 3 | 0 | Aucun. Le socle n'est encore lu par personne. |
| 2. Référentiel mondial | 6 à 8 | 4 à 6 | `stations.ts` et son type `Station` : trente-six fichiers l'importent. `stationMigration.test.ts` gagne un test sans perdre les siens. |
| 3. Altitudes | 2 | 3 | `alt.ts` reçoit une source ; le point de relevé d'un domaine n'est pas un village, et l'écran doit le dire. |
| 4. Accueil | 4 à 6 | 5 à 7 | `index.tsx` fait 900 lignes et porte déjà la barre de recherche, les suggestions et les tuiles. C'est la phase la plus lourde côté interface. |
| 5. Comparer, Carte, filtres | 1 à 2 | 6 à 8 | Le regroupement en pastilles peut demander une bibliothèque : si c'est le cas, la mission impose de s'arrêter et de demander. |
| 6. Fiche station | 3 à 5 | 6 à 8 | Trois sujets indépendants : météo, avalanche, forfaits et devises. Le registre avalanche demande une vérification service par service, qui est du travail de lecture, pas de code. |
| 7. Recette | 2 | 1 | Le parcours navigateur sur six pays. |

Hors partie A, pour mémoire : la partie B touche `src/lib/scrape/` et la partie
C touche `public/stations/` et les fichiers de photos. Les deux attendent
l'accord écrit prévu par `CLAUDE.md`, absent du message de mission.

## 10. État du dépôt au départ

À noter, pour ne pas s'attribuer plus tard ce qui était déjà là :

- `npm run verify` : 493 tests passent sur 494. L'échec est
  `domainFit.test.ts:59`, `attachAccess : pas 5000 m des remontées de Val
  d'Isère`, sur l'assertion `searchedLiftM > 4000`.
- `npx eslint src` : 11 problèmes, dont 5 erreurs
  (`app-data/client.server.ts:214`, `pistes.ts:61` et `:75`,
  `stay/tarif.test.ts:253` deux fois).
- `npm run lint` porte sur le dépôt entier et en signale 141, dont la grande
  majorité dans `scrape/`, qui est verrouillé et donc hors d'atteinte.
