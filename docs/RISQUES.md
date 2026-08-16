# Points fragiles, irréalisables ou risqués du cahier des charges

Réponse au point 1 de la demande : « signale-moi tout point de mon cahier des charges
irréalisable, fragile ou risqué juridiquement ». Classé du plus structurant au plus mineur.

---

## 🔴 Bloquants — à savoir avant d'investir du temps

### 1. Booking.com Demand API n'est pas accessible à un particulier

Le programme partenaire Booking cible des distributeurs avec un volume d'affaires démontrable.
Une demande individuelle pour un outil personnel n'aboutit pas, quel que soit le soin apporté au
dossier.

**Conséquence.** La phase 4 telle qu'écrite risque de ne jamais démarrer.
**Alternative retenue.** Deep-link vers la recherche Booking pré-remplie — déjà en place — et
import manuel d'une annonce précise.

### 2. Expedia Rapid ≠ « Expedia + Abritel » pour de la location saisonnière

Le raisonnement « un connecteur, plusieurs marques » est exact du point de vue de la distribution,
mais **Rapid est un produit d'inventaire hôtelier**. Les locations Abritel/Vrbo n'y sont pas
garanties. Or c'est précisément le chalet et l'appartement que vous cherchez.

**Conséquence.** Le connecteur le plus coûteux à écrire (signature HMAC, pagination, mapping
tarifaire) peut ne rapporter que des hôtels de station.
**Action recommandée.** Dès l'accès sandbox obtenu, faire **une** requête sur Val Thorens en
février et compter les biens de type `VACATION_RENTAL`. Écrire le connecteur seulement si le
compte est significatif. Le reste du code est déjà écrit contre `BaseProvider` : ce test ne coûte
qu'une demi-journée.

### 3. Homestay / Hostelworld ne couvre pas votre besoin

Auberges de jeunesse et chambres chez l'habitant. Aucun recouvrement avec « appartement 6
personnes à moins de 300 m des pistes ».

**Recommandation.** Retirer de la feuille de route et réaffecter l'effort à l'import manuel, qui
couvre *toutes* les sources — y compris les agences immobilières locales de station, souvent les
moins chères et absentes de tous les comparateurs.

---

## 🟠 Fragile — le code fonctionne, la donnée ne suit pas toujours

### 4. « Altitude du bas des pistes » vaut ce que vaut la cartographie OSM

C'est le critère central de l'app, et il dépend entièrement de la complétude d'OpenStreetMap sur
le domaine considéré. Deux cas réels, relevés sur l'import du 2026-08-11 :

| Domaine | Bas des pistes calculé | Réalité |
|---|---|---|
| **La Grave** | 3 196 m | Le domaine descend à ~1 450 m au village. Seules les pistes glaciaires hautes sont cartographiées. |
| **Val Thorens - Orelle** | 1 727 m | La descente sur Orelle atteint ~900 m. |

Un filtre « bas des pistes ≥ 1 800 m » fait donc remonter La Grave en tête et écarte Val Thorens.
C'est faux dans les deux sens.

**Ce qui est en place.**
- Le champ porte une provenance explicite (`altitude_source`), affichée dans l'UI.
- Le fichier `data/curated/domains_fr.yaml` permet de corriger une valeur ; le domaine est alors
  marqué « vérifié » et l'import ne l'écrase plus.
- Les avertissements de recherche disent ce qui a été exclu et pourquoi.

**Ce qui reste à faire.** Une passe de vérification manuelle sur les 30 à 50 domaines qui vous
intéressent réellement. C'est une heure de travail, et c'est ce qui transforme l'outil en quelque
chose de fiable.

### 5. Le taux de neige de culture est inexploitable en l'état

**12 domaines sur 288** portent une information de neige de culture dans OSM. Un filtre
« enneigement artificiel ≥ 30 % » écarterait 96 % des domaines faute de donnée, pas faute
d'équipement.

