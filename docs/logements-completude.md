# Complétude des logements : chambres, capacité, remontée la plus proche

Objectif : que chaque logement, quelle que soit sa source, porte trois champs
au statut explicite (`bedrooms`, `capacity`, `nearestLift`), sans jamais
confondre une valeur inconnue avec 0, et sans rien inventer.

Ce document commence par l'inventaire (phase 0, 26 septembre 2026, aucune
modification du code). Les phases suivantes y ajouteront leurs comptes rendus
et le rapport de `listings:audit`.

## 0. Inventaire

### 0.1 Ce que le brief suppose, et ce que le dépôt contient

Le brief décrit un projet plus ancien. Vérifié dans l'arbre actuel et dans
l'historique git :

| Élément du brief | Dans le dépôt |
|---|---|
| `STATION_CONFIG` | Absent. Il vivait dans `tools/skitrack_v28.py`, retiré par le commit `0b95870` (« Remplacer master par l'appli web Skitrack »). |
| `skitrack_v32.py` (pipeline Playwright) | Absent, y compris de l'historique. Playwright existe (`src/lib/scrape/browser.server.ts`), utilisé par Cozy, Gîtes de France et les replis Booking et Airbnb. |
| Adaptateurs Expedia Rapid, Booking Demand API | Absents. Seules traces : l'historique (`sidecar/skitrack/providers/registry.py`) et une valeur de test invalide `source: "Expedia"` dans `src/lib/prix/calcul.test.ts`. |
| Ingénie, Genius, Open System | Ingénie et Open System existent, côté centrales (`src/lib/scrape/centrales/moteurs/`). Genius : absent. |
| Liens de recherche Airbnb (deep links) | Aucun module n'en produit. `isDoorway` (`src/lib/stay/availability.ts`) reconnaît encore une URL `/s/…/homes` comme « porte d'entrée ». |
| Stubs Booking et Airbnb | Absents : les deux collecteurs font de vraies requêtes. Le seul substitut est le relevé figé `RELEVE_2A` (`src/lib/listings.ts`). |
| Schéma SQLite des logements | Absent. `src/lib/db.ts` ouvre Postgres (Neon, ou PGlite en local) pour l'authentification seulement ; `migrations/` ne contient que `auth/0001_auth.sql`. Les logements ne sont pas en base : voir 0.3. |
| Remontées via Overpass et table `lifts` | Absentes. Les remontées sont un jeu de données embarqué : voir 0.5. |

Le périmètre réel comprend donc : les plateformes (Airbnb en direct et via
CozyCozy, Abritel et Booking via CozyCozy, Booking en direct), Gîtes de France,
GreenGo, huit agences de montagne (`src/lib/scrape/agences/`), sept moteurs de
centrales (`src/lib/scrape/centrales/moteurs/`), et le relevé figé.

Contrainte propre au dépôt : `src/lib/scrape/**` et `scrape/**` sont
verrouillés en écriture (`CLAUDE.md`). Tous les collecteurs, `fusion.ts`, le
`locate` de `run.server.ts` et les workers Python en font partie. Chaque phase
qui les touche demandera l'accord écrit prévu.

### 0.2 Le modèle actuel : `Listing` (`src/lib/listings.ts`)

| Champ | Sémantique actuelle |
|---|---|
| `guests: number \| null` | Couchages annoncés. `null` : la source s'est tue. Entiers de 1 à 50 acceptés par les parseurs. |
| `bedrooms: number \| null` | `null` : non annoncé. `0` : studio publié, une vraie valeur. 0 à 50. |
| `rooms?: number \| null` | Pièces, convention des centrales (« 3 pièces », « T4 »). Jamais converties en chambres au relevé ; `normalizedBedrooms` (`src/lib/stay/lodgingFilter.ts`) fait `rooms - 1` au moment de comparer. |
| `beds?`, `baths?`, `propertyType?` | Lits, salles de bain, type publié (« jamais déduit d'un titre »). |
| `lat`, `lon: number \| null` | Position publiée par la source. `(0,0)` et hors globe valent absence (`gpsPrecis`). |
| `locality?`, `placeName?`, `distToPlaceM?` | Commune publiée ; lieu OSM le plus proche (`attachAccess`). |
| `distToLiftM`, `liftName`, `liftKind`, `liftLat`, `liftLon`, `liftOtherLat`, `liftOtherLon` | Gare la plus proche dans le domaine cherché, et l'autre gare du même appareil (`mateOf`). `null` sans position ou hors domaine. |
| `searchedLiftM`, `searchedLiftName` | Gare la plus proche dans la liste de la station cherchée, même hors domaine. |
| `distToSlopesM` | Mal nommé : distance au repère de la station, pas aux pistes. |
| `domainFit`, `nearestDomainId`, `nearestDomainName`, `distToNearestDomainM`, `winterBarrier` | Verdict de domaine (`src/lib/domainFit.ts`). |
| `proven: string` | Seule trace de provenance, une chaîne libre à marques (`· relevé`, `· fiche`, `· adresse`, `· même logement`, `· mémoire des fiches`…) relue par regex dans `src/lib/provenance.ts`. **Aucune provenance champ par champ** : rien ne distingue un `guests` publié d'un `guests` recopié ou tiré du texte. |
| `pricedCheckIn`, `pricedCheckOut`, `scannedAt`, `missingSince` | Datent le prix seulement. Aucun `computedAt` ni version de jeu de données sur les remontées. |

La règle « rien n'est estimé » est écrite en tête de `stay/enrichir.ts`,
`stay/poserReleve.ts`, `stay/lectureFiche.ts`, `stay/memoireFiches.server.ts`,
`stay/recopie.ts` et `prix/completion.server.ts`. Elle est respectée pour les
valeurs ; ce qui manque, c'est le statut qui la rend vérifiable.

### 0.3 Stockage et normalisation

Les logements ne sont pas en base de données :

| Stockage | Où | Contenu |
|---|---|---|
| Mémoire zustand, non persistée | `src/lib/stay.ts` (`useStay`) | `liveListings` et `liveSources` de l'écran Logements. `mergeLive` remplace par source et trie ; il ne normalise rien. |
| localStorage `skitrack-prix` | `src/lib/prix/releve.ts` (`usePrix`) | Périodes et résultats par station (médiane, comptes), sans annonces. |
| IndexedDB `skitrack-prix`, magasin `annonces` | `src/lib/prix/annonces.ts` | Les `Listing` retenus par l'écran Prix, une entrée par station, période et groupe. Relus par `versListing`, puis `rejugerDomaine` et `remesurerRemontee` (recalcul à chaque lecture). |
| `%APPDATA%\skitrack\fiches.json` | `src/lib/stay/memoireFiches.server.ts` | Mémoire serveur de 30 jours par annonce : `guests`, `bedrooms`, `rooms`, `lat`, `lon`, `ecartee`, `lue`, **chaque valeur datée**. Seul endroit où une valeur a une date. |
| Caches serveur en mémoire | `run.server.ts`, `completerFiche.server.ts`, `gitesGps.server.ts` | Résultats par part (90 s, 15 min pour Airbnb), lectures de fiches (24 h), géocodage (24 h). |

Il n'existe **pas de point unique de normalisation**. Six passes se
recoupent, certaines répétées :

1. Chez chaque collecteur : `annoncer(connu, ...textes)` (`src/lib/stay/occupancy.ts`), le champ publié d'abord, le texte pour les trous. Le worker Python Airbnb (`scrape/airbnb/map.py`) duplique le parseur.
2. `fusionner` (`src/lib/scrape/fusion.ts`) : Airbnb vu par Cozy et Airbnb en direct, champs comblés s'ils sont vides.
3. `locate` (`src/lib/scrape/run.server.ts`) : `occupancyOfListing` puis `attachAccess`, à la sortie de chaque part.
4. `searchStay` (`src/lib/searchStay.ts`) : `dater`, puis `completer` (`enrichirListing`, `fillGitesGps`, `fillFiches` avec `poserReleve` et `poserLecture`, `fillAdresses` Nominatim, `fillTarifs`, `fillDevis`, puis `attachAccess` une seconde fois).
5. Côté client : Logements repasse `enrichirListing` ; Prix enchaîne `connuesDuReleve`, `recopieDuReleve`, `appliquerCorrectifs`, les tranches de complétion (mémoire, pages, fiches), puis `cribler` et `compacter` avant IndexedDB.
6. À la relecture IndexedDB : `versListing`, `rejugerDomaine`, `remesurerRemontee`.

`enrichirListing` (`src/lib/stay/enrichir.ts`) est la fonction la plus
centrale et elle est idempotente, mais elle ne calcule pas l'accès ski et ne
précède aucun stockage unique.

Validation existante : **aucun schéma zod de `Listing`**. Les schémas de
`src/lib/searchStay.ts` valident les critères du séjour ; `Candidate` et
`Connue` dans `src/lib/prix/completion.ts` valident un sous-ensemble sans
bornes (ni entier, ni plage). Les bornes vivent en copies : `takeGuests` et
`takeBeds` (deux copies), `plausible` pour les coordonnées (cinq copies).

Parseurs de texte existants (`src/lib/stay/occupancy.ts`) : capacité par
`GUESTS_RANGE` (« 6/8 personnes » donne 8), `GUESTS_ONE`, `GUESTS_P` (« 8p »),
« accueille », « capacité », « sleeps », « cap. » ; chambres par `BEDROOMS`
(`chambres|bedrooms|ch`) ; pièces par `PIECES`, `T_TYPE`, `F_TYPE` ; « studio »
donne `rooms 1` et `bedrooms 0`. `MULTI_UNITE` (« 2 appartements de 6
personnes ») bloque la capacité. Non gérés : nombres en lettres, « cabine »,
« mezzanine », « coin montagne » ; « 3P » isolé se lit trois voyageurs.
`bedroomsFromRooms` existe mais n'est appelé que par les tests. La seconde passe
`lectureFiche` (JSON-LD `numberOfGuests`, `numberOfBedrooms`, `geo`,
`streetAddress`…) ne comble que les trous et ne marque rien d'autre que
« · fiche » dans `proven`.

### 0.4 Tableau source × champ

Légende : **disponible** = champ structuré ; **dérivable** = à lire dans un
texte (exemple de chaîne brute) ; **absent** ; **pas de logement produit**.
« Adresse » désigne une rue ; la commune, quand elle est publiée, est notée
à part. La colonne « seconde passe » dit ce que `lectureFiche` peut ajouter en
ouvrant la page (`src/lib/stay/priseFiche.ts`, table `PRISES`).

#### Plateformes

| Source | Fichiers | Chambres | Capacité | GPS | Adresse | Commune | Individuel ? | Accès | Seconde passe |
|---|---|---|---|---|---|---|---|---|---|
| Airbnb, direct (worker) | `scrape/airbnb/*.py`, `src/lib/scrape/airbnb.server.ts` | disponible : `bedroomCount`, `bedrooms`, `numberOfBedrooms` ; sinon dérivable : `"subtitle": "8 voyageurs · 3 chambres"`, `{"body": "3 chambres"}` | disponible : `personCapacity`, `guestCapacity`, `maxGuestCapacity` ; sinon dérivable (titre, sous-titre) | disponible : `demandStayListing.location.coordinate.latitude/longitude` | absent | absent | oui, `airbnb.fr/rooms/<id>` | API JSON non officielle (StaysSearch, curl_cffi) | fiche Airbnb (`pdp.py`) : `personCapacity`, `bedroomCount`, `listingLat/Lng`, seulement pour un GPS vide (429) |
| Airbnb via CozyCozy | `src/lib/scrape/cozy.server.ts` | disponible : `subTitleDetails.bedRoomCount` ; sinon dérivable : `subTitle: "4 chambres • 10 personnes"` | disponible : `subTitleDetails.guestCapacity` | disponible : `coordinates.latitude/longitude` | absent | disponible : `locationText`, `cityName` | oui (deeplink déballé) | API JSON interne `/api/getResultList` dans une page Playwright | |
| Abritel via CozyCozy | idem | idem Cozy | idem Cozy | idem Cozy | absent | idem Cozy | oui, `abritel.fr/location-vacances/p…` | idem | GPS et titre (JSON-LD de la fiche) |
| Booking via CozyCozy | idem | idem Cozy | idem Cozy | idem Cozy | absent | idem Cozy | oui, `booking.com/hotel/…` | idem | rien (défi AWS WAF) |
| Booking, direct (worker, repli) | `scrape/booking/*.py`, `src/lib/scrape/booking.server.ts` | disponible : Apollo `numberOfBedrooms`, `bedroomCount` ; sinon dérivable : `Appartement entier • 3 chambres • 8 personnes` (bloc `recommended-units`, si « entier ») | disponible : `occupancy.maxPersons`, `maxGuests` ; sinon même texte | disponible : Apollo `location.latitude/longitude`, `data-atlas-latlng`, `data-lat` ; repli `bookingGps.server.ts` | absent | absent | oui | scraping HTML (curl_cffi, souvent un défi) | rien |
| Gîtes de France | `src/lib/scrape/gites.server.ts`, `gitesGps.server.ts` | disponible : `"numberOfBedrooms"` (JSON-LD du widget ITEA) ; sinon dérivable (titre) | disponible : `"numberOfGuests"`, `"occupancy".maxValue` ; sinon dérivable : `.g2f-accommodationTile-text-capacity` « 4 personnes » | disponible : `"geo"` de la fiche ITEA, `#map-accommodation data-lat/data-lng`. La position par tuile (`drupalSettings.searchResults[].lat/lng`) est lue puis **perdue** | absent | disponible : `"addressLocality"`, `"areaServed"` | oui | Playwright (recherche) + fetch HTML du widget + POST tarif | |
| GreenGo | `src/lib/scrape/greengo.ts`, `.server.ts` | disponible (détail) : `numberOfBedrooms` ; `null` sans détail | disponible (détail) : `maxNumberOfTravellers` ; sans détail, `minMaxNumberOfTravellersAllowed` si hôte à logement unique | disponible : `coordinates{lat,lng}` de l'**établissement** | absent (`postalCode` demandé à l'API, jamais lu) | disponible : `addressFromGmaps.city`, `formattedLocation` | oui, par logement réservable | API GraphQL | rien |

#### Agences de montagne (`src/lib/scrape/agences/`)

| Source | Chambres | Capacité | GPS | Adresse | Commune | Individuel ? | Accès | Seconde passe |
|---|---|---|---|---|---|---|---|---|
| Alpissime | absent au relevé (studio publié : 0) | dérivable : `Appart. • 6 pers. • 37 m²` | disponible : `data-lat`, `data-lng` de l'**immeuble** (plus `jsontab`) | absent | disponible : `.village-wrapper` « Valloire » | oui, fiche datée | HTML | capacité, chambres, titre |
| Cimalpes | dérivable : `12 voyageurs ⸱ 2 chambres ⸱ 85 m²` (studio : 0) | dérivable : même paragraphe | absent au relevé | absent | disponible : `p.lieuproduct` « Val Thorens - Centre & proche centre » | oui, `data-bien-id` | JSON `{html,total}` avec HTML découpé | GPS (« Latitude : … »), titre |
| Madame Vacances | dérivable (fiche AJAX) : `2 Chambre(s), 1 Salle de douche, 1 Terrasse, 1 Cuisine` | disponible : `<b class="text-black">6</b> Pers.` ; modal « Personnes max. » | disponible : `data-lat`, `data-lon` de l'**établissement** | absent | disponible : `p.arial font12` (2e morceau) | un par type de logement (logement non désigné) | HTML + fiche AJAX JSON | |
| Maeva | disponible : `produit_nb_chambres` (`"1"` pour un studio, remis à 0) | disponible : `produit_nb_places` | disponible : `yr`, `xr` de la **résidence** | absent | disponible : `station_name` | oui, par produit | API JSON `dm.php` | |
| Mountain Collection | disponible : `nbChambre` | disponible : `nbPax` | disponible : `geoloc.lat/lng` | absent | disponible : `resort.libelle` | oui | API JSON `ws.mountaincollection.com/search` | |
| Ovo Network | disponible : `bedrooms` (« 3 ») | disponible : `capacity` | disponible : `latitude`, `longitude` | absent | disponible : `location` « Manigod - La Clusaz » | oui | API JSON `/ajax?action=web/portal/search` | |
| Ski-Planet | absent (studio publié : 0) | disponible : `NbpersMax<id>` ; sinon dérivable : « Appartement 3 pièces 5 personnes (742-618) » | table statique par résidence, tirée des fiches archivées (Common Crawl, archive.org) : 2 983 sur 4 196 résidences | absent | disponible : libellé de station | oui | HTML AJAX (`calendrier-residence.php`) + JSON statique | rien (pages derrière un défi) |
| Travelski | disponible (fiche) : `prestations[].numberOfBedrooms` ; sinon dérivable : « Appartement 4 personnes - 1 chambre - Balcon » | disponible : `prestations[].capacity` | disponible (fiche) : `window.lihe.geolocalisation` « 46.193199, 6.77615 » ; `null` tant que la fiche n'est pas lue (mémoire 30 j) | absent | disponible : `stationName` | oui, par logement et formule | API JSON + fiche HTML | rien (le relevé lit la fiche lui-même) |

#### Centrales (`src/lib/scrape/centrales/`)

| Moteur | Hôtes | Chambres | Capacité | Pièces | GPS | Adresse | Commune | Individuel ? | Accès |
|---|---|---|---|---|---|---|---|---|---|
| Open System (moderne) | 1 (Haute Maurienne Vanoise, 4 stations) | absent (studio publié : 0) | disponible : `<li><strong>Capacité : </strong>4 pers.</li>` | dérivable : « Appartement 4 pièces » | disponible : `tabPointCarto.push({latitude:"4.526…e+001", longitude:"6.809…e+000"})` | disponible : `ItemCartoDescrAdresse` | disponible : `NomCommune` | oui | HTML rendu serveur |
| MSEM | 10 (16 stations) | absent | disponible : `maxCapacity` (0 = inconnu, 305 cas sur 2 376) ; sinon dérivable : `"name": "HORIZON - 3 pieces - 8 pers."` | disponible : `nbRooms` | disponible : `lat`, `lng` | disponible : `location.address1/2`, `cp` | disponible : `location.city` | oui | API JSON |
| Ingénie | 27 (50 stations) | disponible : `<span class="NBDECHAMBRE-CHAMBRE3-G">3 chambres</span>` (0 accepté) ; absent chez certains hôtes | disponible : `<span class="NBPERS-10PERS-G">10 personnes</span>` ; sinon dérivable (titre, slug) | disponible : `<li class="GTYPAP-G3PIEC-G">3 pièces</li>` | disponible : JSON-LD `location.geo` (Arêches, Châtel, Valloire) ; absent ailleurs (Risoul, Contamines, Valmeinier) | disponible : JSON-LD `streetAddress` | disponible : `addressLocality` | oui, une fiche peut couvrir plusieurs lots | HTML + JSON-LD |
| Deskline / Feratel | 1 (La Clusaz) | disponible : `services[].bedrooms` | disponible (second appel) : `products[].occupancy.maxAdults` (`maxPersons` non lu) | disponible : `services[].rooms` | disponible : `location.coordinate.lat/long` | absent | disponible : `location.town`, `district` | oui | API JSON |
| Arkiane (LocVacances) | 1 (Pralognan) | disponible (détail) : pavé `fa-bed` « 0 chambre » ; absent sur la carte | disponible : `<li data-name="lot_pax">8 Pers.</li>` ; détail « 4 personnes » | disponible : `lib_lot_type_cial` « 3 pièces » | disponible (détail) : lien Google Maps `query=45.…,6.…` ; « Pas de localisation disponible » sinon | absent | disponible : `lib_imme_station`, quartier | oui | HTML (XHR + détail) |
| iResa | 1 (Les Arcs) | absent (`detailLits` non compté) | disponible : `datas.cap_max` | dérivable : « Appartement 3 pièces cabine 6/8 personnes » | **absent** (pictogramme en pixels) | absent | disponible : `datas.lieu` | oui | HTML + JSON embarqué |
| Orchestra | 1 (La Plagne) | absent | disponible (fiche) : `<strong>Capacité :</strong> 6 Personnes` (`maxPax` est une bande tarifaire, pas la capacité) | disponible (fiche) : `<strong>Type de bien :</strong> 2 pièces` | disponible (fiche) : `<h3>Coordonnées</h3>…45.4567, 6.6949` | disponible (fiche) : `<h3>Adresse</h3>` | disponible : « Village : » | oui | catalogue HTML + calendrier JSON + fiche HTML |
| Non branchés : Open System ancienne génération (10 hôtes), Orchestra Chamonix et Praz-sur-Arly, Diffusio (2), Tourinsoft (1), Resalys (1), sans moteur (7) | 24 hôtes | pas de logement produit | | | | | | | |

À noter : `hotes/combloux.ts` dit « moteur inconnu » alors que
`moteurs.data.json` le donne Orchestra ; le registre affiche Orchestra, mais
l'écran montre la raison du fichier.

#### Relevé figé et mécanismes transverses

| Source | Chambres | Capacité | GPS | Adresse | Individuel ? | Accès |
|---|---|---|---|---|---|---|
| `RELEVE_2A` (`src/lib/listings.ts`, 21 annonces des 2 Alpes, 6 au 13 février 2027) | disponible pour Gîtes et Abritel, absent pour Centrale | disponible sauf Airbnb | disponible pour Airbnb seulement | absent | oui | transcription manuelle, repli `dumpFallback` pour ces seules dates |
| Seconde passe `lectureFiche` (toutes sources ouvrables) | JSON-LD `numberOfBedrooms`, regex « N chambres », Ingénie `crit_GCHAM` | JSON-LD `numberOfGuests`, `personCapacity`, regex « N voyageurs », « Max N personnes » | JSON-LD `geo`, `listingLat/Lng`, `data-lat`, « Latitude : » | JSON-LD `streetAddress`, puis Nominatim si rue numérotée | | ne comble que les trous, marque « · fiche » |
| Mémoire des fiches, recopie entre sœurs, fusion Cozy et direct | `guests`, `bedrooms`, `rooms`, `lat`, `lon` recopiés dans les trous, marques « · mémoire des fiches », « · même logement » | | | | | |

### 0.5 Remontées mécaniques : l'existant face au brief

| Sujet | Brief | Dépôt |
|---|---|---|
| Source | OSM via Overpass, cache SQLite `lifts` | Jeu embarqué : `src/lib/osmLifts.json` (6 313 gares, `{n, k, lat, lon}`) et `src/lib/osmAccess.snapshot.json` (320 stations, 27 011 gares, 1 041 lieux). Libellé : « Gares de remontées OSM / OpenSkiMap, sept. 2026 ». Aucun script de génération, aucune version ni date dans les données. |
| Genres inclus | `cable_car`, `gondola`, `mixed_lift`, `chair_lift`, `drag_lift`, `t-bar`, `j-bar`, `platter`, `rope_tow`, `magic_carpet`, `railway=funicular` | Les mêmes genres, sans filtre : 748 `magic_carpet` comptent comme remontées. |
| Exclusions de cycle de vie | préfixes `disused:`, `abandoned:`, `proposed:`, `construction:`, tags `disused=yes`… | Filtre sur le **nom** (`src/lib/remonteeEnService.ts` : « ancien », « désaffect », « (disused) », `^(project|proposed)`…) et élagage de 716 gares par `scripts/retirer-remontees-hors-service.mjs` d'après `lifts.geojson` d'openskidata.org (`remonteesRetirees.json`). Les tags OSM ne sont pas conservés dans le jeu. |
| Été seul | exclure `seasonal=summer`, `opening_hours` estival | Aucune notion de saison sur les appareils. |
| Table `lifts_overrides` | id OSM, motif, date | Absente. Corrections de domaine (`WINTER_BARRIERS`, `DELIEES`…) et de repère (`GPS_FIXES`) seulement. |
| Gare de référence | départ (aval), premier nœud du way, corrigé par `ele` | **Aucune gare aval choisie** : les deux extrémités sont des points indépendants, la plus proche l'emporte, amont compris (`mateOf` retrouve l'autre). « Arrivée » n'est déduite qu'à l'affichage par l'altitude (`liftSpan.ts`). |
| Position du logement | source, puis Nominatim (adresse), puis centroïde de station, puis inconnu | Source, puis seconde passe (JSON-LD), puis Nominatim pour une **rue numérotée publiée** seulement (`geocodeRue`, cache 24 h, 15 km du centroïde des GPS du relevé). **Jamais de centroïde de station** : une annonce sans position n'est pas placée, elle est écartée des filtres. |
| Calcul | haversine, arrondi à 10 m, `liftsDatasetVersion`, `computedAt` | Haversine R = 6 371 000 m, `Math.round` au mètre, recalcul à chaque lecture IndexedDB (`remesurerRemontee`). Ni version ni date. |
| Domaine | | Notion propre au dépôt : la gare doit être dans le domaine cherché (`domainFit`), sinon `distToLiftM` vaut `null` et `searchedLiftM` garde l'information. |
| Nominatim | 1 requête par seconde, cache, User-Agent | User-Agent `Skitrack/1.0`, délai 8 s, cache 24 h ; la pause de 1 100 ms ne suit que les géocodages **retenus** : un échec enchaîne sans pause. |
| Documentation | `docs/remontees.md` | Aucun document dédié ; les règles sont dans les en-têtes de `remonteeEnService.ts`, `remontees.ts`, `osmAccess.ts`, `domainFit.ts` et `docs/design/v7-ecarts.md` (décisions 12 et 13). |

