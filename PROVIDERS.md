# Sources de données — statut légal, accès, limites

Une ligne par source : ce qu'elle apporte, si on peut légalement l'utiliser, comment obtenir un
accès, et à quelles limites on se heurte. Les mentions « vérifié le » indiquent une vérification
réelle par appel à l'API, pas une lecture de documentation.

**Règle du projet : aucun scraping.** Ce qui n'est pas accessible par une API autorisée ou par une
métadonnée que le site publie volontairement (Open Graph, JSON-LD) n'est pas récupéré
automatiquement. Voir [docs/RISQUES.md](docs/RISQUES.md) § « Ce qu'on ne fait pas et pourquoi ».

---

## Niveau 0 — Référentiel (ouvert, utilisé en phase 1)

### OpenSkiMap / OpenStreetMap — géométrie et altitudes des domaines

| | |
|---|---|
| **Statut légal** | Données OSM sous **ODbL**. Usage libre avec attribution ; toute redistribution d'une base dérivée doit rester sous ODbL. |
| **Type d'accès** | Téléchargement direct de dumps GeoJSON, sans clé ni inscription. |
| **Endpoints** | `https://tiles.openskimap.org/geojson/ski_areas.geojson` (~22 Mo)<br>`https://tiles.openskimap.org/geojson/lifts.geojson` (~107 Mo)<br>`https://tiles.openskimap.org/geojson/runs.geojson` (plusieurs centaines de Mo) |
| **Vérifié le** | 2026-08-11 — 12 209 domaines mondiaux, dont 288 domaines alpins français « en exploitation ». |
| **Limites de taux** | Aucune annoncée. Les dumps sont régénérés quotidiennement ; l'app ne retélécharge pas si le fichier local a moins de 24 h. |
| **Fragilité** | Ces URLs ne font l'objet d'aucun contrat ni d'aucune page de documentation officielle. Elles sont donc **paramétrables** et l'import accepte un fichier local (`--file`). |
| **Attribution** | « © contributeurs OpenStreetMap — OpenSkiMap.org », affichée dans l'app. |

Ce que le dump donne réellement, mesuré sur les 288 domaines français :

| Champ | Couverture | Conséquence |
|---|---|---|
| Altitude min/max des pistes | 267 / 288 | Le cœur de l'app fonctionne. |
| Nom, pays, région, code ISO 3166-2 | ~100 % | Massif reconstitué par table de correspondance. |
| Longueurs par difficulté | bonne | Couleurs vert/bleu/rouge/noir agrégées. |
| Site officiel | 212 / 288 | — |
| **Neige de culture** | **12 / 288** | Filtre inutilisable seul → saisie manuelle. |
| **Altitude du village** | **0 / 288** | Estimée par la gare aval la plus basse (232/277 après import des remontées). |
| **Glacier** | **absent du format** | Détection par intersection Overpass, ou saisie manuelle. |
| **Dates de saison, URL de réservation** | **absents** | Saisie manuelle uniquement. |

### IGN Géoplateforme — RGE ALTI (altimétrie France)

| | |
|---|---|
| **Statut légal** | Service public ouvert, licence Etalab. Aucune clé. |
| **Endpoint** | `GET https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json`<br>paramètres `lon`, `lat` (séparateur `\|`), `resource=ign_rge_alti_wld` |
| **Vérifié le** | 2026-08-11 — `lat=45.2967, lon=6.5806` → `z = 2283.09 m`. |
| **Limites de taux** | **5 requêtes/seconde par IP** ; jusqu'à 5 000 points par requête. L'app se limite à 4 req/s et 500 points par lot. |
| **Précision** | métrique. |
| **Valeur d'absence** | `-99999` — traitée comme « pas de donnée » et relayée vers OpenTopoData. |

### OpenTopoData — EU-DEM 25 m / SRTM 30 m (Europe hors France)

| | |
|---|---|
| **Statut légal** | Instance publique gratuite, usage raisonnable attendu. Auto-hébergement possible. |
| **Endpoint** | `GET https://api.opentopodata.org/v1/eudem25m?locations=lat,lon\|…` (repli `srtm30m`) |
| **Limites de taux** | **1 req/s, 100 points/requête, 1 000 req/jour** sur l'instance publique. Respecté par le limiteur. |
| **Vérifié le** | 2026-08-11 — `47.05, 11.51` → 1 441,8 m via `eudem25m`. |

### Base Adresse Nationale — géocodage France

