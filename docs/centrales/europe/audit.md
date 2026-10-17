# Centrales de réservation des domaines européens

Relevé du 17 octobre 2026, sur les **389 domaines européens hors France de plus de 15 km de pistes** (`src/lib/monde`, OpenSkiMap). Les 2 121 domaines plus petits n'ont pas été cherchés. Ce sont surtout des téléskis locaux, dont l'office ne vend pas d'hébergement en ligne.

Même méthode que l'audit français du 13 septembre 2026 (`docs/centrales/audit.md`). Pour chaque domaine :
1. le lien « réserver un hébergement » que publie son site officiel ;
2. l'hôte de la centrale vers laquelle il mène ;
3. le moteur qui la fait tourner.

**Aucun connecteur n'a été écrit** : ce relevé rend des données, pas du code. Une centrale ou un moteur qu'on n'a pas pu prouver est écrit « inconnu », jamais deviné.

## Un relevé partiel, et pourquoi

Les pages n'ont presque jamais pu être lues. Dans l'environnement du relevé :
- la lecture directe échouait au DNS sur tous les hôtes ;
- le pare-feu refusait les sites des stations ;
- le compte Firecrawl a épuisé ses crédits après quelques pages ;
- la recherche web a atteint son quota de 200 requêtes.

Les moteurs ont donc été reconnus surtout par des preuves **textuelles** :
- des formes d'URL (codes Deskline suivis d'un GUID, `/<mandant>/ukv/result?tt=` de TOMAS, `/stays?…gc-0-adults` de Citybreak) ;
- les mentions légales et les déclarations de protection des données qui nomment le sous-traitant ;
- les pieds de page cités par les moteurs de recherche.

Chaque entrée garde sa preuve dans `preuve`. Les preuves faibles le disent.

| | Domaines |
| --- | ---: |
| Relevés | 389 |
| Avec une centrale identifiée | 175 |
| Sans réservation en ligne (« aucun ») | 3 |
| Cherchés sans résultat | 79 |
| Non recherchés, faute d'outil | 132 |

## Les moteurs

| Moteur | Domaines | Où |
| --- | ---: | --- |
| **Deskline / Feratel** | **75** | Autriche (48), Trentin (14, système provincial), Suisse (10 : Arosa Lenzerheide, Aletsch, Davos Klosters, Saas-Fee, Adelboden-Lenk), Allgäu et Kleinwalsertal (3) |
| inconnu | 54 | centrale trouvée, moteur non prouvé (Engadin St. Moritz, Gstaad, Crans-Montana, Livigno, Alta Badia, Kronplatz, Levi, Ruka, Sierra Nevada…) |
| Citybreak (Visit Group) | 13 | Suède et Norvège ; 3 prouvés par le pied de page, 10 par l'empreinte d'URL, à confirmer |
| SkiStar (vente en propre) | 9 | Åre, Sälen, Trysil, Hemsedal, Vemdalen… |
| TOMAS | 8 | Zermatt, Dents du Midi, Flims Laax, Scuol, Val Müstair, Viamala ; 6 par l'URL seule |
| Ingénie | 3 | Val d'Anniviers (2), Les Rousses (repris de l'audit français) |
| Grandvalira Resorts (en propre) | 3 | Grandvalira, Canaro, Ordino-Arcalís |
| Viajes Aramón | 3 | Formigal, Panticosa, Cerler |
| CapCorn | 2 | Saalbach Hinterglemm, Obertauern |
| Alturos Destination OS | 2 | Andermatt-Sedrun-Disentis |
| Baqueira (en propre) | 1 | Baqueira Beret |
| OpenBooking | 1 | Verbier (méta-moteur, renvoie à l'hébergeur) |
| Cloudbooking | 1 | Uvdal |

**Deskline / Feratel couvre à lui seul 75 domaines.** Le dépôt a déjà un connecteur Deskline (`src/lib/scrape/centrales/moteurs/feratel.ts`), écrit pour La Clusaz. C'est le premier moteur à brancher. Viennent ensuite Citybreak (13) et TOMAS (8).

## Centrales régionales partagées

Une centrale vend souvent tout un territoire. Un connecteur par centrale couvre donc plusieurs domaines :

- **Autriche** :
  - Ski amadé (6 domaines) ;
  - Schladming-Dachstein (5) ;
  - Paznaun-Ischgl (4) ;
  - Ötztal (3 à 4) ;
  - Montafon (3) ;
  - Stubai (3) ;
  - Gastein (2 à 3) ;
  - Zell am See-Kaprun (2) ;
  - Hochkönig (2) ;
  - Kleinwalsertal (2) ;
  - Arlberg (St. Anton et Lech Zürs).
- **Italie** :
  - APT Val di Fassa (4) ;
  - Campiglio (2) ;
  - Val di Sole (2) ;
  - San Martino (2) ;
  - Drei Zinnen (2).
- **Suisse** :
  - Davos Klosters (4) ;
  - Engadin St. Moritz (3) ;
  - Viamala (3) ;
  - Saas-Fee (2) ;
  - Gstaad (2) ;
  - Val d'Anniviers (2).
- **Nordiques** :
  - Alpinco (Oppdal, Hafjell, Kvitfjell) ;
  - Hemavan-Tärnaby ;
  - Branäs-Kungsberget.

## Corrections relevées dans le référentiel

- `Avoriaz`, rangé en Suisse, est une station française.
- `Kaunertaler Gletscher`, rangé en Italie, est en Autriche (Tyrol).
- `Ifen`, rangé en Allemagne, est côté autrichien (Kleinwalsertal).

## À reprendre

132 domaines restent « non recherchés » :
- la moitié de l'Autriche (Hintertux, Hochzillertal, Pitztal, Osttirol, Lungau, l'est du pays) ;
- l'essentiel du Haut-Adige ;
- le Piémont et les Abruzzes ;
- 46 domaines suisses (Engelberg-Titlis, Flumserberg, Mürren, Leukerbad…) ;
- l'Europe de l'Est presque entière.