### 0.6 Affichage et filtres des inconnus

- Libellés (`src/lib/v7.ts`) : `capLbl` donne « capacité non annoncée » ; `bedLbl` donne « chambres non annoncées », « studio » pour 0, ou « N pièces » quand seules les pièces sont connues ; `distanceOf` donne « Distance non communiquée » sans position, « Autre domaine » hors domaine, « {distance} de {remontée} » sinon. Aucun écran n'affiche « 0 chambre » ni « 0 personne » pour un inconnu.
- Filtres de l'écran Logements (`src/routes/logements.tsx`) : « Capacité ≥ » et « Chambres ≥ » laissent passer les inconnus ; « annoncées ≥ » les écartent ; la distance les écarte ; le tri les met en dernier. Il n'y a pas de case « Inclure les logements non renseignés ».
- Écran Prix : `partyVerdict` classe un logement sans capacité `non-annonce`, exclu de la médiane et compté dans « sans capacité annoncée ».
- Distance : « N m de Télésiège des Crêtes », « À vol d'oiseau vers … » hors domaine, et dans la fiche « gare OpenStreetMap la plus proche de la position GPS, dans le domaine recherché ». La mention « à vol d'oiseau » n'est pas systématique.

### 0.7 Points d'insertion

Là où les trois champs et leur statut se poseraient, du plus amont au plus aval :

