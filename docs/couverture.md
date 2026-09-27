# Couverture du catalogue : ce que les sites montrent, ce que Skitrack produit, ce qui arrive à l'écran

Brief du 27 septembre 2026 « catalogue complet et trois champs ». Phase A :
mesure, sans modification du code. `docs/logements-completude.md` reste
l'inventaire des champs par source.

## 1. Méthode

- **Liste blanche.** Le dépôt rattache 69 hôtes de centrales aux stations (`src/lib/scrape/centrales/moteurs.data.json`, audit du 13 septembre 2026, croisé avec `src/lib/centrales.data.json`, relevé du 19 août 2026). Le brief en annonçait 91 : c'était l'état d'un dépôt antérieur. Les 69 se répartissent sur 11 plateformes ; 42 sont interrogeables aujourd'hui (27 Ingénie, 10 MSEM, un hôte chacun pour Arkiane, Deskline/Feratel, iResa, Open System moderne et Orchestra).
- **Recherche de référence**, identique pour tous les hôtes : arrivée samedi 6 février 2027, départ samedi 13 février 2027 (7 nuits), 2 personnes, sans contrainte de chambres. Pour un hôte qui couvre plusieurs stations, la première station rattachée.
- **Produit par Skitrack** : `chercherCentrale(input)` (`src/lib/scrape/centrales/chercher.server.ts`) appelé une fois par hôte, le 27 septembre 2026 entre 0 h 30 et 0 h 46, un hôte à la fois. Toutes les réponses HTTP des collecteurs ont été enregistrées au passage (aucune requête supplémentaire) : c'est dans ces réponses que le total du site est lu.
- **Visible sur le site** : le compteur que le site publie dans sa propre réponse, selon la plateforme : Ingénie `nb-resultats` ; Deskline `totalRecordCount` ; MSEM le nombre d'offres rendues par son API pour les dates, toutes natures ; Arkiane les cartes du fragment de résultats ; iResa les entrées `__datasPrestations` ; Orchestra les produits du catalogue dont le calendrier a une disponibilité ; Open System les fiches de la rubrique « tous nos hébergements ». Pour les hôtes sans adaptateur, le comptage se fait à la main, dans un navigateur, avec la même recherche (section 2, colonne « méthode »).
- **Classement.** `complet` : Skitrack produit au moins ce que le site annonce. `partiel` : moins, avec le motif observé. `zéro` : rien, avec le motif. Un hôte où le site n'a rien aux dates et Skitrack non plus est `complet`.

## 2. Hôte par hôte

