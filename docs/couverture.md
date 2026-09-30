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
| `www.reservationpralognan.fr` | Arkiane | pralognan-la-vanoise | 57 offres aux dates (le formulaire du site n'a pas de champ personnes) | 2 | 2 / 2 / 2 | partiel | filtre trop strict : `lot_pax\|2` exige exactement 2 couchages ; les 55 lots de 3 à 11 couchages, qui logent 2 personnes, sont exclus |
| `beuil.fr` | aucun | beuil-les-launes |0 (portail de catégories, aucun séjour daté ; vérifié le 27 septembre)| 0 |  | zéro | pas de moteur de réservation (site d'information) |
| `font-romeu.fr` | aucun | font-romeu-pyrenees-2000 |0 (portail de catégories, aucun séjour daté ; vérifié le 27 septembre)| 0 |  | zéro | pas de moteur de réservation (site d'information) |
| `lesangles.com` | aucun | les-angles | non vérifiable | 0 |  | zéro | hôte inaccessible : 403 Cloudflare (règle WAF, sans défi) ; classement « pas de moteur » du 13 septembre non vérifiable |
| `sites.valdabondance.com` | aucun | abondance |0 (portail de catégories, aucun séjour daté ; vérifié le 27 septembre)| 0 |  | zéro | pas de moteur de réservation (site d'information) |
| `www.chioula.fr` | aucun | le-chioula |0 (portail de catégories, aucun séjour daté ; vérifié le 27 septembre)| 0 |  | zéro | pas de moteur de réservation (site d'information) |
| `www.haut-giffre.fr` | aucun | sixt-fer-a-cheval |0 (portail de catégories, aucun séjour daté ; vérifié le 27 septembre)| 0 |  | zéro | pas de moteur de réservation (site d'information) |
| `www.mole-brasses.com` | aucun | les-brasses |0 (portail de catégories, aucun séjour daté ; vérifié le 27 septembre)| 0 |  | zéro | pas de moteur de réservation (site d'information) |
| `www.laclusaz.com` | Deskline / Feratel | la-clusaz | 262 (257 le 30 septembre) | 194 | 179 / 10 / 194 | partiel | pagination tronquée : le service numérote ses pages à partir de 1 ; le collecteur demande `pageNo=0` puis `pageNo=1`, la même page deux fois, et s'arrête. `pageNo=2` rend les 57 suivantes (union 257 = compteur) ; 11 hôtels écartés par la règle du collecteur |
| `www.n-py.com` | Alliance Réseaux (Open System) sur Drupal, et non Diffusio | la-mongie-bareges | 175 séjours datés à Grand Tourmalet (186 en appartements seuls le 27 septembre), avec total du séjour | 0 |  | zéro | pas d'adaptateur, plateforme mal identifiée : `POST /fr/alliance/accommodation-hot` rend 50 séjours par page avec `capacite`, `geo`, `lieu` et `total_price` ; c'est aussi le moteur de Gourette, Luz-Ardiden, Peyragudes et Piau-Engaly |
| `www.sancy.com` | Diffusio | besse-super-besse | 133 hébergements « réservation en ligne » aux dates pour le massif (Besse 19, Mont-Dore 36) | 0 |  | zéro | pas d'adaptateur ; grille tarifaire (« Semaine : de 330 à 680 € »), aucun total de séjour, réservation chez le propriétaire : aucun prix de séjour à relever |
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
| `www.valdallos.com` | Ingénie | val-dallos-la-foux-le-seignus | 27 | 15 | 15 / 15 / 0 | partiel | aucun prix publié : 12 fiches sans bloc de tarif et 11 à « 0 € » ; le planning du site n'a aucun tarif pour la semaine (`data-semaine-tarif` vide), la location se traite par courriel. Depuis le 30 septembre, sur consigne du propriétaire, les fiches sans prix ne sont plus gardées (1 fiche à 700 € sur la page 1) |
| `www.valloire.com` | Ingénie | valloire | 383 | 100 | 100 / 100 / 100 | partiel | pagination tronquée : 10 pages au plus (283 annonces manquent) |
| `www.valmeinier-reservation.com` | Ingénie | valmeinier | à compter | 50 | 0 / 50 / 50 | à confirmer | total du site non lisible dans les réponses capturées |
| `www.vercors-experience.com` | Ingénie | lans-en-vercors | 54 | 54 | 51 / 54 / 18 | complet |  |
| `www.lesarcs.com` | iResa | les-arcs-bourg-st-maurice | 261 (258 le 27 septembre ; `__datasTotalResult`, 11 pages) | 24 | 0 / 24 / 24 | partiel | pagination tronquée : le collecteur ne lit que la première page ; la suite vient de `POST /ajax/loadMore` (12 par appel, même session, dédoublonner par identifiant) |
| `isola2000.com` | MSEM | isola-2000 | 14 | 14 | 14 / 13 / 13 | complet |  |
| `reservation.alpedhuez.com` | MSEM | alpe-d-huez | 478 | 457 | 457 / 456 / 456 | partiel | types de bien ignorés : 21 offres de nature HOTEL écartées par le collecteur |
| `reservation.saintfrancoislongchamp.com` | MSEM | saint-francois-longchamp | 131 | 131 | 131 / 131 / 131 | complet |  |
| `reservation.vars.com` | MSEM | les-claux | 75 | 75 | 75 / 73 / 73 | complet |  |
| `www.flaine.com` | MSEM | flaine | 145 (API d'offres aux dates, relue le 27 septembre ; 142 hors hôtels une fois jointes au catalogue) | 0 |  | zéro | délai dépassé : le `POST …/resort/320/offers` n'a pas répondu en 30 s (`TIMEOUT_MS` de `msem.server.ts`), il a répondu en 15,5 s à la reprise ; l'adaptateur existe (`hotes/flaine.ts`) |
| `www.montclar.com` | MSEM | saint-jean-montclar | 1 | 1 | 1 / 1 / 0 | complet |  |
| `www.paysdesecrins.com` | MSEM | puy-saint-vincent | 61 | 61 | 61 / 61 / 60 | complet |  |
| `www.saintefoy-reservation.com` | MSEM | sainte-foy-tarentaise | 21 | 21 | 21 / 21 / 21 | complet |  |
| `www.valberg.com` | MSEM | valberg | 20 | 20 | 20 / 20 / 20 | complet |  |
| `www.villarddelans-correnconenvercors.com` | MSEM | correncon-en-vercors | 136 | 132 | 132 / 132 / 131 | partiel | types de bien ignorés : 4 offres de nature HOTEL écartées par le collecteur |
| `luz-ardiden.com` | réservation sur N'PY (Alliance Réseaux) | luz-ardiden | 6 fiches, sans dates, sur l'hôte | 0 |  | zéro | pas de moteur daté sur l'hôte : la recherche datée s'ouvre sur www.n-py.com |
| `peyragudes.com` | réservation sur N'PY (Alliance Réseaux) | peyragudes | 0 sur l'hôte | 0 |  | zéro | pas de moteur daté sur l'hôte : tous les liens mènent à www.n-py.com |
| `piau-engaly.com` | réservation sur N'PY (Alliance Réseaux) | piau-engaly | 0 sur l'hôte | 0 |  | zéro | pas de moteur daté sur l'hôte : le widget ouvre www.n-py.com |
| `reservation.ax-ski.com` | Open System | ax-3-domaines | 49 (compteur du widget après recherche ; 116 au catalogue, 49 disponibles) | 0 |  | zéro | pas d'adaptateur : génération ancienne, résultats par JSONP (`etape-rest.for-system.com`), le HTML servi est une coquille |
| `reservation.haute-maurienne-vanoise.com` | Open System | aussois | 664 (compteur nbresultat de la rubrique « tous nos hébergements » ; 252 particuliers, 409 professionnels) | 98 | 98 / 95 / 95 | partiel | pagination tronquée : le site pagine par un identifiant de conversation (CVID) que le collecteur n'envoie pas, chaque page rend alors les 50 mêmes fiches ; recette établie (section 3) |
| `reservation.la-toussuire.com` | Open System | la-toussuire | 155 (compteur du widget, « 1 sur 13 » ; 456 au catalogue) | 0 |  | zéro | pas d'adaptateur : génération ancienne, résultats par JSONP, le HTML servi est une coquille |
| `reservation.ledevoluy.com` | Open System | la-joue-du-loup | 88 (compteur du widget ; 213 au catalogue) | 0 |  | zéro | pas d'adaptateur : génération ancienne, résultats par JSONP, le HTML servi est une coquille |
| `reservation.montgenevre.com` | Open System | montgenevre | 48 (compteur du widget ; 190 au catalogue) | 0 |  | zéro | pas d'adaptateur : génération ancienne, résultats par JSONP, le HTML servi est une coquille |
| `www.gourette.com` | réservation sur N'PY (Alliance Réseaux) | gourette | 105 hébergements locatifs, sans dates, sur l'hôte | 0 |  | zéro | pas de moteur daté sur l'hôte : la recherche datée s'ouvre sur www.n-py.com |
| `www.labresse.net` | Open System, génération ancienne | la-bresse-hohneck | 99 meublés aux dates (et 15 chambres d'hôtes sans prix) | 0 |  | zéro | pas d'adaptateur ; la page inscrite est l'accueil, le formulaire envoie vers `/locations-de-vacances/?opensystem_du=…` qui porte les prix datés en HTML simple ; l'ordre des résultats change d'un chargement à l'autre |
| `www.matheysine-tourisme.com` | Apidae, avec un widget Open System par fiche | alpe-du-grand-serre | 204 gîtes et meublés sans dates (63 à l'Alpe du Grand Serre) | 0 |  | zéro | pas de liste datée : seule chaque fiche a un moteur daté (Open System produit) |
| `www.prazdelys-sommand.com` | Apidae et Elloha, et non Open System | praz-de-lys-sommand | 110 meublés et gîtes aux dates (222 sans dates) ; hôtels et résidences non mesurés | 0 |  | zéro | pas d'adaptateur, plateforme mal identifiée : `POST /cms/wp-admin/admin-ajax.php` (filtre `elloha-availablity`) rend 10 cartes par page, `_count` 110 |
| `www.valfrejus.com` | Open System | valfrejus | non vérifiable | 0 |  | zéro | hôte inaccessible : 403 Cloudflare dès `robots.txt` (anti-robot, motif accepté d'avance) ; plateforme Open System d'après l'audit du 13 septembre |
| `www.valmorel.com` | Open System, génération ancienne | valmorel | 243 aux dates, sur `reservation.valmorel.com` (661 au catalogue) | 0 |  | zéro | pas d'adaptateur : la centrale est sur un autre hôte, absent de la liste ; même widget JSONP que La Toussuire |
| `booking.chamonix.com` | Orchestra, gabarit « pmb » | chamonix | 303 | 0 |  | zéro | pas d'adaptateur ; le motif du registre (« sans identifiant de logement ») est faux, chaque carte porte `data-product` ; obstacle réel : le calendrier pmb n'a pas de niveau de bande, `prixOrchestra` y rend `null` |
| `booking.prazsurarly.com` | Orchestra, gabarit « pmb » | praz-sur-arly | 0 (aucun résultat en février 2027, facettes toutes à 0) | 0 |  | complet | rien aux dates, sur le site comme dans Skitrack |
| `reservation.combloux.com` | Orchestra, gabarit « pmb » | combloux | 62 | 0 |  | zéro | pas d'adaptateur : moteur identifié (Orchestra pmb), `hotes/combloux.ts` le déclare « inconnu » |
| `www.laplagneresort.com` | Orchestra | aime-2000 | 84 (liste `/serp`, 20 par page) | 5 | 5 / 5 / 5 | partiel | catalogue partiel : le collecteur lit la vitrine `/destinations/plagne-aime-2000` (9 logements) au lieu de la liste `/serp`, que `robots.txt` interdit ; 4 des 9 n'ont pas de départ le 6 février |
| `www.karellis.com` | Resalys (Septeo) | les-karellis | 14 propositions pour 7 établissements, sur `www.karellis-reservation.com` (10 aux dates exactes, 4 à dates proches) | 0 |  | zéro | pas d'adaptateur : `GET /wp-json/api-campings/v2/wpAjaxEtablissementInfo` rend les propositions datées avec prix |
| `www.valleesdegavarnie.com` | Tourinsoft | gavarnie-gedre | 56 locations et 7 hébergements collectifs (Gavarnie et Gèdre), sans dates | 0 |  | zéro | pas de moteur daté : système d'information touristique, « à partir de » et contact du propriétaire |

Bilan au 30 septembre 2026 : 20 hôtes complets, 20 partiels, 28 à zéro, 1 à confirmer (Valmeinier, dont le gabarit ne publie pas de compteur).

Lecture des motifs :

- **Pagination tronquée, Ingénie.** Le collecteur s'arrête à 10 pages (`src/lib/scrape/centrales/moteurs/ingenie.ts`, `PAGES_MAX`), entre 10 et 24 fiches par page selon l'hôte. Les 2 Alpes 200 sur 420, Tignes 200 sur 376, Châtel 160 sur 384, Valloire 100 sur 383, Les Orres 240 sur 366, Les Menuires 240 sur 340, Serre Chevalier 240 sur 337, Courchevel 240 sur 271, Saint-Lary 192 sur 247, Arêches 100 sur 185, Val d'Arly 100 sur 180. Soit 1 466 annonces non lues sur ces onze hôtes.
- **Adaptateur cassé, Le Grand-Bornand.** Le site annonce 181 résultats, le collecteur rend « rien de disponible à ces dates ». Cause établie : les fiches portent `id="G-7934842-7934844"`, sans le préfixe `PRESTATION-` que `lireIngenie` attend, et sans `data-ga-item-id` ; chaque fiche est sautée. Relue avec le préfixe, la même page rend 24 fiches sur 24, toutes avec prix, position et adresse. Seul hôte du parc dans ce cas.
- **Fiches sans prix, Val d'Allos.** 12 des 24 fiches de la page n'ont aucun bloc de tarif (« Voir toutes les disponibilités ») ; le site les compte, le collecteur les écarte. Des 12 gardées, 11 affichent 0 €.
- **Échéance, Châtel et Saint-Lary.** La page 9 n'est pas demandée faute de temps dans la part (40 s), avant même le plafond de 10 pages.
- **Pagination tronquée, Deskline.** Le service numérote ses pages à partir de 1 ; le collecteur demande `pageNo=0` puis `pageNo=1`, deux fois la même page de 200, et conclut qu'il n'y a pas de suite. `pageNo=2` rend les 57 autres (257 au 30 septembre). Le commentaire de `feratel.ts` (« le service ne tourne pas les pages ») est faux.
- **Pagination tronquée, iResa.** Le collecteur ne lit que la page du POST de recherche (24) ; la page affiche 261 résultats et charge la suite par `POST /ajax/loadMore`, 12 par appel.
- **Filtre trop strict, Arkiane.** Le critère `lot_pax` demande une capacité égale au nombre de voyageurs : 2 lots sur 57 à Pralognan.
- **Types de bien ignorés, MSEM.** Le collecteur garde les natures `MEUBLE`, `RESIDENCE`, `HOUSE` et écarte `HOTEL` (21 à l'Alpe d'Huez, 4 à Villard-de-Lans). À accepter ou non par le propriétaire : le brief compte « tous types de bien, hôtel si le site en propose ».
- **Pagination inopérante, Open System moderne.** 50 fiches par rubrique et une pagination qui ne répond pas : 98 annonces produites pour Haute Maurienne Vanoise, total du site inconnu.
- **Catalogue partiel, Orchestra à La Plagne.** Le collecteur lit une vitrine de 9 logements ; la liste du site en compte 84 aux dates. La liste `/serp` est interdite par `robots.txt` (`Disallow: /*serp?`), ce qui explique le choix du collecteur. Des 9 de la vitrine, 4 n'ont simplement aucun départ le 6 février.
- **Délai dépassé, MSEM à Flaine.** L'adaptateur existe ; l'API d'offres de Flaine est lente (plus de 30 s à la mesure, 15,5 s à la reprise) et le collecteur coupe à 30 s. 145 offres aux dates.
- **Open System, génération ancienne.** Le même widget partout (`AllianceReseaux`) : le HTML servi est une coquille, la liste arrive par JSONP (`etape-rest.for-system.com`, par blocs, avec un `ConversationId`), les fiches par `map-jsonp.open-system.fr/data/…/catalogue.js`. Quatre hôtes comptés : 155 + 88 + 49 + 48 = 340 annonces aux dates. `robots.txt` : Montgenèvre `Disallow: /` ; Ax interdit l'appel de session du widget ; les trois hôtes tiers du widget `Disallow: /`. La politique du dépôt (lire, journaliser, extraire quand même) s'applique ; c'est noté ici pour que la décision reste la vôtre.
- **Zéro.** 28 hôtes, regroupés par ce qui les motorise réellement (le registre du 13 septembre se trompait pour cinq d'entre eux) :

  | Plateforme réelle | Hôtes | Annonces aux dates sur le site | Motif |
  |---|---|---|---|
  | Open System, génération ancienne (widget JSONP) | La Toussuire, Le Dévoluy, Ax, Montgenèvre, Valmorel (`reservation.valmorel.com`), La Bresse | 155 + 88 + 49 + 48 + 243 + 99 = 682 | pas d'adaptateur |
  | Alliance Réseaux sur N'PY (Drupal) | `www.n-py.com` ; Gourette, Luz-Ardiden, Peyragudes et Piau-Engaly y renvoient leur recherche | 175 à Grand Tourmalet ; les autres stations N'PY non comptées | pas d'adaptateur, classé à tort « Diffusio » |
  | Orchestra, gabarit « pmb » | Chamonix, Combloux | 303 + 62 = 365 | pas d'adaptateur ; calendrier sans niveau de bande |
  | Apidae et Elloha | Praz de Lys Sommand | 110 | pas d'adaptateur, classé à tort « Open System » |
  | Resalys (Septeo) | Les Karellis | 14 propositions | pas d'adaptateur |
  | Ingénie | Le Grand-Bornand | 181 | adaptateur cassé (identifiant) |
  | MSEM | Flaine | 145 | délai dépassé |
  | Apidae, moteur par fiche seulement | Matheysine (Alpe du Grand Serre) | aucune liste datée (204 non datés) | pas de liste datée |
  | Diffusio | Sancy | 133 non réservables en ligne au sens d'un total de séjour | grille tarifaire, sans total |
  | Tourinsoft | Vallées de Gavarnie | aucune liste datée (63 non datés) | système d'information touristique |
  | Sans moteur | Abondance, Les Brasses, Sixt-Fer-à-Cheval, Font-Romeu, Beuil, Le Chioula | 0 | site d'information |
  | Anti-robot | Les Angles, Valfréjus | non vérifiable | 403 Cloudflare |

## 3. Ce que chaque plateforme publie, et à quel niveau

Niveaux : N1 page ou API de liste ; N2 page de détail ; N3 données embarquées dans une page ; N4 point d'accès que le site appelle lui-même ; N5 document lié ou copie hors site. La colonne « niveau lu aujourd'hui » dit où le code pose la valeur ; « niveau où le champ existe » dit le moins profond où il a été trouvé pour au moins une annonce, avec l'URL et la chaîne brute. Preuves : `scratchpad/couverture/profondeur/<plateforme>/` de la session du 27 septembre 2026 (pages téléchargées, journaux Playwright, rapports).

### 3.1 Centrales, plateformes relues sur site

| Plateforme | Chambres | Personnes | Coordonnées | Adresse |
|---|---|---|---|---|
| **Ingénie** (27 hôtes) | N1 chez les gabarits à critères (`<span class="NBDECHAMBRE-CHAMBRE3-G">3 chambres</span>`, Grand-Bornand, Tignes, Châtel, Arêches) ; **N2** ailleurs : Gérardmer `<li class="GNCHME-G">…<li class="GNCHME-GCHN01-G">1 Chambre</li>` ; Chamrousse par dénombrement des blocs `GCHAM1-I`, `GCHAM2-I` ; Les Rousses `LRRNBCHAMBRE` (« Coin(s) nuit », pas une chambre) ; Risoul : un bloc `GCHAM1-G` sans nombre. Lu aujourd'hui : N1 seulement, puis le titre. | N1 : `<span class="ICAPACITE-6PERS-I">6 personnes</span>`, « 70 m² 6 personnes 2 chambres » ; Risoul : absent comme critère à N1, N2, N3, N4, titre seul (`Appartement 2 pièces 6 couchages Antarès 209`) ; Gérardmer : titre `APPARTEMENT 38m² 4 PERSONNES` | N1 chez les gabarits à JSON-LD par fiche (`"geo":{"latitude":"45.945906","longitude":"6.429399"}`, Grand-Bornand, Les Rousses, 2 Alpes, Tignes, Châtel) ; **N2 + N3** chez les sept hôtes sans JSON-LD de liste : Risoul `<em>Latitude : 44.62204</em>` / `<meta itemprop="latitude" content="44.62204" />` / `data-map-lat="44.62204" data-map-long="6.62952"` ; Chamrousse `blocGoogleMap.listeCoord = [{"nom":…,"latitude":"45.10665","longitude":"5.87306"` ; Gérardmer `Latitude : 48.06030`. Lu aujourd'hui : N1 seulement (0 position chez ces sept hôtes). | N1 dans le JSON-LD de liste (`"streetAddress":"63 route de la Communaille, Le Grand-Bornand village"`) ; **N2** partout ailleurs : `<div class="Adresse-LigneAdresse1"><span class="valeur">Bâtiment Antares</span></div> <div class="Adresse-LigneAdresse2"><span class="valeur">829 route de chérine</span></div> <div class="Adresse-CodePostal"><span class="valeur">05600</span>` (Risoul), `230 rue des chardons bleus`, 38410 (Chamrousse), `219 CHEMIN DE LA RAYEE` (Gérardmer). Lu aujourd'hui : N1 seulement. |
| **Open System, génération moderne** (Haute Maurienne Vanoise) | **À aucun niveau N1 à N5 en champ propre** : N1 (bloc `InfoProduit` : type et capacité seulement, « chambre » dans 3 descriptions libres), N2 sur deux fiches `/dp7-…` et `/dp75-…`, N3, N4 (`json-planning-openpro` : `cmin`, `cmax`), N5 (aucun document). Preuves : `profondeur/open-system/`. | N1 : `<li><strong>Capacité : </strong>2 pers.</li>` (44/50 fiches pr7, 50/50 pr75, 47/50 pr93) ; N2 : `<span class="LibelleIco">Capacité</span> <span class="InfoIco"> 2 pers.</span>` ; N4 : `cmin:1,cmax:2` | N1 : `tabPointCarto.push({ cle:"item3209", latitude:"4.526054274308790e+001", longitude:"6.809270381927490e+000", … })` (50/50) ; N3 sur le détail : `L.marker([45.2946604633844, 6.9334804147685], …)` | N1 : `<div class="ItemCartoDescrAdresse"> 25 rue de l'Eglise<br> 73500 LA NORMA</div>` et `<span class="NomCommune">VILLARODIN BOURGET</span>` (50/50) ; N2 : `<div class="adresse"> La Faugogne du Mas<br> 73480 VAL CENIS LANSLEVILLARD </div>` |
| **MSEM** (10 hôtes ; relu sur l'Alpe d'Huez et Flaine) | **N3** : `__NEXT_DATA__` de la fiche, `https://reservation.alpedhuez.com/hebergements/ecrin-d-huez-611/` → `"capacity":{"maxCapacity":7,…,"nbRooms":3,"nbBedrooms":2,…}` ; **N4** : `POST https://services.msem.tech/api/lodging/accomodation/7106` (appel de la fiche) → même bloc. N1 n'a pas de clé chambres (`nbRooms` = pièces, confirmé : 3 pièces, 2 chambres). Flaine n'a pas de page par logement (la fiche est une route du widget) et le N4 y rend `"nbBedrooms":null` sur le logement lu. Lu aujourd'hui : aucun niveau. | N1 : catalogue `…/resort/125/OT-125?language=fr` → `"maxCapacity":7` ; à Flaine 62 sur 369 à 0, le titre seul porte la capacité (« Appartement 6 personnes ») | N1 : `"lat":45.08812713623047,"lng":6.077051639556885` au catalogue ; N3/N4 : `"marker":{"lat":…,"lng":…}` | N1 : `"location":{"address1":"96 RUE DU RIF BRILLANT","cp":"38750","city":"Alpe d'Huez",…}` ; rue pour 666 sur 955 à l'Alpe d'Huez, souvent un nom de résidence ou de secteur à Flaine (« Flaine Forêt ») |
| **Open System, génération ancienne** (13 hôtes ; relu sur La Toussuire, Le Dévoluy, Ax, Montgenèvre) | **À aucun niveau N1 à N5 en champ propre pour les meublés** (l'essentiel) : N1 donne le type (`<li class="TypeHebe">… Appartement 4 pièces </li>`), N2 un texte libre (`CHAMBRE(S): 1 chambre double … 1 chambre familiale …`), N4 (`map-jsonp.open-system.fr/data/heli/108340/71/catalogue.js`) n'a pas de clé chambres ; `"nbchambres":{"fr":"38"}` n'existe que pour les hôtels, et c'est le nombre de chambres de l'établissement. N5 : aucun document. | N1 : `<li class="Capacite"><i class="fa fa-bed"></i> de 1 à 10 pers. </li>` ; N4 : `"capacite":1,"capacitemax":10` | **N4 seulement** : `…/data/heli/108340/71/catalogue.js` → `"latitude":45.258104,"longitude":6.26328` ; tout le catalogue d'un coup dans `…/osform/39802/3655/8199/vueinfo.js` (`"cle":"OSHO-5861",…,"lat":45.255072,"lng":6.258213`). N1 à N3 : aucune coordonnée dans le DOM. | N1 : `<div class="add-libre"> Appt 101, résidence Sylodges </div> <div class="add"><strong> 73300 LA TOUSSUIRE </strong></div>` ; N4 : `"localisation":{…,"cp":"73300","ville":"LA TOUSSUIRE","adresselibre":"Appt 101, résidence Sylodges",…}` |
| Open System ancien, suite (Valmorel, La Bresse) | Valmorel : absent pour les meublés à N1 à N5 (même `catalogue.js`, sans clé chambres). La Bresse, dont les meublés viennent d'Ingénie relayé par Open System : **N2**, texte libre seulement (« Il comprend 3 chambres séparées, pour un accueil jusqu'à 5 personnes ») | Valmorel N1 : `<li><i class="fa fa-bed"></i>2</li>`, N4 `"capacite":1,"capacitemax":2` ; La Bresse N1, titre de carte (« Chalet 4 personnes »), N4 `"CapaciteMax":5` | Valmorel N4 (`vueinfo.js`, les 661 d'un coup) ; La Bresse **N3**, JSON-LD de la fiche `"geo":{…"latitude":48.0056556,"longitude":6.88066449999997}` | Valmorel N1 commune, N2 rue (`HAMEAU DE CREVE COEUR`) ; La Bresse N1 commune, N3 rue (`"streetAddress":"4 Rue des Noisettes"`) |
| **Alliance Réseaux sur N'PY** (`www.n-py.com`, et les quatre stations qui y renvoient) | **Aucun champ numérique** : texte libre de la fiche (« Chambre avec un lit en 160 ») et du champ `body` de la liste pour 12 fiches sur 50 (« 2 chambres avec lits doubles ») | N1 : `<span class="capacite">8</span>` ; N4 `"capacite":"4"` | N3 (liste) : `"geo":[42.872,-0.0084],"lieu":"LUZ ST SAUVEUR"` ; N4 `POST /fr/alliance/accommodation-hot` | N1, commune (`LUZ ST SAUVEUR`) ; rue pour les hôtels seulement (`11 Rue Ramond. - . BAREGES`) |
| **Deskline / Feratel** (La Clusaz) | **N2** : `<li …>Chambres: 1</li>` ; N4 dans la liste : `"rooms": 2, "bedrooms": 1` | N2 : `max. 4 personnes` ; N4 de la fiche : `maxAdults` 4 (le site affiche celui-là ; `maxPersons` 7 additionne adultes et enfants) | N3 : JSON-LD de la fiche `"geo": {…"latitude": 45.9072…}` ; N4 : liste `"coordinate": { "lat": 45.9072, "long": 6.42983 }` (239 sur 262) | N2 : `272 route de la Piscine, 74220 LA CLUSAZ` ; N4 de la fiche : `"addressType": 0, "address1": "272 route de la Piscine"` (les types 1 et 2 sont l'agence) |
| **Arkiane** (Pralognan) | **N2** : `<div class="font-weight-bold text-center mt-2">1 chambre</div>` ; absent à N1 | N1 : `<span class=" unit">2&nbsp;Pers.</span>` | **N2** : lien de carte `query=45.381658,6.723064` | N1 commune (`Pralognan la Vanoise`), N2 quartier (« Le Grand Couloir ») ; **rue absente de N1 à N5** (la seule rue est celle de l'agence) |
| **iResa** (Les Arcs) | **Aucun nombre à N1 à N4** : texte libre (`"detailLits":"Séjour : 1 canapé lit … Chambre : 2 lits superposés…"`) ; le filtre « Nombre de chambres » existe mais n'est renseigné pour aucun bien | N1 : `"cap_max":"4"` | **Absentes à N1 à N5** : un pictogramme posé en pixels sur l'image d'un plan (`data-original-x="944"`) | N1, village et lieu (`"prestationTrail":{…"Bourg-Saint-Maurice","46":"Centre ville"}`) ; rue absente |
| **Orchestra** (La Plagne, gabarit maison) | **Absent à N1 à N4** ; seules les pièces sont publiées (`Studio`, facette `NB_ROOMS`) ; N5 : `/package/pdf?s_pid=98786`, interdit par `robots.txt`, non lu | N2 : `<strong>Capacité :</strong> 5 Personnes` ; N1 dans le titre quand il l'écrit | N2 : `45.51098088, 6.667800` ; N3 : `data-map-latlng='[45.51098,6.6678]'` | N2 : résidence et commune (`Résidence AIME 2000<br/>PLAGNE AIME 2000<br/>73210`), pas de rue |
| **Orchestra, gabarit « pmb »** (Chamonix, Combloux) | Pas de champ par annonce à N1 à N3 ; N4 : facette « Nombre de chambres » avec ses comptes (`"ROOMS_CMB"`, 1 chambre 81, 2 chambres 87) ; Combloux : texte libre | Chamonix N2 : `Capacité : 4 Personnes` ; Combloux : pas de bloc capacité, catégorie tarifaire `"Appartement 4 personnes"` en N4 | N1/N3 : `data-geolocation` (`"coordinates":[6.869,45.926]`) sur la page de résultats | Chamonix N2 : `54 place du Prarion<br>LES HOUCHES<br>74310` ; Combloux **N1** avec la rue : `"location":"50 Route de Sallanches 74920 Combloux France"` |
| **Apidae et Elloha** (Praz de Lys Sommand) | **Absent comme nombre** à N1 à N5 (un filtre « chambres » seulement) | N2 : `Capacité maximum possible : 4` ; N3 : « pour 6 personnes » dans `markers_preload` | N3 (liste) : `"markers_preload":[{"latitude":46.14616,"longitude":6.588031` ; N4 `markers[]` | N1 commune (`Taninges`) ; N3 rue (`"streetAddress":"1323 Route de Chevaly Praz de Lys"`) |
| **Resalys** (Les Karellis) | **N2** (onglet de la fiche) : `Appartement 4/5 pers - 2 chambres` ; N4 : `get_offers_v3`, GraphQL Resalys | N1 : `1 Appartement 4/5 pers - 5 pers max` ; N4 `"paxMax":5,"pax":4` | N3 et N4, **par établissement** : `data-latitude="45.22915907212688"` ; `"ws_etablissement_latitude"` | N2 commune (`73870 MONTRICHER ALBANNE`) ; N4 rue par établissement (`"ws_etablissement_street":"18 ROUTE DU MOLLARD LONG"`) |
| **Diffusio** (Sancy) | **N2** : `<li>1 chambre</li>` | N1 : `Capacité : 4 personnes` | N3 (liste) : `"mapItems":{"TFO2800884":{…"marker":[45.516415,2.950316]` (133 sur 133) | N1 commune ; N2 rue (`9 rue Marcel Gauthier … 63610 Super-Besse`) |
| **Tourinsoft** (Gavarnie) | N1 dans le titre (« CHEZ PHILOU – 4 CHAMBRES ») ; **N2** en champ : `Nb de chambres … 3` | N1 dans le titre (« LE SOUMAOUTE (8 PERS) ») ; N2 : `Nb de personnnes … 10` | N3 (liste) : `data-lat="42.8247817" data-lng="0.0373201"` | N1 commune ; N2 rue (`3 Route des Trois Cirques<br> 65120 GEDRE`) |
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

Mesure du 30 septembre 2026 : les six parts lancées une à une par `runLiveSearch` (Avoriaz, puis Les 2 Alpes ; 6 au 13 février 2027, 2 personnes), puis les règles des écrans Logements et Prix rejouées hors ligne sur leurs sorties. Chaque annonce retirée est comptée sous la première règle qu'elle échoue, dans l'ordre de l'écran. Le rejeu ne fait pas les compléments réseau de `completer` (fiches, devis, GPS) : les chiffres « sans position » et « capacité muette » sont des bornes hautes pour une première recherche. Détail et exemples : `scratchpad/couverture/aval/`.

**Avoriaz, écran Logements**

| Source | Sortie du collecteur | Hors emprise 12 km | Sans position | Dates ou prix | Regroupées sous une autre offre | Affichées |
|---|---:|---:|---:|---:|---:|---:|
| Airbnb | 401 | 0 | 0 | 0 | 43 | 358 |
| Booking | 1 429 | 119 | 0 | 0 | 533 | 777 |
| Abritel | 1 384 | 63 | 0 | 0 | 88 | 1 233 |
| GreenGo | 3 | 1 | 0 | 0 | 0 | 2 |
| Maeva | 73 | 0 | 0 | 20 | 0 | 53 |
| Ski-Planet | 97 | 0 | 0 | 34 | 0 | 63 |
| Travelski | 216 | 0 | 100 | 59 | 0 | 57 |
| **Total** | **3 603** | **183** | **100** | **113** | **664** | **2 543** |

**Les 2 Alpes, écran Logements**

| Source | Sortie du collecteur | Gîtes non vérifié | Hors emprise 12 km | Sans position | Dates ou prix | Regroupées | Affichées |
|---|---:|---:|---:|---:|---:|---:|---:|
| Airbnb | 364 | 0 | 119 | 0 | 0 | 12 | 233 |
| Gîtes de France | 20 | 12 | 5 | 0 | 0 | 0 | 3 |
| Abritel | 558 | 0 | 0 | 0 | 0 | 15 | 543 |
| Booking | 320 | 0 | 0 | 0 | 0 | 84 | 236 |
| Centrale | 160 | 0 | 1 | 8 | 0 | 0 | 151 |
| GreenGo | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| Maeva | 266 | 0 | 0 | 0 | 30 | 0 | 236 |
| Travelski | 565 | 0 | 2 | 408 | 73 | 0 | 82 |
| Ski-Planet | 30 | 0 | 0 | 0 | 0 | 0 | 30 |
| Mountain Collection | 26 | 0 | 0 | 0 | 0 | 0 | 26 |
| Madame Vacances | 5 | 0 | 0 | 0 | 0 | 0 | 5 |
| Cimalpes | 8 | 0 | 0 | 8 | 0 | 0 | 0 |
| **Total** | **2 323** | **12** | **127** | **424** | **103** | **111** | **1 546** |

**Écran Prix** : 2 165 logements retenus à Avoriaz (médiane 2 573 €), 1 379 aux 2 Alpes (médiane 1 731 €). Principales pertes : regroupement (617 et 100), capacité muette exclue de la médiane (209 et 159, surtout Airbnb), hors emprise (174 et 127), dates ou prix (143 et 264, Travelski surtout), sans position (50 et 233, Travelski et Cimalpes), à plus de 2 km d'une remontée (141 et 7), type de bien (84 et 12).

Ce que ces deux mesures ajoutent au tableau :

1. **Travelski sans position** : 100 annonces à Avoriaz et 408 aux 2 Alpes, invisibles. Le collecteur ne lit que 17 ou 18 fiches par recherche (N3, `window.lihe`) et laisse les autres « au relevé suivant ». C'est la plus grosse perte à l'écran, devant toutes les centrales.
2. **Formules avec forfait à total nul** : Maeva 20 et 30, Ski-Planet 34, Travelski 55 et 68, écartées pour « dates ou prix ». Leur prix n'est connu que pour un nombre d'adultes égal à la base de la formule ; aux autres, le collecteur pose un total de 0 plutôt que d'ajouter un forfait au récapitulatif (règle du 26 septembre), et l'offre disparaît.
3. **Doubles cartes d'une même source** : la formule hébergement seul et la formule forfait d'un même bien forment deux cartes (13 paires Mountain Collection, 6 Travelski, 2 Ski-Planet) ; `regroupement.ts` ne réunit jamais deux offres d'une même source.
4. **Pertes non signalées** : l'écran Prix calcule sa médiane sans marquer aucune source comme partielle, alors que la centrale des 2 Alpes rend 160 fiches sur 415 (le compteur est journalisé, pas rendu), que Gîtes de France s'arrête sur un 403 en page 2 (20 tuiles sur 106), et que les notes des agences (« laissées en route », « la lecture continue », « fiches laissées au relevé suivant ») ne sont reconnues par aucun motif. Airbnb lit 390 annonces sur 712 publiées à Avoriaz, 364 sur 992 aux 2 Alpes.
5. **Booking** perd 36 annonces avant la sortie du collecteur, dans `cozyListings`, sans motif journalisé.
6. **Blocage** : `www.gites-de-france.com` a répondu 403 en page 2 aux 2 Alpes ; l'opérateur n'est pas identifié (pas d'en-tête `cf-mitigated`).

Sur les seules centrales de la section 2, les annonces produites **sans position** (donc écartées de Logements et de Prix) : Chamrousse 161, Gérardmer 155, Risoul 100, Les Contamines 68, Peisey-Vallandry 61, Valmeinier 50, Les Arcs 24, Ballons des Hautes-Vosges 19, plus les trous partiels (Les 2 Alpes 11, Les Orres 21, La Clusaz 15…) : environ 700 annonces invisibles pour ce seul motif.

## 5. Plan ordonné

Ordre : d'abord ce qui débloque le plus d'hôtes et de champs, à coût égal ce qui rend le plus d'annonces à l'écran. Les gains sont ceux mesurés sur la recherche de référence (6 au 13 février 2027, 2 personnes), pas des estimations. Chaque étape se clôt par la relance de la mesure de la phase A sur ses hôtes et la mise à jour de ce document.

| Rang | Chantier | Hôtes | Annonces à gagner | Champs débloqués | Travail |
|---|---|---:|---:|---|---|
| 1 | **Ingénie** | 27 | 1 466 (pagination) + 181 (Grand-Bornand) + 12 (Val d'Allos, selon la décision ci-dessous) | coordonnées, adresse et chambres à N2 pour les hôtes sans JSON-LD de liste : 614 annonces aujourd'hui sans position (Chamrousse 161, Gérardmer 155, Risoul 100, Les Contamines 68, Peisey 61, Valmeinier 50, Ballons 19) | suivre `#lasuite` / `page=N` jusqu'au bout, sans plafond ; lire en tâche de fond au-delà de la part de 40 s (comme Ski-Planet) ; accepter l'identifiant `G-…` ; descendre en N2 pour les seules fiches à qui il manque un champ, mémoire de 30 jours |
| 2 | **Corrections sur les centrales à un hôte, et MSEM** | 14 | Deskline 63, iResa 237, Arkiane 55, Flaine 142, Open System moderne 566 (664 moins 98) : 1 063 | chambres à N3/N4 (`nbBedrooms`) pour les 10 hôtes MSEM ; chambres N2 et rue N4 à La Clusaz | Deskline : `pageNo` à partir de 1 ; iResa : `POST /ajax/loadMore` jusqu'à `nbPagesMax` ; Arkiane : capacité au moins égale au lieu d'égale, pagination `skip` = numéro de page ; MSEM : délai de l'API d'offres porté au-delà de 30 s à Flaine, et lecture N3/N4 des chambres ; Open System moderne : pagination par `CVID` (recette établie) |
| 3 | **Open System ancien (widget JSONP) et Alliance Réseaux sur N'PY** | 12 | 682 (six hôtes Open System) + 175 à Grand Tourmalet, plus les autres stations N'PY | personnes N1/N4, coordonnées N4 (`vueinfo.js`, tout le catalogue en un appel), adresse N1/N4 ; **chambres absentes de la plateforme pour les meublés** (N1 à N5 vérifiés) | un adaptateur pour le widget (`etape16v5` par blocs avec `ConversationId`, `catalogue.js` par fiche), paramétré par hôte (intégration, `osform`, identifiant d'API, vue) ; un second pour `POST /fr/alliance/accommodation-hot` de N'PY, qui rend déjà le total du séjour |
| 4 | **Positions et champs publiés mais non lus, hors centrales** | 7 sources | Travelski 508 annonces sans position sur les deux stations mesurées ; Cimalpes 8 | positions N3 Travelski (toutes les fiches manquantes, en tâche de fond, mémoire de 30 jours) ; positions N2 Cimalpes ; position N3 des tuiles Gîtes de France ; `postalCode` GreenGo ; `max_adults` Ovo ; `NbChambre` Ski-Planet (à vérifier sur un logement à chambre) ; commune Airbnb à N4 ; rue lue par `lectureFiche` et jamais posée | lecture plus profonde dans des adaptateurs existants, sous verrou « scraps » |
| 5 | **Orchestra** | 3 | La Plagne 79, Chamonix 303, Combloux 62 : 444 | personnes N2, coordonnées N1/N3, adresse N1 à N2 ; chambres absentes à N1 à N4 (facette seulement) | lecture de la liste `/serp` et de la page suivante (`/ajax/more/serp`) ; calendrier « pmb » sans niveau de bande |
| 6 | **Adaptateurs neufs, un hôte chacun** | 2 | Praz de Lys Sommand 110 (Apidae et Elloha), Les Karellis 14 propositions (Resalys) | Praz de Lys : personnes N2, coordonnées N3, rue N3, chambres absentes ; Karellis : chambres N2, personnes N1, position et rue par établissement | `admin-ajax.php` filtré par Elloha ; `wpAjaxEtablissementInfo` de Resalys |
| 7 | **Pertes en aval et signalement** | toutes | à l'écran : offres écartées pour « dates ou prix », presque toutes des formules avec forfait à total nul (Maeva, Ski-Planet, Travelski : 113 à Avoriaz, 103 aux 2 Alpes), doubles cartes d'une même source, 36 Booking perdus sans motif | aucun | l'écran Prix marque partielle une source tronquée (centrale 160 sur 415, Gîtes arrêté sur 403, notes des agences) ; audit `listings:audit` et tests bloquants du brief ; porte de sortie unique (phase C) |

Décisions à prendre avant de commencer :

1. **`robots.txt`.** Plusieurs appels nécessaires aux rangs 3 et 5 sont sous un `Disallow` : les trois hôtes tiers du widget Open System (`Disallow: /`), Montgenèvre (`Disallow: /`), l'appel de session d'Ax et de Valmorel, la liste `/serp` de La Plagne, Praz-sur-Arly et Combloux (`Disallow: /`). La politique du dépôt est de lire, journaliser et extraire quand même ; je ne l'étends pas à ces hôtes sans votre accord explicite.
2. **Hôtels.** MSEM (21 à l'Alpe d'Huez, 4 à Villard-de-Lans, 3 à Flaine) et Deskline (11 à La Clusaz) proposent des hôtels que les collecteurs écartent. Le brief dit « tous types de bien » ; l'écran Prix les écarte ensuite de toute façon (`horsSujet.ts`). Les garder à l'écran Logements ?
3. **Fiches sans prix** (Val d'Allos : 12 fiches « Voir toutes les disponibilités »). Les montrer sans prix, ou les laisser hors du compte ?
4. **Formules avec forfait à total nul** (rang 7) : les montrer avec « prix de la formule pour N adultes » plutôt que de les écarter ?

## 6. Motifs acceptés

Acceptés d'avance par le brief et rencontrés : blocage anti-robot (Les Angles et Valfréjus, 403 Cloudflare ; Gîtes de France, 403 en page 2 aux 2 Alpes), agrégateurs sans API (Airbnb, Booking).

À vous soumettre, datés du 30 septembre 2026 :

| Hôte ou plateforme | Motif proposé | Preuve |
|---|---|---|
| Abondance, Les Brasses, Sixt-Fer-à-Cheval, Font-Romeu, Beuil, Le Chioula | pas de moteur de réservation : sites d'information | section 2 |
| Vallées de Gavarnie (Tourinsoft) | pas de séjour daté : système d'information touristique, contact du propriétaire | section 2, 3.1 |
| Sancy (Diffusio) | grille tarifaire sans total de séjour, réservation chez le propriétaire | section 2, 3.1 |
| Matheysine | pas de liste datée ; seulement un moteur par fiche (204 fiches) | section 2 |
| Praz-sur-Arly | rien aux dates sur le site | section 2 |
| Chambres, Open System ancien (meublés), iResa, Orchestra, Apidae et Elloha, Alliance N'PY | champ absent de la plateforme, N1 à N5 vérifiés : `unknown` avec ce motif, jamais une valeur tirée de la capacité | section 3.1 |
| Coordonnées, iResa (Les Arcs) | absentes de N1 à N5 : géocodage de l'adresse ou de la résidence en phase D | section 3.1 |
| Rue, Arkiane et iResa | absente de N1 à N5 : géocodage de la résidence et de la station en phase D | section 3.1 |

## 6. Motifs acceptés

Aucun encore. Motifs acceptés d'avance par le brief : plateforme qui exige un compte client, agrégateur sans API (Booking, Airbnb), blocage anti-robot.