| Point | Fichier | Verrou | Rôle |
|---|---|---|---|
| Chaque collecteur, à la construction du `Listing` | `src/lib/scrape/*.server.ts`, `agences/*.ts`, `centrales/moteurs/*.server.ts`, `scrape/airbnb/map.py`, `scrape/booking/map.py` | oui | seul endroit qui sait si une valeur est un champ structuré (`extracted`) ou un texte (`derived`, avec la chaîne brute) |
| `annoncer` / `occupancyFromText` / `occupancyFromRecord` | `src/lib/stay/occupancy.ts` | non | les deux parseurs partagés du brief existent ici en germe ; c'est là qu'ajouter le statut et la chaîne brute, et `parseBedrooms` pour « T2 », « 2 pièces cabine » |
| `fusionner` | `src/lib/scrape/fusion.ts` | oui | fusion Cozy et direct : le statut doit suivre la valeur retenue |
| `locate` | `src/lib/scrape/run.server.ts` | oui | `occupancyOfListing` puis `attachAccess` à la sortie de chaque part |
| `enrichirListing` | `src/lib/stay/enrichir.ts` | non | idempotent, appelé partout : candidat naturel pour poser un statut par défaut (`unknown` avec `reason`) sur ce qui manque |
| `poserLecture`, `poserReleve`, `recopierSoeurs`, `comblerDepuisMemoire` | `src/lib/stay/completerFiche.server.ts`, `poserReleve.ts`, `recopie.ts`, `memoireFiches.server.ts` | non | chaque remplissage de trou doit écrire le statut et sa source, au lieu d'une marque dans `proven` |
| `attachAccess`, `nearestLift`, `mateOf` | `src/lib/access.ts`, `osmAccess.ts`, `remontees.ts` | non | calcul de `nearestLift` : gare aval, id OSM, genre, version du jeu, date |
| `searchStay` (`completer`) et `completerReleve` | `src/lib/searchStay.ts` | non | dernier point serveur avant le navigateur : validation zod de sortie possible ici |
| `ecrireAnnonces`, `versListing`, `compacter` | `src/lib/prix/annonces.ts`, `calcul.ts` | non | seule persistance d'annonces : là où un « backfill » aurait un sens, avec `remesurerRemontee` |
| `capLbl`, `bedLbl`, `distanceOf`, filtres | `src/lib/v7.ts`, `routes/logements.tsx`, `components/v7/*` | non | affichage « Non renseigné », case « Inclure les logements non renseignés », mention « à vol d'oiseau » |