| | |
|---|---|
| **Statut légal** | Service public ouvert, licence Etalab. Aucune clé. |
| **Endpoint** | `GET https://api-adresse.data.gouv.fr/search/?q=…` |
| **Vérifié le** | 2026-08-11 — une adresse postale française complète a été résolue en coordonnées. |
| **Limites de taux** | 50 req/s/IP annoncées. Largement suffisant. |

### Nominatim / OpenStreetMap — géocodage hors France

| | |
|---|---|
| **Statut légal** | Politique d'usage OSMF : **1 req/s maximum**, User-Agent identifiant obligatoire, pas d'usage intensif. Les deux sont appliqués. |
| **Endpoint** | `GET https://nominatim.openstreetmap.org/search` |
| **Recommandation** | Pour un usage soutenu, héberger sa propre instance. |

### Overpass API — détection des glaciers

| | |
|---|---|
| **Statut légal** | Ressource communautaire gratuite. Usage abusif = blocage d'IP. |
| **Endpoint** | `GET https://overpass-api.de/api/interpreter?data=…` |
| **Stratégie** | **Une seule requête par emprise de pays** (`natural=glacier`), puis intersection géométrique locale avec shapely. Pas une requête par domaine. |
| **Activation** | Désactivée par défaut, case à cocher explicite à l'import. |

---

## Niveau 1 — Itinéraires

### OpenRouteService

| | |
|---|---|
| **Statut légal** | API publique avec inscription gratuite. Données OSM sous ODbL. |
| **Obtention de la clé** | Compte gratuit sur <https://openrouteservice.org/dev/#/signup>, la clé apparaît dans le tableau de bord. |
| **Endpoints utilisés** | `POST /v2/matrix/driving-car` (pré-calcul en masse)<br>`POST /v2/directions/driving-car` (trajet exact, évitement des péages)<br>`POST /v2/isochrones/driving-car` |
| **Limites de taux (plan gratuit)** | ordre de grandeur : ~2 000 trajets/jour, ~500 matrices/jour, ~500 isochrones/jour, avec des plafonds par minute. **À vérifier sur votre tableau de bord** : ces quotas évoluent. Le client applique 40 req/min sur matrix/directions et 20 req/min sur isochrones. |
| **Limitation fonctionnelle importante** | `/v2/matrix` **n'accepte pas** `options.avoid_features`. L'évitement des péages est donc impossible sur un calcul en masse : l'app calcule la matrice avec péages puis recalcule à la demande, domaine par domaine, via `/v2/directions`. L'UI le signale au lieu de laisser croire que le réglage s'applique partout. |

### OSRM

| | |
|---|---|
| **Statut légal** | Logiciel libre (BSD). L'instance publique `router.project-osrm.org` est une **démo** : sa politique interdit l'usage soutenu. |
| **Obtention** | Aucune clé. Pour un usage réel, auto-héberger (`osrm-backend` + extrait Geofabrik). |
| **Limites** | `/table` plafonne à ~100 coordonnées sur la démo. |
| **Limitations fonctionnelles** | **Ni isochrones, ni évitement des péages.** Déclaré dans les capacités du provider ; l'UI refuse proprement au lieu d'échouer. |

### Google Routes API

| | |
|---|---|
| **Statut légal** | Payant, CGU Google. Restrictions de mise en cache des résultats à vérifier avant tout stockage durable. |
| **Endpoint** | `POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix` |
| **Obtention** | Projet Google Cloud + facturation activée + Routes API activée. |
| **Intérêt** | Seul fournisseur qui gère l'évitement des péages **sur un calcul matriciel**. |
| **Non vérifié** | Aucune clé disponible ici : ce connecteur n'a pas été exécuté. |

---

## Niveau 2 — Logement par API

### LiteAPI / Nuitee Connect — **la seule source tarifée accessible sans contrat**