**Ce qui est en place.** Une absence est stockée comme `NULL`, jamais comme `0` — la nuance entre
« non cartographié » et « aucun » est préservée. Le filtre affiche un avertissement explicite
quand il est activé.

**Alternative plus honnête.** Le **pourcentage de pistes exposées nord**, calculable depuis les
tracés (`north_facing_pct`, colonne prête, calcul prévu en phase 2), prédit mieux la tenue de la
neige à altitude égale que le taux d'enneigeurs déclaré.

### 6. L'altitude du village n'existe pas dans la source

Aucun des 288 domaines ne la porte. Elle est estimée par la **gare aval la plus basse** parmi les
remontées (232 domaines sur 277 après import). C'est un bon proxy du front de neige, mais pas la
même chose que l'altitude de la mairie.

### 7. Les patterns de deep-links n'ont pas été vérifiés

Ceux d'Airbnb et de Gîtes de France sont livrés avec `verified: false`. Ils sont probablement
corrects dans leur forme générale, mais aucun n'a été testé en session réelle. Ils vivent dans un
YAML éditable et l'UI affiche leur statut de vérification — un lien qui tombe à côté est
immédiatement imputable au pattern, pas à l'application.

### 8. Les URLs de dump OpenSkiMap ne sont garanties par personne

`tiles.openskimap.org` fonctionne (vérifié le 2026-08-11) mais n'apparaît sur aucune page de
documentation officielle. Ce n'est pas un contrat.

**Ce qui est en place.** URLs paramétrables, import depuis fichier local (`--file`), et un cache
de 24 h qui évite de dépendre de la disponibilité du serveur au quotidien.

### 9. L'évitement des péages ne s'applique pas au calcul en masse

L'endpoint `/v2/matrix` d'OpenRouteService n'accepte pas `options.avoid_features`. Techniquement
impossible, pas un choix d'implémentation.

**Ce qui est en place.** Le pré-calcul des ~280 trajets se fait avec péages ; le trajet sans péage
est recalculé à la demande sur la fiche d'un domaine, via `/v2/directions`. Le job renvoie une
note explicite que l'UI affiche. Google Routes API est la seule alternative qui gère les deux —
et elle est payante.

### 10. Le quota gratuit d'OpenRouteService et 300 domaines

Une matrice vers 280 destinations consomme un appel matriciel, ce qui passe. Mais recalculer pour
plusieurs origines, plusieurs profils, plus des isochrones, épuise vite les ~500 matrices/jour.

**Ce qui est en place.** Pré-filtre à vol d'oiseau **avant** tout appel réseau (gratuit,
`max_crow_km`) ; réutilisation systématique de ce qui est déjà calculé ; cache HTTP persistant de
30 jours ; et surtout, en cas de 429 à mi-parcours, le job **conserve ce qui a été calculé** au
lieu de tout annuler.

---

## 🟡 Juridique — ce qu'on ne fait pas et pourquoi

### 11. Le scraping est correctement exclu — la nuance est dans l'import manuel

Votre cahier des charges l'écarte déjà, et c'est le bon choix : les CGU d'Airbnb et de Booking
interdisent l'accès automatisé, et leur front change assez souvent pour qu'un scraper soit une
dette permanente.

Reste un point à ne pas sous-estimer : **l'import manuel par URL est une zone grise, pas une zone
sûre.** Lire les métadonnées Open Graph / JSON-LD qu'un site publie pour son référencement est
défendable — une page, à la demande, déclenchée par un humain. Mais les CGU d'Airbnb interdisent
formellement tout accès automatisé, **y compris unitaire**.

**Position retenue dans le code.**
- Aucun parcours de catalogue, aucune pagination, aucun volume.
- Respect de `robots.txt`, User-Agent identifiant, abandon si le site refuse.
- Sur les domaines dont les CGU interdisent l'accès automatisé, **la saisie manuelle assistée est
  le comportement par défaut** : l'app ouvre la page dans le navigateur et vous propose un
  formulaire pré-structuré, plutôt que d'aller lire la page elle-même.