### 0.8 Questions avant la phase 1

1. **Pas de SQLite.** Les annonces persistées vivent dans IndexedDB (écran Prix) et la mémoire des fiches dans `fiches.json`. Où voulez-vous la « migration additive » et le « backfill » : sur ces deux stockages, ou faut-il d'abord une base des logements ?
2. **Verrou des scraps.** La phase 2 touche tous les collecteurs. Faut-il un accord par phase, ou préférez-vous que les statuts soient posés en aval, dans `occupancy.ts` et `enrichir.ts` (hors verrou), à partir de ce que les collecteurs rendent déjà (`guests`, `bedrooms`, `rooms`, texte) ? Dans ce second cas, la distinction `extracted` / `derived` serait approchée : `derived` dès que la valeur vient du texte relu, `extracted` quand le collecteur l'a posée, sans savoir s'il l'a lue dans un champ ou dans un titre.
3. **Pièces et chambres.** Aujourd'hui `rooms` reste à part et la conversion « N pièces = N-1 chambres » ne se fait qu'au filtre. Le brief demande de la faire à l'extraction (`derived`). Confirmez-vous, et gardez-vous `rooms` en plus ?
4. **Nom des champs.** `guests` existe ; le brief dit `capacity`. Garder `guests` et ajouter le statut, ou renommer ?
5. **Remontées.** Le jeu embarqué (OSM / OpenSkiMap, sept. 2026, 320 stations) remplace-t-il Overpass, avec un script de génération versionné et la gare aval calculée depuis le way ? Ou voulez-vous Overpass avec cache, comme écrit ? Le jeu actuel n'a ni id OSM, ni tags de cycle de vie, ni sens amont-aval : les trois demandent une regénération.
6. **Centroïde de station.** Le dépôt refuse aujourd'hui toute position estimée. Le brief la veut, marquée `station_centroid`. Confirmez-vous ce changement de règle ?
7. **Domaine.** Faut-il garder la contrainte « gare du domaine cherché » pour `nearestLift`, ou prendre la gare la plus proche quel que soit le domaine, comme le brief le laisse entendre ?