| | |
|---|---|
| **Statut légal** | Distributeur agréé, CGU d'API standard. **Inscription en libre service**, aucune validation commerciale, aucun volume d'affaires à démontrer. |
| **Obtention de la clé** | Compte gratuit sur <https://dashboard.liteapi.travel/register>. La clé apparaît dans le tableau de bord. Les clés `sand_` visent le bac à sable, les clés `prod_` l'inventaire réel. |
| **Endpoints utilisés** | `POST /v3.0/hotels/rates` (recherche tarifée)<br>`GET /v3.0/data/places?textQuery=` (résolution d'un libellé en `placeId`)<br>En-tête `X-API-Key`. |
| **Serveur MCP** | `https://mcp.liteapi.travel/api/mcp?apiKey=…`. Transport « Streamable HTTP », réponses en SSE. Les outils reprennent les points d'entrée REST (`post_hotels_rates`, `get_data_places`…). |
| **Vérifié le** | 2026-08-12, clé de bac à sable publiée par l'éditeur. Recherche par coordonnées `45.2967 / 6.5806`, rayon 12 km, 6–13 février 2027, deux adultes → **Résidence Koh-I Nor by Les Etincelles, 6 587,36 € en euros, 5 étoiles, note 8,8 sur 32 avis**. La même requête via le serveur MCP renvoie le même établissement au même prix — la parité est vérifiée à chaque exécution de `npm run providers:test`. |
| **Limites de taux** | 500 req/s annoncées sur le serveur MCP, facturation à l'appel selon la grille de l'éditeur. Le connecteur s'espace de 200 ms et met en cache dix minutes. |
| **Limite de couverture** | **Le bac à sable n'a presque rien en Tarentaise** : la plupart des requêtes en station y répondent `2001 — no availability found`. Une clé de production est nécessaire pour juger la couverture réelle. C'est le seul point non vérifié de cette ligne. |
| **Nature de l'inventaire** | Hôtelier et pararhôtelier : hôtels, résidences de tourisme, appart-hôtels. **Pas de location entre particuliers.** Le chalet loué par son propriétaire sur Airbnb n'y est pas et n'y sera pas. |
| **Recherche géographique** | `latitude` / `longitude` / `radius` acceptés, ce qui est **le bon modèle pour cette application** : « Val Thorens » est administrativement *Les Belleville*, et les Menuires ou Saint-Martin appartiennent au même domaine sans partager de nom de commune. Une recherche par libellé en rate une partie et en ramène d'autres à quarante minutes de route. |
| **État** | Implémenté, deux transports, testé. `src/main/providers/liteapi/`. |

### Serveurs MCP tiers — connecteur générique déclaratif

| | |
|---|---|
| **Principe** | `%APPDATA%\skitrack\mcp-sources.json` décrit un serveur, un outil, ses arguments et la correspondance de ses champs vers le modèle pivot. Le connecteur en découle sans recompilation. |
| **Pourquoi** | Le secteur ouvre des serveurs MCP plus vite qu'il n'ouvre des API. Écrire un fichier TypeScript par serveur reviendrait à publier une version de l'application à chaque nouveauté, pour un travail qui se réduit à « appeler cet outil, lire ces champs ». |
| **Garde-fou** | Le champ `legalBasis` est **obligatoire** : une source qu'on ne sait pas justifier n'est pas une source qu'on interroge. Les URL non-HTTPS sont refusées (la clé y circule), les noms de connecteurs intégrés sont réservés, et chaque entrée rejetée s'affiche dans l'écran Sources avec son motif — « aucun logement ici » et « ma configuration est cassée » ne doivent pas se ressembler. |
| **Réserve** | Qu'un serveur MCP « Airbnb » existe sur une place de marché ne veut pas dire qu'il a le droit de servir ces données : la plupart lisent les pages du site. Voir la ligne Airbnb du niveau 3. |
| **État** | Implémenté. `src/main/providers/mcp/`. |

### Expedia Rapid (Expedia, Abritel/Vrbo)

| | |
|---|---|
| **Statut légal** | Contrat partenaire Expedia Group obligatoire. Pas d'accès en libre-service. |
| **Procédure** | Candidature sur <https://developers.expediagroup.com/docs/products/rapid>, validation commerciale, puis remise d'une `API key` + `shared secret` (signature HMAC par requête). |
| **Hotels.com** | Retiré de l'application. Même inventaire Rapid, mêmes clés, mêmes biens : c'était une source en double, pas une source de plus. Le drapeau de marque a disparu du connecteur, de la liste des sources et des recherches pré-remplies. |
| **Réserve importante** | Le cahier des charges suppose « un connecteur, deux marques ». C'est vrai côté distribution, mais **Rapid est avant tout un inventaire hôtelier** : la présence des locations saisonnières Abritel/Vrbo n'est pas garantie par ce produit. Pour un chalet à Val Thorens, l'apport réel peut être proche de zéro. À valider dès l'obtention d'un accès sandbox, avant d'écrire le connecteur. |
| **État** | Interface `BaseProvider` prête, connecteur non écrit. |

### Booking.com Demand API v3

| | |
|---|---|
| **Statut légal** | Validation partenaire Booking obligatoire. **En pratique inaccessible à un particulier** : le programme cible les agences et distributeurs avec volume d'affaires. |
| **Procédure** | <https://developers.booking.com/> — demande d'accès, revue, contrat. |
| **Repli** | Deep-link vers la recherche Booking, déjà en place. |
| **État** | Non implémenté (phase 4). |

### Homestay / Hostelworld

| | |
|---|---|
| **Statut** | **Écarté.** Hostelworld distribue des auberges de jeunesse ; Homestay des chambres chez l'habitant. Ni l'un ni l'autre ne couvre l'appartement ou le chalet en station, qui est l'objet de l'app. Le coût d'intégration ne se justifie pas. |
| **Alternative retenue** | Concentrer l'effort sur l'import manuel par URL, qui couvre *n'importe quelle* source, y compris les agences locales de station — souvent les moins chères et absentes de tous les comparateurs. |

---

## Niveau 3 — Deep-links et import manuel

### Airbnb

| | |
|---|---|
| **Statut légal** | **Aucune API publique.** Les CGU interdisent l'accès automatisé et le scraping. |
| **Ce qu'on fait** | Génération d'une URL de recherche pré-remplie (station, dates, voyageurs, chambres), ouverte dans le navigateur système. |
| **Ce qu'on ne fait pas** | Aucune requête automatique vers airbnb.com. |
| **Voir les vraies annonces, avec prix** | Par un **marque-page** (« bookmarklet ») que l'utilisateur installe lui-même. Il ouvre la page de résultats Airbnb dans **son** navigateur, connecté à **son** compte ; le marque-page lit le bloc de données `data-deferred-state-0` **qu'Airbnb dépose lui-même dans la page** pour son propre affichage, et le copie dans le presse-papiers. L'utilisateur colle dans SKITRACK (onglet Airbnb de l'import). Vérifié le 2026-08-12 sur une recherche Val Thorens : 20 annonces réelles récupérées, avec nom, prix exact, coordonnées et note. |
| **Pourquoi ce n'est pas du scraping** | L'application n'émet **aucune** requête vers Airbnb. C'est l'utilisateur qui charge une page qu'il a le droit de consulter ; le marque-page ne fait que relire ce que cette page affiche déjà, sur un clic humain, sans parcours de catalogue ni contournement d'anti-robot. C'est le geste de recopier un prix à la main, rendu fiable. Le code du marque-page est livré en clair (`scripts/airbnb-bookmarklet.src.ts`) pour être relu avant installation. |
| **Ce que ça ne fait pas** | Ni pagination automatique, ni chargement des pages suivantes : seul ce qui est à l'écran au moment du clic est copié. Faire défiler charge plus d'annonces avant de cliquer. |
| **Serveurs MCP « Airbnb »** | Il en circule plusieurs. Ils lisent les pages du site, ce que les CGU interdisent, et `@openbnb/mcp-server-airbnb` applique lui-même le `robots.txt` qui refuse `/s/…/homes` et `/rooms/<id>`. Passer par MCP ne change donc **rien** au fond : le transport n'a jamais créé de droit d'accès. Le marque-page, lui, ne fait faire aucune requête à l'application — la différence est là. |