Les reprendre demande un accès aux pages : des crédits Firecrawl, ou un relevé lancé depuis un poste qui atteint ces sites. Il faudra alors relire le HTML des 54 « inconnu » et des preuves faibles (pied de page, scripts, iframes).

## Fichiers

Un fichier par groupe de pays, de même forme : `autriche.json`, `italie.json`, `suisse.json`, `nordiques.json`, `ouest.json` (Espagne, Andorre, Allemagne, Royaume-Uni) et `est.json`. Chaque domaine porte :
- `id` (celui de `src/lib/monde`) ;
- `siteOfficiel` ;
- `centrale` : `nom`, `url`, `hote`, `moteur`, `preuve` ;
- ou `motif` quand il n'y en a pas.

## Faire le tour de tous les domaines : `scripts/sonder-centrales-europe.mjs`

La recherche web ne passe pas à l'échelle des 2 510 domaines. Le script de sondage fait la même lecture que ce relevé, sans moteur de recherche : le site officiel de chaque domaine, les liens d'hébergement qu'il publie, et l'empreinte du moteur dans la page de réservation (`scripts/centrales-empreintes.mjs`, une trentaine de moteurs), citée comme preuve.

- **Poli** : `robots.txt` lu et respecté, une requête à la fois par site, deux secondes entre deux, quatre sites au plus en même temps. Lecture seule.
- **Reprenable** : il écrit `docs/centrales/europe/sondage.json` au fil de l'eau ; relancé, il ne redemande que ce qui n'a pas abouti.
- **Limite** : 1 634 domaines sur 2 510 ont un site officiel connu du référentiel ; les 876 autres sortent « site officiel inconnu ». Une page construite en JavaScript ne montre pas ses liens : elle sort « aucun lien », à relire à la main.

Il se lance depuis un poste qui atteint ces sites (environ deux heures pour tout) :

```
node scripts/sonder-centrales-europe.mjs              # tout
node scripts/sonder-centrales-europe.mjs --pays AT,CH # quelques pays
node scripts/sonder-centrales-europe.mjs --max 50     # un essai
```