## 1. Décisions après la phase 0 (27 septembre 2026)

Le propriétaire a validé l'inventaire et tranché :

| Sujet | Décision |
|---|---|
| Stockage | Pas de nouvelle base. IndexedDB (annonces retenues par Prix) : version de schéma incrémentée, avec un handler d'upgrade qui ajoute les trois champs au statut `unknown`, raison « annonce antérieure, en attente de rafraîchissement ». `fiches.json` : clés additives seulement, lecture tolérante, datation valeur par valeur pour les nouveaux champs comme pour les autres. La mémoire de l'écran Logements est recalculée à chaque collecte. |
| Backfill | La relecture IndexedDB est le seul endroit possible : toute annonce retenue sans les trois champs repasse par la porte de sortie. Sans texte brut conservé, elle reste `unknown` jusqu'à sa prochaine collecte, qui la remplace. |
| Verrou des collecteurs | Il reste. Les statuts sont posés en aval, selon la règle d'approximation de la section 2. Seule exception, à périmètre fermé : un collecteur peut transmettre en plus, sans toucher à ses sélecteurs ni à sa logique, le texte brut utile dans un champ `raw` (titre, descriptif, chaîne « pièces » chez Orchestra, adresse postale quand elle existe). La liste des collecteurs concernés et le diff attendu pour chacun sont à présenter avant la phase 2. |
| Remontées | Pas d'Overpass à l'exécution : jeu embarqué, régénéré hors exécution par `lifts:build` à partir de l'export OpenSkiMap (`status`, `liftType`, `name`, `sources` avec l'id OSM, géométrie et altitudes). Seules les remontées `status === 'operating'` des types de la liste du brief sont gardées ; le filtrage par nom et l'élagage actuels disparaissent au profit de `status` et d'une table manuelle `lifts_overrides` versionnée. Gare aval = premier sommet de la ligne, corrigé par l'altitude quand les deux extrémités la portent ; l'amont ne concourt plus. Version du jeu = date d'export plus hash du fichier, recopiée dans `nearestLift.liftsDatasetVersion`. `lifts:build` imprime le diff ; `lifts:recompute` recalcule les annonces retenues quand la version change. |
| Six passes | Pas de refonte. Une fonction unique, la porte de sortie, appelée en sortie de `searchStay` et à la relecture IndexedDB, garantit la forme : les trois champs existent avec un statut. Elle vérifie et complète, elle ne réextrait rien. `proven` reste intact. |
| Positions | La règle actuelle reste : aucun centroïde de station, une annonce sans position est écartée. `positionSource` se limite à `'listing' \| 'geocoded_address'`. Le géocodage d'adresse reste celui de la passe existante (Open System, MSEM, Ingénie, Orchestra). `nearestLift.status` vaut `unknown` seulement s'il n'existe aucune remontée `operating` dans l'emprise de la station. |
| Remplisseurs de trous | `poserLecture` et `poserReleve` : `derived`, `raw` conservé. `recopierSoeurs` : `capacity` et `bedrooms` seulement, entre annonces du même logement chez la source, raison `soeur:<id>`. `comblerDepuisMemoire` : `derived`, raison `mémoire:<date de la valeur>`, jamais au-delà de 30 jours. Aucun remplisseur ne touche `nearestLift`, qui ne vient que de `attachAccess`. |
| Hors périmètre | Les 24 hôtes de centrales sans logement : section « à instrumenter » ci-dessous. |