### Gîtes de France

| | |
|---|---|
| **Statut légal** | Aucune API publique. Deep-link uniquement. |
| **Fragilité** | Le pattern d'URL livré est **non vérifié** (`verified: false`). À corriger dans le YAML au premier essai. |

### Centrales de réservation des stations — **interrogées**

| | |
|---|---|
| **Statut légal** | Pas d'API. Chaque station a sa propre plateforme ; une trentaine des centrales françaises tourne sur **Ingénie**. |
| **Ce qu'on fait** | Le connecteur `station-web` (`src/main/providers/station/station.ts`) interroge la centrale de la station **aux dates du séjour** et rapporte ses offres dans la même liste que les autres sources. Ce n'est plus un simple lien : ces logements — régies municipales, agences de station, propriétaires en direct — apparaissent désormais dans les résultats. |
| **Comment** | Le moteur Ingénie est un formulaire GET vers `/booking` : la page de résultats s'obtient par une URL construite (`action=result&cid=<cid>&datedeb=JJ/MM/AAAA&datefin=…&adultes=N`). Le `cid`, propre à chaque site, est lu dans le formulaire de la page d'accueil. Aucune session, aucun POST, aucun calendrier piloté. |
| **Ce qui est lu** | Le bloc `application/ld+json` que chaque fiche publie **pour les moteurs de recherche** (nom, adresse, latitude, longitude, image), plus le prix et la distance aux pistes affichés. Vérifié le 15 août 2026 sur Les 2 Alpes : 20 fiches, 20 avec prix **et** coordonnées. |
| **Ce qu'on ne fait pas** | Aucune centrale hors Ingénie n'est interrogée : le connecteur le détecte et renvoie une erreur explicite, pour que « aucune offre » et « plateforme non reconnue » ne se confondent pas. Les 94 adresses connues restent alors accessibles par le lien direct. |
| **robots.txt** | Relu sur les centrales Ingénie : il interdit `/stats`, `/carnet-voyage`, `espace-client` et une liste de paramètres de filtrage (`?liste=`, `?origine_affinage=`, `?date=`…). L'URL de résultats utilisée n'en emploie aucun. |
| **D'où viennent les adresses** | `src/renderer/src/data/stations.ts` : 94 centrales, reprises de la liste France Montagnes « Les centrales de réservation des stations de ski en France » et complétées par un sondage systématique de `reservation.`, `booking.` et `resa.` sur chaque site officiel connu. À défaut, `official_booking_url` puis `official_website_url` du moteur local. |
| **Un « à partir de » n'est pas un prix** | Les fiches Ingénie affichent souvent un tarif d'appel. Il est repris avec `priceConfidence: 'partial'`, jamais comme un total confirmé. |