| Hôte | Plateforme | Station de référence | Visible sur le site | Produit par Skitrack | avec position / capacité / chambres | Classement | Motif |
|---|---|---|---|---|---|---|---|
| `www.reservationpralognan.fr` | Arkiane | pralognan-la-vanoise | 2 | 2 | 2 / 2 / 2 | complet |  |
| `beuil.fr` | aucun | beuil-les-launes |0 (portail de catégories, aucun séjour daté ; vérifié le 27 septembre)| 0 |  | zéro | pas de moteur de réservation (site d'information) |
| `font-romeu.fr` | aucun | font-romeu-pyrenees-2000 |0 (portail de catégories, aucun séjour daté ; vérifié le 27 septembre)| 0 |  | zéro | pas de moteur de réservation (site d'information) |
| `lesangles.com` | aucun | les-angles | non vérifiable | 0 |  | zéro | hôte inaccessible : 403 Cloudflare (règle WAF, sans défi) ; classement « pas de moteur » du 13 septembre non vérifiable |
| `sites.valdabondance.com` | aucun | abondance |0 (portail de catégories, aucun séjour daté ; vérifié le 27 septembre)| 0 |  | zéro | pas de moteur de réservation (site d'information) |
| `www.chioula.fr` | aucun | le-chioula |0 (portail de catégories, aucun séjour daté ; vérifié le 27 septembre)| 0 |  | zéro | pas de moteur de réservation (site d'information) |
| `www.haut-giffre.fr` | aucun | sixt-fer-a-cheval |0 (portail de catégories, aucun séjour daté ; vérifié le 27 septembre)| 0 |  | zéro | pas de moteur de réservation (site d'information) |
| `www.mole-brasses.com` | aucun | les-brasses |0 (portail de catégories, aucun séjour daté ; vérifié le 27 septembre)| 0 |  | zéro | pas de moteur de réservation (site d'information) |
| `www.laclusaz.com` | Deskline / Feratel | la-clusaz | 262 | 194 | 179 / 10 / 194 | partiel | pagination tronquée : page de 200 sans suite (68 manquent) |
| `www.n-py.com` | Diffusio | la-mongie-bareges | à compter | 0 |  | zéro | pas d'adaptateur : grille tarifaire sans dates |
| `www.sancy.com` | Diffusio | besse-super-besse | à compter | 0 |  | zéro | pas d'adaptateur : grille tarifaire sans dates |
| `fr.locationlesmenuires.com` | Ingénie | brides-les-bains | 340 | 240 | 238 / 240 / 223 | partiel | pagination tronquée : 10 pages au plus (100 annonces manquent) |
| `fr.locationsaintmartin.com` | Ingénie | saint-martin-de-belleville | 44 | 44 | 44 / 43 / 36 | complet |  |
| `resa.saintlary.com` | Ingénie | saint-lary-soulan | 247 | 192 | 178 / 192 / 190 | partiel | échéance : page 9 non demandée faute de temps (55 annonces manquent) |
| `reservation.areches-beaufort.com` | Ingénie | areches-beaufort | 185 | 100 | 98 / 85 / 99 | partiel | pagination tronquée : 10 pages au plus (85 annonces manquent) |
| `reservation.courchevel.com` | Ingénie | courchevel | 271 | 240 | 234 / 233 / 239 | partiel | pagination tronquée : 10 pages au plus (31 annonces manquent) |
| `reservation.larosiere.net` | Ingénie | la-rosiere-1850 | 120 | 120 | 118 / 111 / 115 | complet |  |
| `reservation.lecollet.com` | Ingénie | le-collet-dallevard | 28 | 28 | 28 / 25 / 14 | complet |  |
| `reservation.legrandbornand.com` | Ingénie | le-grand-bornand | 181 | 0 |  | zéro | adaptateur cassé : les fiches de cet hôte portent un identifiant sans préfixe (`id="G-7934842-7934844"`) que le lecteur ne reconnaît pas (`PRESTATION-` attendu) ; relues avec ce préfixe, 24 fiches par page, toutes avec prix, position et adresse |
| `reservation.les2alpes.com` | Ingénie | les-2-alpes | 420 | 200 | 189 / 181 / 69 | partiel | pagination tronquée : 10 pages au plus (220 annonces manquent) |
| `reservation.lescontamines.com` | Ingénie | les-contamines-montjoie | 68 | 68 | 0 / 5 / 66 | complet |  |
| `reservation.lesorres.com` | Ingénie | les-orres | 366 | 240 | 219 / 237 / 229 | partiel | pagination tronquée : 10 pages au plus (126 annonces manquent) |
| `reservation.lessaisies.com` | Ingénie | bisanne-1500 | 201 | 201 | 194 / 173 / 128 | complet |  |
| `reservation.orcieres.com` | Ingénie | orcieres | 131 | 131 | 123 / 125 / 120 | complet |  |
| `reservation.serre-chevalier.com` | Ingénie | serre-chevalier | 337 | 240 | 234 / 240 / 221 | partiel | pagination tronquée : 10 pages au plus (97 annonces manquent) |
| `reservation.tignes.net` | Ingénie | la-daille | 376 | 200 | 195 / 195 / 200 | partiel | pagination tronquée : 10 pages au plus (176 annonces manquent) |
| `reservation.valdarly-montblanc.com` | Ingénie | crest-voland-cohennoz | 180 | 100 | 100 / 100 / 63 | partiel | pagination tronquée : 10 pages au plus (80 annonces manquent) |
| `www.ballons-hautes-vosges.com` | Ingénie | saint-maurice-sur-moselle | 19 | 19 | 0 / 19 / 19 | complet |  |
| `www.chamrousse.com` | Ingénie | chamrousse | 161 | 161 | 0 / 152 / 122 | complet |  |
| `www.chatel.com` | Ingénie | chatel | 384 | 160 | 160 / 160 / 160 | partiel | échéance : page 9 non demandée faute de temps (224 annonces manquent) |
| `www.gerardmer-reservation.net` | Ingénie | gerardmer | 155 | 155 | 0 / 155 / 14 | complet |  |
| `www.lesrousses.com` | Ingénie | les-rousses | 112 | 112 | 112 / 112 / 32 | complet |  |
| `www.peisey-vallandry.com` | Ingénie | peisey-vallandry | 61 | 61 | 0 / 55 / 40 | complet |  |
| `www.risoul.com` | Ingénie | risoul | 102 | 100 | 0 / 99 / 91 | partiel | pagination tronquée : 10 pages au plus (2 annonces manquent) |
| `www.valdallos.com` | Ingénie | val-dallos-la-foux-le-seignus | 27 | 15 | 15 / 15 / 0 | partiel | filtre : 12 fiches sans bloc de prix (« Voir toutes les disponibilités ») écartées par le lecteur ; 11 des 15 gardées affichent 0 € |
| `www.valloire.com` | Ingénie | valloire | 383 | 100 | 100 / 100 / 100 | partiel | pagination tronquée : 10 pages au plus (283 annonces manquent) |
| `www.valmeinier-reservation.com` | Ingénie | valmeinier | à compter | 50 | 0 / 50 / 50 | à confirmer | total du site non lisible dans les réponses capturées |
| `www.vercors-experience.com` | Ingénie | lans-en-vercors | 54 | 54 | 51 / 54 / 18 | complet |  |
| `www.lesarcs.com` | iResa | les-arcs-bourg-st-maurice | 0 | 24 | 0 / 24 / 24 | complet |  |
| `isola2000.com` | MSEM | isola-2000 | 14 | 14 | 14 / 13 / 13 | complet |  |
| `reservation.alpedhuez.com` | MSEM | alpe-d-huez | 478 | 457 | 457 / 456 / 456 | partiel | types de bien ignorés : 21 offres de nature HOTEL écartées par le collecteur |
| `reservation.saintfrancoislongchamp.com` | MSEM | saint-francois-longchamp | 131 | 131 | 131 / 131 / 131 | complet |  |
| `reservation.vars.com` | MSEM | les-claux | 75 | 75 | 75 / 73 / 73 | complet |  |
| `www.flaine.com` | MSEM | flaine | à compter | 0 |  | zéro | pas d'adaptateur |
| `www.montclar.com` | MSEM | saint-jean-montclar | 1 | 1 | 1 / 1 / 0 | complet |  |
| `www.paysdesecrins.com` | MSEM | puy-saint-vincent | 61 | 61 | 61 / 61 / 60 | complet |  |
| `www.saintefoy-reservation.com` | MSEM | sainte-foy-tarentaise | 21 | 21 | 21 / 21 / 21 | complet |  |
| `www.valberg.com` | MSEM | valberg | 20 | 20 | 20 / 20 / 20 | complet |  |
| `www.villarddelans-correnconenvercors.com` | MSEM | correncon-en-vercors | 136 | 132 | 132 / 132 / 131 | partiel | types de bien ignorés : 4 offres de nature HOTEL écartées par le collecteur |
| `luz-ardiden.com` | Open System | luz-ardiden | à compter | 0 |  | zéro | pas d'adaptateur : génération ancienne, recherche par widget JavaScript |
| `peyragudes.com` | Open System | peyragudes | à compter | 0 |  | zéro | pas d'adaptateur : génération ancienne, recherche par widget JavaScript |
| `piau-engaly.com` | Open System | piau-engaly | à compter | 0 |  | zéro | pas d'adaptateur : génération ancienne, recherche par widget JavaScript |
| `reservation.ax-ski.com` | Open System | ax-3-domaines | à compter | 0 |  | zéro | pas d'adaptateur : génération ancienne, recherche par widget JavaScript |
| `reservation.haute-maurienne-vanoise.com` | Open System | aussois | 664 (compteur nbresultat de la rubrique « tous nos hébergements » ; 252 particuliers, 409 professionnels) | 98 | 98 / 95 / 95 | partiel | pagination tronquée : le site pagine par un identifiant de conversation (CVID) que le collecteur n'envoie pas, chaque page rend alors les 50 mêmes fiches ; recette établie (section 3) |
| `reservation.la-toussuire.com` | Open System | la-toussuire | à compter | 0 |  | zéro | pas d'adaptateur : génération ancienne, recherche par widget JavaScript |
| `reservation.ledevoluy.com` | Open System | la-joue-du-loup | à compter | 0 |  | zéro | pas d'adaptateur : génération ancienne, recherche par widget JavaScript |
| `reservation.montgenevre.com` | Open System | montgenevre | à compter | 0 |  | zéro | pas d'adaptateur : génération ancienne, recherche par widget JavaScript |
| `www.gourette.com` | Open System | gourette | à compter | 0 |  | zéro | pas d'adaptateur : génération ancienne, recherche par widget JavaScript |
| `www.labresse.net` | Open System | la-bresse-hohneck | à compter | 0 |  | zéro | pas d'adaptateur : génération ancienne, recherche par widget JavaScript |
| `www.matheysine-tourisme.com` | Open System | alpe-du-grand-serre | à compter | 0 |  | zéro | pas d'adaptateur : génération ancienne, recherche par widget JavaScript |
| `www.prazdelys-sommand.com` | Open System | praz-de-lys-sommand | à compter | 0 |  | zéro | pas d'adaptateur : génération ancienne, recherche par widget JavaScript |
| `www.valfrejus.com` | Open System | valfrejus | à compter | 0 |  | zéro | pas d'adaptateur : génération ancienne, recherche par widget JavaScript |
| `www.valmorel.com` | Open System | valmorel | à compter | 0 |  | zéro | pas d'adaptateur : génération ancienne, recherche par widget JavaScript |
| `booking.chamonix.com` | Orchestra | chamonix | à compter | 0 |  | zéro | pas d'adaptateur : catalogue sans identifiant de logement |
| `booking.prazsurarly.com` | Orchestra | praz-sur-arly | à compter | 0 |  | zéro | pas d'adaptateur : catalogue sans identifiant de logement |
| `reservation.combloux.com` | Orchestra | combloux | à compter | 0 |  | zéro | plateforme non identifiée dans le registre (Orchestra probable) |
| `www.laplagneresort.com` | Orchestra | aime-2000 | 9 | 5 | 5 / 5 / 5 | partiel | filtre trop strict : 4 produits disponibles écartés (bande de personnes, durée) |
| `www.karellis.com` | Resalys | les-karellis | à compter | 0 |  | zéro | pas d'adaptateur |
| `www.valleesdegavarnie.com` | Tourinsoft | gavarnie-gedre | à compter | 0 |  | zéro | pas d'adaptateur : système d'information touristique, pas de total de séjour |

Lecture des motifs :

- **Pagination tronquée, Ingénie.** Le collecteur s'arrête à 10 pages (`src/lib/scrape/centrales/moteurs/ingenie.ts`, `PAGES_MAX`), entre 10 et 24 fiches par page selon l'hôte. Les 2 Alpes 200 sur 420, Tignes 200 sur 376, Châtel 160 sur 384, Valloire 100 sur 383, Les Orres 240 sur 366, Les Menuires 240 sur 340, Serre Chevalier 240 sur 337, Courchevel 240 sur 271, Saint-Lary 192 sur 247, Arêches 100 sur 185, Val d'Arly 100 sur 180. Soit 1 466 annonces non lues sur ces onze hôtes.
- **Adaptateur cassé, Le Grand-Bornand.** Le site annonce 181 résultats, le collecteur rend « rien de disponible à ces dates ». À expliquer par la réponse capturée (section 3).
- **Pagination tronquée, Deskline.** Une page de 200, sans demander la suite : 194 sur 262 à La Clusaz.
- **Types de bien ignorés, MSEM.** Le collecteur garde les natures `MEUBLE`, `RESIDENCE`, `HOUSE` et écarte `HOTEL` (21 à l'Alpe d'Huez, 4 à Villard-de-Lans). À accepter ou non par le propriétaire : le brief compte « tous types de bien, hôtel si le site en propose ».
- **Pagination inopérante, Open System moderne.** 50 fiches par rubrique et une pagination qui ne répond pas : 98 annonces produites pour Haute Maurienne Vanoise, total du site inconnu.
- **Filtre trop strict, Orchestra.** 9 produits ont une disponibilité à La Plagne, 5 sont rendus.
- **Zéro.** 27 hôtes sans adaptateur : 13 Open System de génération ancienne ou widget inclus, 3 Orchestra, 2 Diffusio, 1 Tourinsoft, 1 Resalys, 7 sites sans moteur de réservation.

## 3. Ce que chaque plateforme publie, et à quel niveau

Niveaux : N1 page ou API de liste ; N2 page de détail ; N3 données embarquées dans une page ; N4 point d'accès que le site appelle lui-même ; N5 document lié ou copie hors site. La colonne « niveau lu aujourd'hui » dit où le code pose la valeur ; « niveau où le champ existe » dit le moins profond où il a été trouvé pour au moins une annonce, avec l'URL et la chaîne brute. Preuves : `scratchpad/couverture/profondeur/<plateforme>/` de la session du 27 septembre 2026 (pages téléchargées, journaux Playwright, rapports).

### 3.1 Centrales, plateformes relues sur site

| Plateforme | Chambres | Personnes | Coordonnées | Adresse |
|---|---|---|---|---|
| **Ingénie** (27 hôtes) | N1 chez les gabarits à critères (`<span class="NBDECHAMBRE-CHAMBRE3-G">3 chambres</span>`, Grand-Bornand, Tignes, Châtel, Arêches) ; **N2** ailleurs : Gérardmer `<li class="GNCHME-G">…<li class="GNCHME-GCHN01-G">1 Chambre</li>` ; Chamrousse par dénombrement des blocs `GCHAM1-I`, `GCHAM2-I` ; Les Rousses `LRRNBCHAMBRE` (« Coin(s) nuit », pas une chambre) ; Risoul : un bloc `GCHAM1-G` sans nombre. Lu aujourd'hui : N1 seulement, puis le titre. | N1 : `<span class="ICAPACITE-6PERS-I">6 personnes</span>`, « 70 m² 6 personnes 2 chambres » ; Risoul : absent comme critère à N1, N2, N3, N4, titre seul (`Appartement 2 pièces 6 couchages Antarès 209`) ; Gérardmer : titre `APPARTEMENT 38m² 4 PERSONNES` | N1 chez les gabarits à JSON-LD par fiche (`"geo":{"latitude":"45.945906","longitude":"6.429399"}`, Grand-Bornand, Les Rousses, 2 Alpes, Tignes, Châtel) ; **N2 + N3** chez les sept hôtes sans JSON-LD de liste : Risoul `<em>Latitude : 44.62204</em>` / `<meta itemprop="latitude" content="44.62204" />` / `data-map-lat="44.62204" data-map-long="6.62952"` ; Chamrousse `blocGoogleMap.listeCoord = [{"nom":…,"latitude":"45.10665","longitude":"5.87306"` ; Gérardmer `Latitude : 48.06030`. Lu aujourd'hui : N1 seulement (0 position chez ces sept hôtes). | N1 dans le JSON-LD de liste (`"streetAddress":"63 route de la Communaille, Le Grand-Bornand village"`) ; **N2** partout ailleurs : `<div class="Adresse-LigneAdresse1"><span class="valeur">Bâtiment Antares</span></div> <div class="Adresse-LigneAdresse2"><span class="valeur">829 route de chérine</span></div> <div class="Adresse-CodePostal"><span class="valeur">05600</span>` (Risoul), `230 rue des chardons bleus`, 38410 (Chamrousse), `219 CHEMIN DE LA RAYEE` (Gérardmer). Lu aujourd'hui : N1 seulement. |
| **Open System, génération moderne** (Haute Maurienne Vanoise) | **À aucun niveau N1 à N5 en champ propre** : N1 (bloc `InfoProduit` : type et capacité seulement, « chambre » dans 3 descriptions libres), N2 sur deux fiches `/dp7-…` et `/dp75-…`, N3, N4 (`json-planning-openpro` : `cmin`, `cmax`), N5 (aucun document). Preuves : `profondeur/open-system/`. | N1 : `<li><strong>Capacité : </strong>2 pers.</li>` (44/50 fiches pr7, 50/50 pr75, 47/50 pr93) ; N2 : `<span class="LibelleIco">Capacité</span> <span class="InfoIco"> 2 pers.</span>` ; N4 : `cmin:1,cmax:2` | N1 : `tabPointCarto.push({ cle:"item3209", latitude:"4.526054274308790e+001", longitude:"6.809270381927490e+000", … })` (50/50) ; N3 sur le détail : `L.marker([45.2946604633844, 6.9334804147685], …)` | N1 : `<div class="ItemCartoDescrAdresse"> 25 rue de l'Eglise<br> 73500 LA NORMA</div>` et `<span class="NomCommune">VILLARODIN BOURGET</span>` (50/50) ; N2 : `<div class="adresse"> La Faugogne du Mas<br> 73480 VAL CENIS LANSLEVILLARD </div>` |
| **Sites sans moteur** (Abondance, Les Brasses, Sixt-Fer-à-Cheval, Font-Romeu, Beuil, Le Chioula ; Les Angles : 403 Cloudflare, non vérifiable) | absent (Beuil : un intervalle « Du studio au 3 pièces, les gîtes communaux… ») | absent | absent pour les hébergements (les points N3 trouvés sont ceux de commerces ou de l'office de tourisme) | absent (Le Chioula : l'adresse de la station) |

### 3.2 Plateformes hors centrales, d'après le code et ses fixtures (aucune requête)

| Source | Chambres | Personnes | Coordonnées | Adresse |
|---|---|---|---|---|
| Airbnb, direct | N1 (API StaysSearch) : clés `bedroomCount`…, sinon `structuredContent[].body` « 3 chambres » ; N4 (fiche PDP `PdpPlatformSections`) : `sharingConfig.title` « Appartement · Morzine · ★4,75 · 2 chambres · 3 lits… » ; souvent `null` (« Les chambres n'y sont pas chiffrées ») | N1 : `"subtitle": "8 voyageurs · 3 chambres"` ; N4 : `"eventDataLogging": {"personCapacity": 4, …}` ; N2 (`rooms/<id>`, seulement sans GPS) : `"personCapacity":8` | N1 : `"demandStayListing": {"location": {"coordinate": {"latitude": 45.0565, "longitude": 6.0777}}}` ; N4 : `listingLat`, `listingLng` | **Aucun niveau lu.** La commune existe à N4 (2e morceau de `sharingConfig.title`, « Morzine ») et est sautée exprès ; N2 : `addressLocality` du JSON-LD si la page est ouverte. |
| Airbnb, Abritel, Booking via CozyCozy | N1 (API `/api/getResultList`) : `subTitleDetails.bedRoomCount`, sinon `subTitle: "4 chambres • 10 personnes"` | N1 : `subTitleDetails.guestCapacity: 10` | N1 : `coordinates: { latitude: 45.0222, longitude: 6.1255 }` ; Booking : N2 `fillBookingGps` ; Abritel : N2 JSON-LD | N1, commune : `locationText: "Les Deux Alpes"`. Aucune rue à aucun niveau lu. Booking : la fiche répond 202 (AWS WAF). |
| Booking, direct | N1 (tuile « entier ») puis N3 (index Apollo) : `"numberOfBedrooms":3` ; `Appartement entier • 3 chambres • 8 personnes` | N1 puis N3 : `"occupancy":{"maxPersons":8}` | N3 Apollo `location.latitude/longitude`, N1 `data-atlas-latlng="45.0106,6.1226"`, N2 page hôtel (12 fiches au plus), N4 opportuniste | **Aucun niveau lu.** |
| Gîtes de France | N2 (fiche ITEA) : `"numberOfBedrooms":3` ; la tuile n'en publie pas | N2 : `"numberOfGuests":"9"` ; N1 : `.g2f-accommodationTile-text-capacity` « 4 personnes » | N2 : `"geo":{"latitude":"45.0106","longitude":"6.1226"}` ou `#map-accommodation data-lat/data-lng` ; **N3 lu mais perdu** : `drupalSettings.searchResults[].{lat,lng}` sert au tri, jamais posé | N2, commune : `"addressLocality":"Les Deux Alpes"` ; pas de rue lue |
| GreenGo | N4 (détail `DynamicHABF`) seulement : `"numberOfBedrooms":1` | N4 : `"maxNumberOfTravellers":12` ; N1 pour un hôte à logement unique (`minMaxNumberOfTravellersAllowed{min:4,max:4}`) | N1 : `"coordinates":{"lat":46.1901749,"lng":6.6732397}` (établissement) | N1, commune : `addressFromGmaps.city` ; **`postalCode` demandé et jamais lu** ; pas de rue |
| Alpissime | **Aucun niveau lu** (studio : 0) ; N2 (fiche) d'après `priseFiche.ts`, sélecteur non prouvé par une fixture | N1 : `<p class="small mb-1"> Appart. &bull; 4 pers. &bull; 29 m² </p>` | N1 : `data-lat="45.165874" data-lng="6.434137"` (immeuble) ; N3 : `var jsontab = JSON.parse('{"743":{"lat":"45.165874","lon":"6.434137","title":"Residence Valoria",…` | N1, village : `<div class="village-wrapper">…<span>Valloire</span>` ; pas de rue |
| Cimalpes | N1 : `12 voyageurs ⸱ 2 chambres ⸱ 85 m²` (studio : 0) | N1 : même paragraphe | **N1 : rien** ; N2 (fiche) « Latitude : … » d'après `priseFiche.ts`, aucune fixture de fiche | N1 : `<p class="lieuproduct">Val Thorens - Centre & proche centre` |
| Madame Vacances | N4 (AJAX de la fiche) : `2 Chambre(s), 1 Salle de douche, 1 Terrasse, 1 Cuisine` | N4 : `<b class="text-black">6</b>&nbsp;Pers.` | N1 : `data-lon="6.125397" data-lat="45.017657"` (établissement) | N1, station : `Alpes du Nord, Les Deux Alpes, Appartement` |
| Maeva | N1 (API) : `"produit_nb_chambres":"1"` (studio remis à 0) | N1 : `"produit_nb_places":"4"` | N1 : `"yr":46.19222143,"xr":6.77676623` (résidence) | N1, station : `"station_name":"Avoriaz"` |
| Mountain Collection | N1 (API) : `"nbChambre":2` | N1 : `"nbPax":6` | N1 : `"geoloc":{"lat":45.01002,"lng":6.12434}` | N1, station : `"resort":{"libelle":"Les 2 Alpes"}` ; `residence.libelle` (« MEIJOTEL ») non lu |
| Ovo Network | N1 (API) : `"bedrooms":"3"` | N1 : `"capacity":6` ; `max_adults` (« 8 » sur 4 biens) non lu | N1 : `"latitude":"45.90702","longitude":"6.44175"` | N1, commune : `"location":"La Clusaz"` ; pages HTML derrière Cloudflare |
| Ski-Planet | **Aucun niveau lu** (studio : 0) ; le calendrier N4 porte `<input type="hidden" id="NbChambre69622" value="0"/>`, non lu, toujours 0 dans les fixtures : à vérifier avant de s'y fier | N4 (calendrier) : `id="NbpersMax69622" value="5"` ; libellé « Appartement 3 pièces 5 personnes » | N5 (table depuis les fiches archivées) : `id="googlemap_carte" data-latitude="46.19047" data-longitude="6.77798"` ; 2 983 résidences sur 4 196 ; le site est derrière Cloudflare Turnstile | N5, station : `"nom_station": "Avoriaz"` ; pas de commune fine ni de rue |
| Travelski | N3 (fiche, `window.lihe`) : `"numberOfBedrooms":"1"` ; sinon le nom de l'offre « Appartement 6 personnes - 2 chambres - Balcon » | N1 (API) : `"capacity":4` | N3 (fiche) : `"geolocalisation":"46.193199, 6.77615"` ; se complète sur plusieurs relevés (mémoire 30 jours) | N1, station : `"stationName": "Avoriaz"` |
| Seconde passe `lectureFiche` (toute fiche ouverte) | N2/N3 : JSON-LD `numberOfBedrooms`, regex « N chambres », Ingénie `crit_GCHAM`, `GTYPAP-GnPIEC` | JSON-LD `personCapacity`, `numberOfGuests`, `occupancy.maxValue`, regex « N voyageurs », « Max. N personnes », Ingénie `GCAPAC-GCAP08` | JSON-LD `geo` (hors point d'entreprise), `listingLat`, `itemprop="latitude"`, « Latitude : », `data-atlas-latlng`, `data-lat` | JSON-LD `addressLocality` → commune ; `streetAddress` lue mais jamais posée (sert au géocodage seulement) |

Niveaux publiés et non exploités, relevés dans le code : la position par tuile de Gîtes de France (N3) ; `postalCode` GreenGo (N1) ; `max_adults` Ovo (N1) ; `NbChambre` Ski-Planet (N4, valeur à vérifier) ; la commune Airbnb à N4, sautée exprès ; `residence.libelle` Mountain Collection ; l'index Apollo non joint dans le repli Playwright de Booking ; `maxPersons` Feratel (adultes et enfants additionnés, refusé exprès) ; la rue lue par `lectureFiche` et jamais posée.

<!-- TABLEAU_PROFONDEUR_SUITE -->

## 4. Pertes en aval, entre le collecteur et l'écran

Cartographie des points de perte (relecture du code, 27 septembre 2026). Un
point « silencieux » n'est ni compté ni signalé à l'écran.

### 4.1 Serveur, toutes sources

| Point | Fichier | Règle | Effet | Signalé ? |
|---|---|---|---|---|
| Cozy, tuiles | `src/lib/scrape/cozy.server.ts` (`cozyListings`) | sans nom, hôtel seul, sans lien, doublon d'identifiant, Airbnb sans `/rooms/` | écartées avant le compte du rapport | non |
| Fusion Airbnb | `src/lib/scrape/fusion.ts` | Cozy et direct fondus par clé `airbnb:<id>` ; direct sans clé sûre jamais fusionné | doublons fondus | note « Cozy X, direct Y, communes Z », qu'aucun écran n'affiche |
| Repli figé | `src/lib/scrape/run.server.ts` (`applyDump`) | Les 2 Alpes, 6 au 13 février 2027 seulement ; **une seule ligne par source** est ajoutée (la source entre dans `liveSources` dès sa première ligne) | tronque le repli | non |
| Délais | `run.server.ts` (`ECHEANCE_PART_MS` 40 s, `MARGE_COZY_MS`), `searchStay.ts` (`SEARCH_PART_MS` 52 s) | une part coupée rend ce qu'elle a lu, ou rien | tronque ou vide | Prix : « partiel » ; Logements : repli figé silencieux |
| Cache | `run.server.ts` | réponse gardée 90 s (15 min pour Airbnb) ; une relance dégradée ne remplace pas un relevé complet | remplace | non |
| Gîtes non vérifié | `searchStay.ts` (`completer`), `stay/tarif.ts` (`estOffreGitesVerifiee`), `stay/ficheGites.ts` | sans devis ITEA daté ou fiche introuvable : écartée | écarte | non, le rapport Gîtes compte avant le filtre |

### 4.2 Écran Logements (`src/routes/logements.tsx`)

| Point | Règle | Catégorie | Signalé ? |
|---|---|---|---|
| Remplacement par source (`mergeLive`, `stay.ts`) | toute source citée dans un rapport, même à 0 ou en échec, efface ses lignes figées | autre | non |
| Repli client sur le figé | part vide, délai (58 s, 76 s pour Gîtes et centrales) ou erreur : le figé remplace le direct | autre | non |
| Filtre Gîtes (l. 447) | `!estFicheGitesIntrouvable && estOffreGitesVerifiee` ; `raw` en sortie est la base de tous les comptes de l'écran | Gîtes non vérifié | non |
| Capacité fixe (l. 521) | `guests == null \|\| guests >= voyageurs` : une capacité non annoncée passe | capacité | seulement si la liste devient vide |
| Chambres fixe (l. 529) | `normalizedBedrooms` (chambres, sinon pièces moins une) | capacité | idem |
| Zone fixe (l. 541) | `geoReasonFor` : autre domaine non relié, département étranger (Gîtes), ou repère à plus de 12 km | hors emprise | idem, rayon réglable |
| **GPS fixe (l. 547)** | `gpsPrecis` : **sans position, écartée** | sans position | texte fixe du panneau, aucun compte |
| Disponibilité fixe (l. 553) | `availabilityOf(...).status === "confirmed"` : sans URL, sans prix, autres dates, sans `scannedAt` (tous les replis), plus de 6 h | dates / prix | idem |
| Jetons retirables | budget, prix par personne, capacité annoncée, chambres annoncées, distance, source, mesurée, lien, photo, prix relevé, position, complète | divers | jeton avec compte |
| Regroupement (`stay/regroupement.ts`) | offres du même logement derrière la moins chère (clé Cozy, ou titre et position à 150 m) | doublon | « Airbnb + 2 », « N logements · M offres » |
| Cadre de carte | `partagerParBornes` : hors cadre masqué | limite d'affichage | « N logements dans le cadre » |
| Pagination | 18 par page | pagination d'écran | pages |

### 4.3 Écran Prix (`src/lib/prix/calcul.ts`, `cribler`)

| Point | Règle | Catégorie | Signalé ? |
|---|---|---|---|
| Hors sujet (`prix/horsSujet.ts`) | hôtel, mobil-home, chambre d'hôtes, auberge, hors de France | type de bien | non |
| Gîtes non vérifié, repli, devise, « à partir de » | `offreRecevable` | dates / prix | non |
| Emprise | `geoReasonFor` 12 km, puis **remontée à 2 km au plus** (`DISTANCE_STATION_M`) ; distance inconnue : écartée | hors emprise | non |
| **Sans position** | `gpsPrecis` | sans position | non |
| Capacité (`partyVerdict`) | `non-annonce` (sans capacité, ni chambres ni pièces) exclue de la médiane ; `trop-petit` | capacité | « X sans capacité annoncée, Y trop petites » |
| Regroupement | médiane sur la principale seulement | doublon | « N logements » |
| Fiche Airbnb écartée (`airbnbFiches.ts`) | hôtel, chambre, insolite | type de bien | journal seulement |
| Élagage | 4 000 résultats les plus récents gardés | limite | non |

### 4.4 Plafonds codés en dur dans la collecte

| Source | Plafond | Effet quand il est atteint |
|---|---|---|
| Airbnb direct | 12 requêtes StaysSearch par relevé (`scrape/airbnb/stays.py`), 24 pages par emprise, 280 annonces par emprise, capacité et type écartés au collecteur | **silencieux** : l'épuisement du budget avec des emprises restantes ne pose pas `partiel` |
| CozyCozy | 200 par page × 15 pages par fournisseur, attente 10 s d'une recherche complète, `minBedRoomCount` envoyé | silencieux |
| Booking | GPS pour 12 fiches au plus en 14 s | les autres restent sans position, donc invisibles |
| Gîtes de France | 6 pages, **24 tuiles les plus proches** seulement, 40 devis ITEA, 40 GPS | les autres gîtes sont écartés (sans devis) |
| GreenGo | 60 détails, rayon 6 km | sans détail, pas de prix, donc masqué |
| Agences | Alpissime 9 × 20, Cimalpes 26 × 10, Maeva 30 × 10, Ovo 500 en une page, Travelski 100 × 6, Ski-Planet une tâche par station | notes de source, non affichées |
| Centrales | Ingénie 10 pages, Deskline 200 × 20, Arkiane 50 × 10, Open System 50 par rubrique | la part Centrale ne pose jamais de note |

### 4.5 Mesure sur deux stations

<!-- PERTES_AVAL -->

Sur les seules centrales de la section 2, les annonces produites **sans position** (donc écartées de Logements et de Prix) : Chamrousse 161, Gérardmer 155, Risoul 100, Les Contamines 68, Peisey-Vallandry 61, Valmeinier 50, Les Arcs 24, Ballons des Hautes-Vosges 19, plus les trous partiels (Les 2 Alpes 11, Les Orres 21, La Clusaz 15…) : environ 700 annonces invisibles pour ce seul motif.

## 5. Plan ordonné

<!-- PLAN -->

## 6. Motifs acceptés

Aucun encore. Motifs acceptés d'avance par le brief : plateforme qui exige un compte client, agrégateur sans API (Booking, Airbnb), blocage anti-robot.