### 12. Mise en cache des résultats Google

Si vous activez Google Routes API, ses CGU restreignent la durée de conservation des résultats.
Le TTL de cache est paramétrable (`ttl_route_s`) — à ajuster si vous passez sur ce fournisseur.

### 13. Redistribution ODbL

Si vous partagez un jour la base SQLite peuplée, elle constitue une base dérivée d'OSM et reste
sous ODbL. Les exports CSV/PDF d'une poignée de logements ne posent pas ce problème.

---

## 🟢 Techniques — traités, signalés pour mémoire

### 14. `keytar` est abandonné

Le cahier des charges mentionne « keytar ou DPAPI ». `keytar` n'est plus maintenu et impose une
compilation native fragile sous Windows.

**Retenu.** `safeStorage` d'Electron, qui utilise DPAPI sous Windows, sans dépendance native. Le
chiffrement est lié au compte Windows : le coffre copié sur une autre machine est illisible — ce
qui est précisément la propriété voulue.

### 15. SQLite n'a pas d'index spatial

Pas de PostGIS. Les recherches « pistes à moins de X mètres » de la phase 2 se feront par
pré-filtre bbox + shapely en mémoire.

**Ce qui rend ça viable.** Le référentiel est petit (277 domaines, 3 052 remontées pour la France)
et **toutes les distances sont pré-calculées et stockées**, jamais recalculées à l'affichage —
comme demandé. Si les tracés de pistes complets deviennent nécessaires, l'extension `R*Tree` de
SQLite (disponible en standard) suffira.

### 16. `runs.geojson` pèse plusieurs centaines de mégaoctets

L'import des tracés de pistes est donc **optionnel** et lit le fichier en flux (`ijson`), jamais
en mémoire. Même traitement pour `lifts.geojson` (107 Mo, chaque remontée réembarquant la fiche
complète de son domaine).

### 17. Pas de migrations en phase 1

`create_all` suffit tant que rien n'a été livré. Une `schema_version` est stockée en base et sert
de point de départ à Alembic dès le premier build distribué. Le schéma des phases 2 à 4
(logements, offres, historique de prix, recherches sauvegardées) est **déjà créé** pour éviter une
migration en milieu de projet.

### 18. Le suivi de prix suppose que quelque chose tourne

Un « job planifié » dans une app desktop n'existe que si l'app est ouverte. Pour des alertes
fiables, il faudra une tâche planifiée Windows appelant le sidecar en mode CLI. À arbitrer en
phase 4 ; les tables (`price_point`, `saved_search`) sont prêtes.

### 19. Politique d'usage des tuiles OpenTopoMap

Serveur bénévole, usage modéré attendu. L'app plafonne le zoom à 15, ne précharge rien et affiche
l'attribution CC-BY-SA en permanence. Pour un usage intensif, prévoir un fond alternatif.

---

## Ce qui, dans le cahier des charges, est particulièrement bien vu

Trois points méritent d'être soulignés parce qu'ils sont rarement pris au sérieux et qu'ils sont
implémentés tels quels :

- **Le prix tout compris comme valeur affichée**, avec le détail dépliable. Sur un séjour de 7
  nuits, 150 € de ménage changent le classement. Le modèle `Offer` stocke `price_total` (tout
  compris) *et* `price_base`, uniquement pour afficher l'écart.
- **Le dénivelé jusqu'aux pistes.** 300 m à plat n'est pas 300 m avec 60 m de D+ skis à l'épaule.
  La colonne `denivele_to_slope_m` existe, et le badge « skis aux pieds » est conditionné aux deux
  critères, pas à la seule distance.
- **Le détail du score visible.** Un classement qu'on ne peut pas auditer ne sert à rien. Chaque
  résultat renvoie sa décomposition, et la part de pondération réellement couverte quand une
  donnée manque — parce qu'un domaine sans temps de trajet calculé ne doit pas être pénalisé pour
  une raison qui n'est pas la sienne.