### Import manuel par URL (phase 2)

| | |
|---|---|
| **Principe** | L'utilisateur colle l'URL d'une annonce. L'app lit **une page, à la demande**, et en extrait ce que le site publie volontairement pour le référencement : Open Graph (`og:title`, `og:image`, `og:description`) et JSON-LD `schema.org` (`LodgingBusiness`, `Accommodation`, `Offer`). Les champs manquants sont demandés à l'utilisateur. |
| **Pourquoi c'est différent du scraping** | Une seule page, déclenchée par une action humaine explicite, en lisant les métadonnées que le site expose *pour être lu par des machines*. Pas de parcours de catalogue, pas de contournement, pas de volume. |
| **Ce qui reste à respecter** | `robots.txt` de l'hôte, un User-Agent identifiant, et l'abandon si le site le refuse. Certaines CGU (Airbnb notamment) interdisent tout accès automatisé, y compris unitaire : sur ces domaines, prévoir la saisie 100 % manuelle comme comportement par défaut. |
| **Pourquoi c'est essentiel** | C'est ce qui rend l'outil réellement utile malgré les sources fermées : un logement collé à la main rejoint **la même table** que ceux issus d'une API, avec les mêmes calculs de distance, d'altitude et le même comparateur. |

---

## Météo et enneigement (phase 4)

### Open-Meteo

| | |
|---|---|
| **Statut légal** | Gratuit pour usage non commercial, sans clé. CC-BY. |
| **Endpoint** | `https://api.open-meteo.com/v1/forecast` (dont `snow_depth`, `snowfall`) |
| **Limites** | ~10 000 appels/jour sur l'offre gratuite. |
| **État** | Table `snow_report` prête, connecteur non écrit. |

### Météo-France (bulletins d'estimation du risque d'avalanche)

| | |
|---|---|
| **Statut légal** | Portail API public avec inscription. Conditions de réutilisation à lire selon le jeu de données. |
| **Obtention** | Compte sur <https://portail-api.meteofrance.fr/>, souscription au jeu de données, clé/`APPLICATION_ID`. |
| **Réserve** | Les BRA sont publiés par **massif** (au sens Météo-France, qui ne recoupe pas exactement les massifs de cette app) et souvent sous forme de bulletin textuel + pictogrammes, pas d'un flux structuré exploitable champ par champ. Le rattachement domaine → massif Météo-France demandera une table de correspondance dédiée. |
| **État** | Non implémenté. |

---

## Récapitulatif : ce qui marche aujourd'hui sans aucune clé

| Fonction | Sans clé ? |
|---|---|
| Import du référentiel des domaines | ✅ |
| Altitudes (France et Europe) | ✅ |
| Géocodage de l'adresse de départ | ✅ |
| Détection des glaciers | ✅ |
| Recherche, filtres, tri, score, carte | ✅ |
| Distance aux pistes et dénivelé d'un logement | ✅ calculés localement sur la géométrie OpenSkiMap |
| Temps de trajet et isochrones | ❌ clé OpenRouteService gratuite, ou instance OSRM |
| Offres de logement tarifées | ❌ clé LiteAPI gratuite (libre service, 2 min) |
| Offres Booking / Expedia en direct | ❌ accord partenaire, hors de portée d'un particulier |
| Locations entre particuliers (Airbnb) | ❌ aucune API n'existe — redirection et import par URL |