Les autres questions de la section 0.8, tranchées avec le critère donné (ni dépendance nouvelle, ni stockage nouveau, ni changement de collecteur) :

| Question | Choix |
|---|---|
| 3. Pièces et chambres | La conversion « N pièces = N-1 chambres » se fait dans la porte de sortie, au statut `derived`, avec `raw` = « N pièces » et la raison « pièces moins une », quand `bedrooms` manque et que `rooms` est publié. `rooms` reste porté tel quel. Aucun collecteur ne change. |
| 4. Nom des champs | `guests` et `bedrooms` restent les scalaires que les collecteurs produisent ; les champs à statut vivent dans un objet `completude` (`bedrooms`, `capacity`, `nearestLift`) porté par le `Listing` en sortie de porte. Le type `Listing` lui-même n'est pas modifié tant que `src/lib/listings.ts` appartient au chantier en cours : un type d'intersection `ListingComplet` le porte. |
| 6. Centroïde | Retiré par la décision « Positions » ci-dessus. |
| 7. Domaine | `nearestLift` est la remontée la plus proche parmi celles de la station cherchée, sans le verdict de domaine. Les champs existants `distToLiftM` et le verdict `domainFit` ne changent pas : la fiche et les filtres continuent à s'en servir. |

## 2. Règle d'approximation des statuts (phase 1)

Les collecteurs ne sont pas modifiés. Le statut d'un champ se lit donc à sa sortie :

- valeur numérique présente en sortie de collecteur : `extracted` ;
- valeur produite en aval par `occupancy.ts` à partir du texte brut : `derived`, `raw` conservé ;
- valeur produite par un remplisseur de trous : `derived`, `reason` = nom du remplisseur ;
- toujours `null` après la porte de sortie : `unknown`, avec la raison.

Imprécision acceptée : un collecteur qui lit lui-même un titre (tous le font par `annoncer`, et `locate` relit le titre à la sortie de chaque part) rend une valeur qui apparaîtra `extracted`. Seules les lectures faites après la sortie du collecteur, dans `enrichirListing` et les remplisseurs, seront `derived`.

## Annexe : hôtes à instrumenter

Vingt-quatre hôtes de centrales ne produisent aucun logement aujourd'hui. Ils ne font pas partie de ce chantier.

| Moteur | Hôtes | Pourquoi |
|---|---|---|
| Open System, génération ancienne | `reservation.la-toussuire.com`, `reservation.ledevoluy.com`, `reservation.ax-ski.com`, `reservation.montgenevre.com`, `www.valfrejus.com`, `www.gourette.com`, `luz-ardiden.com`, `peyragudes.com`, `www.labresse.net`, `www.prazdelys-sommand.com` | recherche par un widget JavaScript, sans page de résultats à interroger |
| Widget Open System inclus dans un site d'office | `www.matheysine-tourisme.com`, `www.valmorel.com`, `piau-engaly.com` | pas de moteur interrogeable derrière l'empreinte |
| Orchestra | `booking.chamonix.com`, `booking.prazsurarly.com`, `reservation.combloux.com` | catalogue sans identifiant de logement ; Combloux : registre à mettre en cohérence (`hotes/combloux.ts` dit « inconnu », `moteurs.data.json` dit Orchestra) |
| Diffusio | `www.sancy.com`, `www.n-py.com` | grille tarifaire sans dates, durée ni personnes |
| Tourinsoft | `www.valleesdegavarnie.com` | système d'information touristique, pas de total de séjour |
| Resalys | `www.karellis.com` | pas de connecteur |
| Sans moteur | `sites.valdabondance.com`, `www.mole-brasses.com`, `www.haut-giffre.fr`, `font-romeu.fr`, `lesangles.com`, `beuil.fr`, `www.chioula.fr` | aucun moteur de réservation |
