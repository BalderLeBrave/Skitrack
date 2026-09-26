# Maquette v7 : ce qui est porté, ce qui diffère

Source : le handoff Claude Design du 13 septembre 2026 (`Skitrack-handoff.zip`,
projet `94054660-9e3d-4b33-98e2-0e5b5f9047a4`), fichiers `SKITRACK v7 -
App.dc.html` et `V7Coquille.dc.html`, plus `v7/v7-data.js` et `image-slot.js`
qu'il importe. La maquette v7 remplace la v6 comme contrat d'interface des cinq
écrans du parcours ; `docs/design/v6-contrat.md` et `v6-ecarts.md` restent
comme archive et ne décrivent plus l'application.

## Où c'est porté

| Maquette | Dépôt |
| --- | --- |
| Palette, Manrope, tailles, rayons, ombres (styles en ligne) | `src/design/system.css` (jetons) et `src/design/v7.css` (classes) |
| `V7Coquille` : barre, verrous, pilule de séjour, panneau « Votre séjour » | `src/components/Coquille.tsx`, `v7/Calendrier.tsx`, `v7/Compteur.tsx` |
| Accueil | `src/routes/index.tsx`, `v7/CarteStation.tsx` |
| Comparer : tableau, filtres, jetons, état vide, cartes, carte | `src/routes/comparer.tsx`, `v7/CarteEpingles.tsx`, `v7/Vide.tsx` |
| Station | `src/routes/stations.$id.tsx`, `v7/useForfait.ts` |
| Logements : filtres, cartes, volet, pied fixe, carte aux prix | `src/routes/logements.tsx` |
| Réservation | `src/routes/reservation.tsx` |
| `state` du script (cmp, pick, seen, booked, filtres) | `src/lib/parcours.ts` |
| Lectures des champs courts (`n`, `lo`, `hi`, `dom`, `share`…) | `src/lib/v7.ts` |

Les écrans de contrôle (`/carte`, `/altitudes`, `/openskimap`, `/forfaits`,
`/traces`) ne sont pas dans la maquette : ils gardent leur coquille `.v6` et
leurs feuilles, sous la nouvelle barre. Ils prennent la famille et la palette du
système par les jetons, sans autre changement.

## Décisions (13 septembre 2026)

1. **Données du dépôt, jamais celles du bundle.** `stations-map-data.json` et
   `v7-data.js` ne sont pas lus. Le référentiel compte 320 stations (la maquette
   en annonçait 318) ; les altitudes sont celles de la station, pas du domaine ;
   les annonces sont le relevé figé du dépôt plus la recherche en direct, telle
   que la route précédente la lançait. Le code de collecte n'est pas touché.
2. **Une altitude à zéro n'est pas une mesure.** Le référentiel met 0 là où le
   classeur se tait ; l'écran écrit « non relevée ». (`src/lib/v7.ts`)
3. **Forfaits : le relevé du dépôt prime la graine.** La maquette lisait la
   seule graine du catalogue. Ici `getForfait` répond quand le magasin a relevé
   la page officielle ; sa date s'écrit. Un tarif « estimé » n'entre jamais dans
   le coût. La saison et la zone n'existent que dans la graine. (`useForfait.ts`)
4. **Météo, webcams, bulletin : les services du dépôt.** « Aujourd'hui aux deux
   altitudes » et « 14 jours » viennent de `getForecastPair` (Open-Meteo par le
   serveur), pas d'un appel direct depuis le navigateur. Les webcams sont celles
   de la table du dépôt, avec le flux de l'exploitant ; la maquette n'en
   affichait aucune. Le bulletin d'avalanche est lu quand Météo-France répond ;
   sinon le texte de la maquette, « Bulletin d'avalanche non lu ».
5. **Quatre stations au plus dans la comparaison** (la v6 en admettait trois).
6. **Un seul tableau de comparaison**, comme la maquette, avec la note « valeur
   du domaine » sur les lignes mesurées à l'échelle du domaine. La phase 4 de
   l'audit avait séparé ces lignes dans un second tableau ; la maquette tranche
   autrement et la note tient le même rôle.
7. **Disponibilité : le verdict du dépôt.** « Prix relevé aux dates » et
   « Disponibilité non confirmée » viennent de `stay/availability.ts`, avec sa
   raison en toutes lettres, au lieu de la phrase figée « relevé le 3 sept. ».
   La provenance affichée dans le volet est le champ `proven` de l'annonce.
8. **Lien de partage** : `/reservation#s=…&l=…&d=…&n=…&t=…&r=…`, lu au montage
   de la coquille. `d` (arrivée) est ajouté au format v6. Le bandeau
   « Récapitulatif partagé » s'affiche quand l'état vient du lien.
9. **« Relancer le relevé »** relance la recherche en direct (c'est réel).
   « Importer une annonce » reste un bandeau : l'import par lien n'existe pas
   encore côté écran.
10. **« Plus »** garde ses liens vers les écrans de contrôle et la
    synchronisation : c'est le seul chemin vers eux. La maquette ne dessinait
    pas le contenu du menu.

## Écarts assumés

| Sujet | Maquette | Application | Pourquoi |
| --- | --- | --- | --- |
| Couverture | slot vide « crédit obligatoire » | `/hero.jpg` du dépôt, mention « Crédit photo à relever » | décision v6 conservée |
| Photos de station | « Photo Skiinfo · crédit à relever » | idem, ou « Photo Skiinfo de X, même domaine » quand elle est empruntée (`stationPhoto.ts`) | l'emprunt est dit |
| État vide des logements | « Le relevé du 3 sept. 2026 ne couvre que Les 2 Alpes » | « Aucune annonce relevée pour X » | idem |
| Sources dans les filtres | Airbnb, Gîtes de France, Centrale, Abritel | les sources présentes dans le relevé (Booking compris) | données réelles |
| Profil altimétrique, minicarte, historique de neige | absents | retirés de la fiche | pas dans la maquette v7 |
| Récapitulatif imprimable (`StayReport`) | absent | retiré de la réservation ; « Copier le récapitulatif » porte le même contenu | pas dans la maquette v7 |
| Curseur de budget « tous » à 5 000 | curseur 0–6 000, 0 = indifférent | idem, indifférent = aucun plafond | même règle |

## Composants retirés

Treize composants n'avaient plus d'appelant après le portage et sont supprimés,
comme la phase 1 de l'audit l'avait fait pour seize autres : `StayReport`,
`LodgeCompare`, `SearchStayBar`, `StayDatesField`, `Flocons`, `PhotoCredit`,
`AltitudeProfile`, `SnowHistoryCard`, `ForecastCard`, `WebcamCard`, `BraCard`,
`SkiinfoCard`, `LangToggle`. Ce qu'ils affichaient est soit repris dans les
écrans v7 (prévision, webcams, bulletin, langue, calendrier, compteurs,
récapitulatif copié), soit absent de la maquette v7 (profil altimétrique,
minicarte, historique de neige, récapitulatif imprimable, comparateur de
logements). Les modules de `src/lib` qu'ils lisaient restent, avec leurs tests.

Les cinq primitives de `src/components/base/` (Bouton, Champ, Etiquette,
Liste, Tableau) restent aussi : elles sont le système décrit par `base.css`,
pas des écrans. Les écrans v7 emploient leur propre vocabulaire (`btn7`,
`puce`, `jeton`…) ; rapprocher les deux est un chantier à part.

## Trois points tranchés le 13 septembre 2026

- **Tableau de comparaison unique**, comme la maquette (décision 6 ci-dessus).
- **Couverture** : `/hero.jpg` reste, aucun crédit n'étant connu dans le dépôt
  pour ce fichier ; la mention « Crédit photo à relever » est donc exacte.
- **Sections hors maquette** (profil, minicarte, historique de neige,
  récapitulatif imprimable) : retirées avec leurs composants, ci-dessus.

## Conformité à l'export du 16 septembre 2026

Un second export du même projet est arrivé le 16 septembre. Comparé bloc par
bloc au portage, il a donné une trentaine d'écarts réels, corrigés dans les
commits qui suivent ce document. Sur les quatre écarts alors assumés, trois
sont refermés et le quatrième a changé de camp.

1. **Le panneau « Centrales de réservation » (App.dc.html:466-487) n'est pas
   porté.** Ce n'est plus un écart mais une décision partagée : la reprise du
   16 septembre range ce panneau parmi ce qu'il ne faut pas porter. Il était de
   toute façon inatteignable dans la maquette : `auditOpen` naît à `false`,
   Échap le remet à `false`, et `openAudit` — la seule fonction qui le passerait
   à `true` — n'est liée à aucun balisage, dans aucun des dix fichiers de
   l'export. L'objet `cen` (l. 890-892) est mort de la même façon. Ses textes
   achèvent de le disqualifier : le bandeau (l. 907) finit par « Les annonces
   affichées dans **cette maquette** viennent du relevé du 3 sept. 2026 aux
   2 Alpes », et ses compteurs — « 49 centrales de station, 5 de domaine »,
   « 27 connecteurs, 19 qui répondent » — sont tapés à la main. Le sens de
   l'autorité est d'ailleurs inversé : les lignes 660-712 de la maquette
   recopient `src/lib/scrape/centrales/registre.ts` et `hotes/index.ts`, en le
   disant en commentaire, et la copie est déjà périmée. La source vivante est
   le dépôt.
2. **La pilule de séjour a quitté Comparer et Logements.** Écart refermé :
   `showStayBar = screen !== 'compare' && screen !== 'lodgings'`. Logements
   porte maintenant son propre résumé de séjour dans son en-tête collant, avec
   la loupe qui relance le relevé ; Comparer n'en a pas besoin, l'écran ne
   dépendant pas des dates. Le panneau « Votre séjour » reste joignable des
   deux côtés.
3. **La loupe de l'accueil ouvre la fiche de la station désignée.** L'écart
   change de camp : le dépôt avait tranché l'inverse (commit `408a7cb`), la
   maquette tranche ainsi, et c'est elle qui fait foi.
4. **L'indice de défilement de la couverture est un bouton.** Écart refermé :
   il défile jusqu'à `hauteur du héros − 60 px`, animé à la main sur 420 ms,
   s'efface au-delà de 45 % de la hauteur du héros et réapparaît en remontant.

Deux autres écarts de l'export sont déjà couverts plus haut : la neige confinée
à la couverture, et le voile renforcé de cette même couverture.

## Reprise complète de la maquette v7 (16 septembre 2026)

Reprise écran par écran, mesurée au navigateur contre l'export monté sur son
banc d'essai : `getBoundingClientRect` et `getComputedStyle` des deux côtés,
1440 × 900 puis 1280 × 800. Rien n'est jugé à l'œil.

### Données

- **Le référentiel du dépôt fait 320 stations, celui de la maquette 318.** Le
  dépôt gagne : la maquette lit un instantané exporté, le dépôt assemble ses
  sources à chaque montage. Les deux stations en plus ne sont pas une erreur de
  la maquette, c'est son export qui a vieilli.
- **Vingt-deux coordonnées reprises** de `stations-map-data.json`, dans
  `GPS_FIXES` (`src/lib/classeur.ts`). Trois identifiants diffèrent de ceux de
  la maquette et ont été traduits : `avoriaz-1800` → `avoriaz`,
  `chamonix-mont-blanc` → `chamonix`, `les-carroz-d-araches` → `les-carroz`.
  `Station.posRelevee` dit, pour chaque station, si sa position est relevée ou
  ramenée au centre de la commune ; la carte de Comparer l'écrit sur la
  vignette de survol.

### Ce qui a été porté

| Écran | Ce qui change | Fichiers |
| --- | --- | --- |
| Barre du haut | Logo sans pictogramme, pilule retirée de Comparer et de Logements | `Coquille.tsx`, `v7.css` |
| Accueil | Couverture pleine hauteur, indice de défilement devenu bouton, cascade d'entrée aux temps de la maquette, loupe qui ouvre la fiche, « Toutes les stations → » | `index.tsx`, `v7.css` |
| Comparer | En-tête sur une ligne, barre collante unique à `top: 60px`, champ de recherche à sa hauteur de maquette (42 px), saisie en 14 px, compte en infobulle, plus de bloc « Aucune station cochée » | `comparer.tsx`, `v7.css` |
| Carte de Comparer | Étiquettes de nom désencombrées : les épingles gagnent toujours, les noms cèdent par priorité croissante | `CarteEpingles.tsx`, `epingle.ts`, `v7.css` |
| Logements | Bloc collant unique (en-tête, fiche station, ligne Filtres + tri), pilule de séjour et loupe de relance, fiche station resserrée, panneau de filtres ancré à gauche, carte à `top: 254px` | `logements.tsx`, `v7.css` |
| Panneau Filtres | Périmètre en quatre boutons (5 / 12 / 25 / 50 km, 12 par défaut), fond et boîte de la maquette, pied resserré | `logements.tsx`, `lodgingFilter.ts`, `v7.css` |
| Réservation | Bloc « Ce que ce récapitulatif ne dit pas », ligne « Trajet » et phrase sur le paiement retirés | `reservation.tsx` |
| Jetons | `--color-bloc-fond`, `--color-panneau-fond`, `--color-panneau-fond-large`, `--radius-vignette` | `system.css`, `styles.css` |

### Une classe d'écart qui revenait partout : la boîte

La maquette ne pose `box-sizing` nulle part ; le dépôt est en `border-box`
depuis la préparation Tailwind. Partout où la maquette écrit une largeur ou une
hauteur **et** un rembourrage ou une bordure, elle rend deux pixels — ou
quarante — de plus que ce qu'elle déclare. Trois surfaces étaient concernées et
repassent en `content-box`, avec la valeur déclarée de la maquette :

- la pilule de séjour de Logements : `height: 40px` + 1 px de bordure = 42 px,
  et l'en-tête avec elle ;
- le champ de recherche de Comparer : même compte, et c'est lui qui donne à la
  barre ses 58 px ;
- les deux panneaux Filtres : 460 + 40 = 500 px de large sur Comparer,
  520 + 40 = 560 px sur Logements.

### Écarts assumés, avec leur raison

1. **Les onglets de station restent au-dessus de Logements et de la fiche.**
   La maquette ne les a pas ; le dépôt les a mis pour dire que la fiche et les
   logements sont deux pages de la même station. Ils ne sont pas collants : ils
   décalent le premier écran de 68 px et défilent ensuite. Ils ne figurent pas
   dans la liste des suppressions de la reprise.
2. **Les paliers de distance de la barre de Logements** (« Pied des pistes »,
   « ≤ 500 m », « ≤ 1 km », « ≤ 2 km ») restent, la maquette ne les ayant pas.
   Ils ne sont pas non plus dans la liste des suppressions, et ils font le
   travail que le curseur de distance du panneau fait plus lentement.
3. **Les encadrés collants de la fiche station et de la réservation collent à
   `top: 76px`**, valeur demandée par la reprise. La maquette, elle, écrit
   `top: 254px` sur la fiche (App.dc.html:305) et `top: 138px` sur la
   réservation (l. 448) — deux valeurs différentes pour deux écrans où rien
   d'autre n'est collant. 76 px, c'est la barre du haut plus la marge de
   l'écran : l'encadré s'arrête juste sous la barre. La consigne l'emporte ici
   sur la maquette ; un mot suffit à revenir aux deux valeurs d'origine.
4. **Logements garde cinq tris, là où la maquette en propose trois.**
   « Tri : distance » et « Tri : incomplètes d'abord » ont d'abord été retirés,
   la reprise nommant les trois de la maquette ; ils sont rendus le 16 septembre
   sur décision du propriétaire. La liste des suppressions de la reprise ne les
   nommait pas, et une commande qui marche ne se retire pas parce qu'un
   instantané de maquette ne la montre pas.
5. **Logements garde sept bascules de qualité du relevé, là où la maquette en a
   cinq.** Même histoire et même décision : « Fiche complète » et
   « Incomplètes » sont rendues au panneau, avec leurs jetons et leur
   exclusivité — cocher l'une décoche l'autre.
6. **La section vide de comparaison de la maquette n'est pas reproduite.** Sur
   Comparer, l'export laisse un `<section>` de hauteur nulle entre la barre et
   les deux colonnes, qui ajoute 16 px d'écart de grille et descend la carte à
   212 px au lieu de 196. C'est un artefact de son harnais, pas une intention.

## Deux pièges rencontrés

- **Verrous lus dans une fermeture.** `useGo` capturait `stationId` au rendu ;
  « Retenir et voir les logements » retenait puis refusait le passage. Il lit
  maintenant le magasin à l'appel.
- **Premier rendu du navigateur.** Zustand sert l'instantané initial (rien de
  retenu) pendant l'hydratation ; un effet qui redirige sur `!stationId`
  renvoyait toute visite directe de `/logements` vers Comparer. Les effets
  relisent `useParcours.getState()`.

## Vérification

- `npm run typecheck` : vert.
- `npm test` : 180 sur 197 ; les 17 rouges sont rouges avant la reprise aussi
  (gabarit, squelette d'og, écriture atomique), aucune dans les fichiers
  touchés.
- `npx eslint src` : 5 erreurs préexistantes (`app-data/client.server.ts`,
  `pistes.ts`, `stay/tarif.test.ts`), aucune dans les fichiers touchés.
- Recette de la reprise, mesurée à 1440 × 900 : couverture de 840 px ; indice
  de défilement qui part à 780 px et revient ; barre de Comparer à 60 px après
  1 500 px de défilement ; panneau ouvert sous son bouton et fermé au clic sur
  le titre ; 320 noms sur la carte, 6 affichés au cadrage France sans un seul
  recouvrement, 18 après deux crans de zoom ; bloc collant de Logements de
  186 px, carte à 780 px du haut sur 900.
- Cinq écrans vus tourner dans le navigateur à 1440×900 : panneaux de la barre,
  recherche par Entrée, comparaison à trois stations, filtres, fiche avec et
  sans photo, logements des 2 Alpes (94 annonces, relevé en direct), volet,
  pied, réservation, bandeau « réservé », panneau de séjour, menu « Plus »,
  écran de contrôle `/carte` sous la nouvelle barre.

## Prix (maquette du 24 septembre 2026)

Source : l'archive `Skitrack-handoff.zip` réexportée le 24 septembre 2026 à
23 h 25, fichier `SKITRACK v7 - Prix par station.dc.html` (titre « Prix »,
onglets « Par station » et « Par budget »), et `V7Coquille.dc.html` pour le
lien « Prix » de la barre. Un premier export du même soir n'avait que la vue
par station ; c'est le second qui fait foi.

### Où c'est porté

| Maquette | Dépôt |
| --- | --- |
| Écran, onglets, tableau, onglet budget | `src/routes/prix.tsx` |
| Liste, carte aux pastilles et volet de l'onglet budget (ceux de Logements) | `src/components/v7/CarteLogement.tsx`, `Pages.tsx`, `CarteEpingles.tsx`, `FicheEpingle.tsx`, `VoletAnnonce.tsx`, `OffresLogement.tsx` |
| Calculs, filtres, tris, libellés (`ligne`, `passe`, `PLAGES`, `TRIS`…) | `src/lib/prix/calcul.ts` (+ `calcul.test.ts`) |
| Logements de station, critères de l'onglet budget (`dansLaStation`, `passeAnnonce`, `optionsDomaine`, `optionsStation`, `choisirMassif`…) | `src/lib/prix/calcul.ts` ; distance lue par `distFiltrableM` (`src/lib/stay/lodgingFilter.ts`), gare la plus proche par `nearestAnyLift` (`src/lib/remontees.ts`) |
| `lancer`, `demarrer`, `tick`, `suivant` : la course et sa file | `src/lib/prix/releve.ts` |
| Créneau Airbnb avant chaque station | `src/lib/prix/attente.ts`, `attentePlacesMs` dans `src/lib/stay/taux.server.ts` |
| Complétion des relevés (décision 14) | `src/lib/prix/tranches.ts` (boucle d'une station), `completion.ts` et `completion.server.ts` (`completerProfond`), `aCompleter` et les correctifs dans `calcul.ts` ; `src/lib/stay/memoireFiches.server.ts`, `recopie.ts`, `limiteHotes.ts` ; garde-fous dans `completerFiche.server.ts`, `priseFiche.ts`, `lectureFiche.ts`, `http429.ts` |
| Annonces de l'onglet budget | `src/lib/prix/annonces.ts` (IndexedDB) ; Réservation les relit par `annonceEnMemoire` (`src/lib/accommodation.ts`) |
| Curseurs à deux poignées | `src/components/v7/Fourchette.tsx` |
| Lien « Prix » et son filet | `Coquille.tsx`, `v6/go.ts`, `Icon.tsx` (`barres`), `i18n/catalog.ts` (`nav.prices`) |
| Styles | `src/design/v7.css`, sections « Fourchette » et « Prix par station » |

### Décisions (24-25 septembre 2026)

1. **Les relevés sont réels.** La maquette simulait tout sauf un relevé figé
   des 2 Alpes. Ici, « Relever » lance les cinq parts de la recherche de
   Logements (`searchStay` : airbnb, cozy, greengo, centrales, gîtes), sans
   `relance` (le relevé Airbnb de quinze minutes sert aux deux écrans), sans
   repli sur le relevé figé, et sans rien écrire dans `useStay`.
2. **Une station à la fois, serveur compris.** Avant chaque station, la course
   attend que le journal de taux Airbnb puisse prendre douze requêtes d'affilée
   (`attentePlacesMs`), que le coupe-circuit soit fermé, et que Logements ait
   fini sa propre recherche (76 s au plus). Un verrou `navigator.locks` la
   sérialise entre onglets. « Arrêter » ne coupe plus la station en cours : le
   serveur la finirait quand même, et la suivante l'attend. Trois parts au plus
   en même temps : l'application de bureau parle HTTP/1.1, six connexions par origine,
   et une longue course doit en laisser au reste de l'écran. Jamais de reprise
   automatique après un refus d'Airbnb.
3. **La médiane porte sur des logements.** Mêmes critères que Logements (zone,
   GPS précis, prix relevé pour ces dates exactes et récent, offre Gîtes
   vérifiée, euros), plus la règle de la maquette : une annonce sans capacité
   est écartée et comptée, jamais supposée assez grande. Un même logement vendu
   sur deux ou trois plateformes compte une fois, à sa meilleure offre
   (`regrouper`) : sans cela, deux vrais logements suffisaient à atteindre les
   cinq annonces d'une médiane. D'où « Logements » en tête de colonne.
4. **Les résultats ont pour clé la période et le groupe**
   (`du|nuits|voyageurs|chambres|station`). La maquette oubliait le groupe : une
   médiane pour huit voyageurs se serait affichée pour quatre.
5. **Stockage.** Période et résultats dans `localStorage`, clé `skitrack-prix`
   (4 000 résultats au plus, les plus anciens partent). Les annonces retenues,
   trop lourdes pour lui, dans IndexedDB (`skitrack-prix`, une entrée par
   résultat). Onglet, critères, tris et page de la liste vivent dans le
   magasin sans être enregistrés : changer d'onglet, ou passer par Réservation
   et revenir, ne perd rien. L'annonce ouverte et le cadre de la carte restent
   à l'écran. L'onglet budget ne lit dans IndexedDB que les stations relevées
   (résultat « fait » pour la période et le groupe) ; les critères de station
   s'appliquent après la lecture, pour qu'en élargir un ne vide pas l'écran.
   Les relevés faits avec la version du 25 septembre 2026 au matin (#47)
   n'enregistraient pas la position des logements, qui n'ont donc pas de
   pastille : l'onglet budget le dit, et propose de relever d'un clic celles
   de ces stations qui ont un logement dans la liste. Un autre onglet ouvert
   sur l'écran relit les annonces à mesure qu'elles sont relevées. Le relevé en cours s'y suit aussi, et les pastilles arrivent au
   fil des stations terminées ; la légende de la carte compte les logements
   de la page sans position.
6. **La période suit le séjour** tant qu'on ne la change pas ici ; revenir sur
   ses dates la lui rend. Pas d'arrivée dans le passé : un relevé pour des dates
   écoulées dépenserait le quota Airbnb pour rien.
7. **Un échec ne remplace jamais une médiane.** Si le serveur de l'application
   ne répond plus (toutes les parts rejetées, aucune par délai), la course
   s'arrête et le dit ; elle ne passe pas toute la liste en échec en quelques
   millisecondes.
   Une source muette marque la station « partiel, sans … ».
8. **La course continue quand on quitte l'écran** (boucle au niveau du module,
   comme `maj.ts`), pas après un rechargement. Un point sur le lien « Prix »
   signale qu'elle tourne.
9. **L'onglet budget reprend Logements** (demande du propriétaire, 25
   septembre 2026). Sous les critères, inchangés, la mise en page de Logements
   choisie par le propriétaire, « Liste et carte » : à gauche les cartes
   d'annonce de Logements (photo, source, capacité, chambres, distance, prix,
   prix par personne, disponibilité, « Retenir »), 18 par page ; à droite la
   carte aux pastilles de prix des annonces de la page, avec la fiche de
   pastille et ses actions, et la liste qui suit le cadre. Pas de repère de
   station : la liste en mêle plusieurs. L'étiquette de source nomme aussi la
   station (« Airbnb · La Clusaz »), la carte d'annonce n'ayant pas d'autre
   place pour elle. Une annonce sortie des relevés de deux stations voisines
   n'y figure qu'une fois, sous la station de la copie mesurée au plus près
   des remontées ; à égalité, celle dont le repère est le plus proche de la
   remontée du logement, puis la première du référentiel (26 septembre 2026 :
   « La Cascade - La Giettaz », sortie à égale distance des relevés de Cordon,
   de Crest-Voland et de La Giettaz, s'étiquetait « Cordon »). Pas le repère le
   plus proche du logement lui-même : une maison d'Ax-les-Thermes, plus près du
   repère nordique du Chioula, skie à Ax. C'est cette copie que le volet montre
   et que « Retenir » retient. Après un geste sur la carte, le cadre choisi tient pendant un
   relevé en cours ; il ne se recadre qu'à un changement de critère, de dates
   ou de groupe.
   Un logement vendu sur plusieurs plateformes fait une seule carte, comme dans
   Logements : l'étiquette dit « Booking + 1 · Albiez-Montrond », son infobulle
   « Aussi sur Airbnb (3 084 €) », et le volet « Ce logement sur 2
   plateformes », d'où l'on passe à l'autre offre et la retient. Le relevé
   garde pour cela toutes les offres retenues (`retenirOffres`), la médiane
   n'en comptant toujours qu'une par logement ; l'onglet les regroupe
   (`logementsReleves`, `logementsBudget`). Avant ce changement (soir du
   25 septembre 2026), seule la moins chère était gardée : à Albiez-Montrond,
   le seul appartement Airbnb de la station, vendu moins cher sur Booking,
   n'apparaissait nulle part sous le nom d'Airbnb. Les relevés plus anciens
   montrent une carte par offre gardée, sans les autres plateformes, jusqu'à
   un nouveau relevé.
10. **« Voir le logement » est remplacé par le volet de l'annonce.** Il menait
    à la page Logements et non au logement. Un clic sur une carte ou sur « Voir
    l’annonce » d'une pastille ouvre désormais le volet de Logements dans
    l'écran Prix. « Retenir » y fait ce que faisait le lien de la maquette
    (App.dc.html:503) : la station du relevé est retenue, le séjour prend les
    dates de la période, le logement est retenu, et la période suit de nouveau
    le séjour. Le volet propose alors « Passer à la réservation ». Réservation
    retrouve ce logement par `resolveListing`, qui fait passer devant la
    copie tarifée pour les dates du séjour (annonce en direct de Logements ou
    annonce relevée ici, `annonceEnMemoire`) : une annonce en direct d'autres
    dates, ou un gîte du relevé figé au même code, rendait sinon le prix et le
    lien d'autres dates. Après un rechargement direct de `/reservation`, la
    mémoire est vide et l'écran renvoie vers Logements.
11. **Le paragraphe de couverture est retiré** (demande du propriétaire, 25
    septembre 2026). « Annonces relevées du … dans N stations sur 320 : … »
    listait toutes les stations relevées ; le compte « N logements dans M
    stations » et les états vides suffisent.
12. **Des logements de station seulement** (demande du propriétaire, 25
    septembre 2026 : ne plus voir de logements « qui n'ont absolument rien à
    voir avec les stations de ski »). « Dans la station » veut dire à 2 km au
    plus d'une remontée mécanique (`DISTANCE_STATION_M`, `dansLaStation`). La
    distance est celle du filtre de Logements, `distFiltrableM` : la gare de
    remontée la plus proche (`distToLiftM`), à défaut le repère de la station.
    Une distance inconnue écarte. Le rayon de 12 km reste la première
    barrière, mais il laissait passer la vallée.
    - **La gare la plus proche.** Pour un logement du domaine cherché ou d'un
      domaine relié (`domainFit` « in » ou « linked »), `attachAccess` garde
      la plus proche de deux gares OpenStreetMap : celle de la liste propre à
      la station (`nearestLift`, `osmAccess.snapshot.json`) et celle des
      6 313 gares de `osmLifts.json` (`nearestAnyLift`, `remontees.ts`, index
      en grille, le même résultat qu'un parcours complet). La liste de la
      station seule en oubliait : au repère, Saint-Martin-de-Belleville
      mesurait 2 839 m (« Olympic ») au lieu de 27 m (« Village »), et
      Saint-François-Longchamp, Les Carroz, Monts Jura, Le Grand Valtin,
      Villard-de-Lans et Le Mont-Dore perdaient de même leur village. Une
      gare de l'index national ne compte que si elle est à 3 km au plus du
      repère de la station cherchée ou de la station la plus proche
      (`nearestStationLift`) : sans cela, le téléphérique de la Bastille à
      Grenoble, le funiculaire d'Évian ou un téléski de Moûtiers faisaient
      passer des appartements de ville pour des logements au pied des pistes.
      Les remontées en projet, désaffectées ou abandonnées ne comptent pas
      (26 septembre 2026) : l'ancienne télécabine de Charlannes mettait le
      bourg de La Bourboule à 307 m des pistes, quand la première remontée de
      ski en service est à 6,2 km. Le script
      `scripts/retirer-remontees-hors-service.mjs` retire des deux fichiers ce
      qu'openskidata.org dit désaffecté, abandonné ou en projet, et ce qui
      n'est rattaché à aucun domaine skiable : appareils privés, funiculaires
      et téléphériques urbains ou de service, câbles plats (téléskis
      nautiques), plus le télésiège du Glacier des Bossons et la corde du
      tremplin de Ventron, désignés. Le funiculaire du Capucin, au Mont-Dore,
      est retiré par décision du propriétaire ; l'Aiguille du Midi et la Mer
      de Glace sont gardées. 716 gares retirées au total, listées dans
      `remonteesRetirees.json` ; un filtre sur le nom
      (`remonteeEnService.ts`) écarte en plus les projets, les appareils
      « anciens », démontés ou démolis, les téléphériques EDF ou de service et
      les téléskis nautiques (« Téléphérique EDF » mettait le bourg d'Ugine à
      745 m des pistes de Bisanne 1500). Une annonce déjà enregistrée, mesurée
      à l'une de ces gares, se remesure à sa relecture (`remesurerRemontee`),
      même plus loin.
      Hors du
      domaine, aucune remontée n'est gardée, et la remontée « cherchée »
      (`searchedLiftM`) reste celle de la liste de la station : un logement de
      Bonneval-sur-Arc cherché depuis Val d'Isère n'est pas « au pied des
      pistes » parce que le tapis de Bonneval est à côté.
    - **Relevés.** `cribler` applique la règle avant tout compte : la médiane,
      le nombre de logements, les annonces sans capacité et les trop petites
      des prochains relevés ne portent que sur des logements de station. **Les
      résultats déjà enregistrés ne changent pas** : leur médiane et leur
      compte gardent l'ancienne règle (12 km) jusqu'au prochain relevé de la
      station pour les mêmes dates et le même groupe. La note sous le tableau
      le dit : « Depuis le 25 septembre 2026, un relevé ne compte que les
      logements à 2 km au plus d’une remontée ; relevez à nouveau une station
      pour l’appliquer à ses résultats plus anciens. »
    - **Onglet budget.** Les annonces déjà enregistrées passent aussi par la
      règle, à l'affichage, avec le filtre « Distance aux remontées » aux
      paliers de Logements : « Au pied des pistes » (200 m), « 500 m au
      plus », « 1 km au plus », « 2 km au plus », 2 km par défaut et jamais
      plus (un palier inconnu se relit 2 km, `distMaxLue`). Les annonces de
      l'ancien format (#47) n'ont que la distance au repère : elles restent
      filtrables par elle. Celles du format actuel (#48) gardaient la distance
      de la seule liste de la station : elles se remesurent à la lecture
      (`remesurerRemontee`, `annonces.ts`), la gare la plus proche de toutes
      remplaçant la leur quand elle est plus près, dans le domaine seulement ;
      une annonce sans position ne change pas. Une annonce sortie des relevés
      de deux stations garde la copie la plus proche des remontées (la
      première du référentiel à égalité, `filtrerCartes`) : la copie retenue,
      sa distance et la station nommée ne changent plus avec le palier. Une
      liste que la seule règle vide le dit : « Aucun logement de station pour
      ces dates ».
13. **Nouveaux critères de l'onglet budget** (même demande : filtrer par
    domaine skiable, station, prix, chambres, personnes). Ils vivent dans les
    `Filtres` du magasin (`domaine`, `station`, `capacite`, `chambres`,
    `distMax`) mais ne valent que pour cet onglet : `passe`, `jetons` et
    `filtresActifs` de l'onglet station les ignorent.
    - **Domaine skiable** : les valeurs de `Station.domain` des stations du
      massif et du département choisis, triées, avec leur nombre de stations.
      « domaine non nommé (OpenStreetMap) » n'est pas proposé : trois domaines
      distincts et sans rapport le portent (`UNNAMED_DOMAIN`, `classeur.ts`).
    - **Station** : les stations relevées pour la période et le groupe
      affichés qui passent massif, département et domaine, triées ; « Toutes »
      d'abord. Deux homonymes (« Praloup », « Le Granier ») se distinguent par
      leur domaine, à défaut leur département ou leur massif
      (`nomsDistincts`). La station choisie reste dans la liste quand elle n'a
      pas de relevé pour d'autres dates : le choix affiché dit le filtre réel.
      La liste vide le dit alors, comme pour un domaine dont aucune station
      n'est relevée dans le massif et le département choisis
      (`lieuSansReleve`) : « Ce lieu n’a pas été relevé pour ces dates »,
      « Lancez un relevé dans l’onglet Par station, ou choisissez d’autres
      dates. », avec le bouton vers l'onglet station.
    - **Cascade** : un autre massif vide département, domaine et station ; un
      autre département, domaine et station ; un autre domaine, la station.
      Retirer le jeton fait de même. `passeStationSeule` lit domaine et
      station.
    - **Personnes** (1 à 20, « 20 pers. et plus ») et **Chambres** (0 à 8,
      « 8 ch. et plus »), au pas de un. Les chambres sont celles annoncées, ou
      les pièces moins une (`normalizedBedrooms`, un studio a zéro chambre).
      Une valeur absente écarte l'annonce quand la plage est active, comme les
      autres critères. Le prix est la fourchette « Budget, total du séjour »,
      inchangée.
    - **Jetons** : « Domaine : Les Trois Vallées », le nom de la station,
      « Remontées : 500 m au plus » (la distance ne compte comme critère
      qu'écartée de ses 2 km), « Au pied des pistes » pour 200 m (sans
      « Remontées : », qui dirait les remontées au pied des pistes),
      « Personnes : 4 pers. et plus », « Chambres : 2 ch. à 3 ch. ». « Tout
      effacer » les remet tous au repos.
    - **Tri** : « Plus près des remontées » s'ajoute (distance croissante,
      puis prix, distance inconnue en dernier).
    - **Mise en page** : la ligne du budget, du tri, du massif et du
      département ; une ligne Domaine skiable, Station, Distance aux
      remontées (le choix du domaine va jusqu'à 340 px, que demande le plus
      long, « Domaine Skiable Saint-Léger-Les-Mélèzes · 1 » ; les autres
      restent à 288 px) ; cinq fourchettes (Personnes, Chambres,
      Kilomètres de pistes, Sommet, Altitude du village) ; les jetons. Dans
      ces cinq colonnes, le résumé passe sous le libellé : sur une ligne,
      « Kilomètres de pistes » et « 100 km à 600 km » demandent 236 px pour
      211, le libellé passait à la ligne dans une colonne et pas dans sa
      voisine, et les rails ne s'alignaient plus.
14. **Les relevés complètent leurs annonces** (demande du propriétaire, 25
    septembre 2026 : une position, une capacité et un nombre de chambres pour
    chaque logement de chaque source). Entre les cinq parts et la médiane,
    sous le verrou de la station, `completerStation` (`tranches.ts`) cherche ce
    qui manque aux annonces que la médiane pourrait compter. Ce sont celles de
    `aCompleter` (`calcul.ts`) : les critères de `cribler` jusqu'au prix
    confirmé, sans exiger ni position ni capacité, moins les annonces déjà
    trop petites pour le groupe et celles dont la position connue est à plus
    de 2 km d'une remontée, que rien ne ferait compter. Du moins cher au plus
    cher :
    - **Mémoire des fiches** (`memoireFiches.server.ts`, aucune requête) :
      capacité, chambres, pièces et position par annonce (`cleListing`),
      trente jours, dans `fiches.json` du dossier de configuration, à côté de
      `cles.json`, écrite d'un bloc (fichier temporaire, puis `rename`). Elle
      reçoit toute annonce complète d'un relevé Prix, toutes sources, avant
      toute recopie, et toute fiche lue. Elle ne comble que les trous. Chaque
      valeur a sa date : celle que personne n'a republiée depuis trente jours
      s'efface, même si l'annonce a été revue pour une autre. Une fiche Airbnb
      lue, pleine ou vide, est notée comme lue et ne se redemande plus avant
      trente jours, ni à la station voisine, ni à la course suivante (sauf
      d'un lot que le worker juge illisible).
    - **Recopie entre offres d'un même logement** (`recopie.ts`, aucune
      requête) : dans un groupe de `regrouper`, même titre à 150 m au plus,
      ou même identifiant CozyCozy et même titre, capacités compatibles.
      Jamais entre deux logements distincts : un groupe que `regrouper` a
      formé de proche en proche et qui réunit deux capacités contradictoires
      (4 et 6 personnes) ne recopie rien. Jamais une valeur publiée
      remplacée ; la provenance le dit (« même logement »).
    - **Tranches de 45 s** (`completerProfond`, `completion.ts`) : les pages
      de fiche hors Airbnb (centrales, Gîtes, Abritel pour la seule position ;
      Booking reste laissé à cause de son défi anti-robot, et la page d'hôte
      GreenGo ne publie rien de sûr) et, en même temps, les fiches Airbnb du
      worker Python (`lireFichesAirbnb`, 60 au plus par tranche, les moins
      chères d'abord). Une fiche Airbnb d'hôtel, de chambre ou d'hébergement
      insolite retire l'annonce du relevé. Si Airbnb ne connaît plus la
      requête de fiche (`hash`), les pages `rooms/` prennent le relais, une à
      une, 6 s au moins entre deux, arrêt au premier refus.
    - **Entre deux tranches**, la recherche de Logements passe d'abord,
      l'attente demandée par le limiteur Airbnb est tenue (une minute au
      plus), et le créneau Airbnb est relu. « Arrêter » coupe entre deux
      tranches ; celle qui est partie va au bout côté serveur, et la station
      suivante l'attend. Ses cinq parts déjà rendues, la station arrêtée
      pendant sa complétion écrit quand même sa médiane et ses annonces, avec
      ce que les tranches ont posé ; arrêtée pendant ses parts, elle n'écrit
      rien (`ecritureDuReleve`). Pas de plafond de nombre par station ; quatre
      tranches de suite qui n'avancent en rien arrêtent la station (quinze
      quand le limiteur Airbnb fait attendre). Avancer, c'est changer
      quelque chose : une fiche essayée ou laissée, une annonce retirée, une
      valeur posée. Une requête partie sans rien de cela (une page coupée à
      l'échéance) n'en est pas un.
    - **Refus.** Un refus d'Airbnb (429, 503, 403, page de blocage, ou le
      coupe-circuit qu'il a ouvert, lu dans une tranche ou au créneau) : plus
      aucune fiche Airbnb jusqu'à la fin de la course, sans reprise. Une panne
      (clé, worker, format illisible) les arrête aussi, raison au journal. Un
      hôte qui refuse une page (429, 403, 503), ou qui la laisse sans réponse
      15 s ou plus, n'est plus sollicité de la course.
    - **Garde-fous communs aux deux écrans.** Un 403 d'Airbnb est un refus :
      il passait pour une page vide, et la fiche suivante partait. Deux
      lectures au plus en même temps par hôte, une seconde entre deux
      départs, tenue d'une passe à l'autre et comptée une fois la place de
      lecture prise, l'hôte laissé au premier 429, 403 ou 503
      (`limiteHotes.ts`) : dix lectures partaient ensemble vers une même
      centrale. Une URL que portent deux annonces du relevé, l'accueil ou la
      page de recherche du site n'est jamais ouverte comme une fiche : le
      point et la taxe de séjour de l'office se posaient sur toutes les
      annonces. Le point, la rue et la commune du loueur ne sont jamais ceux
      du logement (Ingénie : seul `location.geo` compte, jamais le
      `LocalBusiness` de l'agence), même repris ailleurs dans la page. La
      taxe de séjour d'une fiche ne s'ajoute plus à un total de panier, qui
      la contient déjà.
    - **Bandeau** : « La Clusaz : fiches 12 sur 57 » pendant la complétion
      (fiches essayées, sur celles qui en attendaient une après la mémoire) ;
      après un refus, « Airbnb a refusé des requêtes : fiches Airbnb
      suspendues pour cette course. »
    - **Rien n'est inventé.** Une valeur absente reste absente, et `cribler`
      exige toujours position et capacité. La complétion ne change aucun
      prix : la taxe de séjour qu'une page de centrale publie ne s'ajoute pas
      au total dans Prix, pour que la médiane ne mêle pas des totaux avec et
      sans taxe. Les correctifs se posent avant la médiane et avant les
      annonces de l'onglet budget ; une position trouvée se mesure aussitôt
      (`attachAccess`), pour la règle des 2 km. L'écran Logements ne change
      pas de rythme : il ne lit ni n'écrit la mémoire des fiches, et seuls les
      garde-fous communs le touchent.

### Écarts assumés

| Sujet | Maquette | Application | Pourquoi |
| --- | --- | --- | --- |
| Colonne et tri du nombre | « Annonces », « Nombre d’annonces » | « Logements », « Nombre de logements » | décision 3 |
| Relevé simulé | pastille « Maquette : aucun prix simulé » | absente | décision 1 |
| Bornes des nuits | couleur grisée, bouton actif | bouton désactivé, opacité 0,4 | règle de `.compteur__pas` |
| Disponibilité sur les cartes | toujours ambre | vert quand le prix est confirmé | la maquette n'avait jamais de prix confirmé ; Logements met ce vert |
| Cartes du budget | trois par rang, 60 sans le dire, station, titre, fiche, total et « Voir le logement » | cartes d'annonce de Logements, 18 par page, carte aux pastilles de prix à droite | décision 9 |
| « Voir le logement » | ouvre Logements | ouvre le volet de l'annonce dans Prix | décision 10 |
| Couverture sous les critères | « Annonces relevées du … dans N stations sur 320 : … » | absente | décision 11 |
| Logements retenus | non précisé (l'application gardait 12 km autour de la station) | à 2 km au plus d'une remontée | décision 12 |
| Critères du budget | budget, tri, massif, département, trois plages de station | plus domaine skiable, station, distance aux remontées, personnes, chambres, et le tri « Plus près des remontées » | décision 13 |
| Fourchettes du budget | trois, libellé et résumé sur une ligne | cinq, résumé sous le libellé | décision 13 |
| Libellés au singulier | « 1 affichées sur 1 », « les 1 stations » | « 1 affichée sur 1 », « Relever à nouveau la station » | accord |
| Tri choisi par un en-tête | le choix affiché pouvait mentir | l'option manquante s'ajoute (« Nom, de Z à A ») | le choix affiché dit le tri réel |
| Bouton de relevé | caché si la liste du même nom tourne | ne relance que les stations non prévues | une liste filtrée grandit pendant une course |
| Infobulle du lien | « Prix médian d'une semaine… » | « Médiane d’un séjour par station, et logements dans votre budget » | l'écran compte de 1 à 21 nuits, et deux vues |
| Apostrophes | droites et courbes mêlées | courbes partout | règle de la maison |
| Libellés reformulés | « Km de pistes », « Ouvrir Par station », « partiel, sans Airbnb, Booking », « Relevé Alpes du Nord, … » | « Kilomètres de pistes », « Ouvrir l’onglet Par station », « partiel, sans Airbnb ni Booking », « Relevé : Alpes du Nord, … » | français correct |
| Barre étroite des écrans de contrôle | rien | sous 1 100 px, le parcours se resserre | le lien « Prix » poussait « Plus » hors de l'écran |
| Bandeau du relevé | « N sur M · station en cours » | plus « fiches N sur M » pendant la complétion, et la ligne du refus d'Airbnb | décision 14 |

### Vérification

- `npm run typecheck` : vert. `npx eslint src` : aucun problème.
- `npm test` : 1 045 tests TS verts (173 dans `calcul.test.ts`, 7 nouveaux dans
  `taux.test.ts`) ; scripts 205 sur 210, les 5 sautés habituels.
- `vite build` : vert ; rien du journal de taux ni du coupe-circuit dans le
  paquet client.
- Aperçu bâti sur 127.0.0.1:8099, mesuré à 1440 × 900 : écran de 1 280 px,
  marges 32 / 40 / 64 et 18 px entre blocs ; titre 30 px / 800 ; onglets 36 px ;
  cartes à 14 px de rayon, filet `--color-line-douce` ; colonnes
  1fr / 180 / 150 / 240 ; filet d'en-tête de 2 px ; lignes de 72 px avec leur
  bouton. Thème sombre : toutes les couleurs suivent les jetons.
- Un relevé réel, La Clusaz, 6 → 13 févr. 2027, 8 voyageurs : Airbnb direct
  327 annonces en douze requêtes, Abritel 260 et Booking 453 par Cozy, GreenGo
  6, centrale 45, Gîtes sans commune ; médiane 5 733 € sur 293 logements, 127
  annonces sans capacité écartées, aucune source en défaut. L'onglet budget
  montre les 293 logements, le budget « jusqu’à 2 500 € » en garde 20 ; « Voir
  le logement » ouvre Logements avec la carte « Retenu » à 903 €.
- Vu une fois, pas reproduit en quatre essais : une navigation vers Logements
  restée en suspens (adresse changée, écran non rendu, aucun morceau chargé).
- Onglet budget repris de Logements (25 sept. 2026) : `calcul.test.ts` 176 sur
  176, `npm test` 1 050 tests TS et 205 sur 210 côté scripts. Aperçu à
  1440 × 900 sur 60 annonces factices dans cinq stations, dont une annonce
  commune à La Clusaz et au Grand-Bornand : « 60 logements dans 5 stations »,
  18 cartes et 18 pastilles par page, carte collée à 78 px et finie à 24 px du
  bas ; clic sur une carte ou « Voir l’annonce » d'une pastille : le volet
  s'ouvre et l'annonce passe « déjà vue » ; « Retenir » retient la station,
  pose les dates et affiche « Passer à la réservation », et Réservation montre
  le logement ; au retour, onglet budget et page 2 retrouvés ; un autre tri,
  ou un zoom qui change la liste, ramène en page 1. Données effacées ensuite.
- Logements de station et critères du budget (25 sept. 2026) :
  `calcul.test.ts` 218 sur 218, `npm test` 1 092 tests TS et 205 sur 210 côté
  scripts ; `tsc --noEmit` et `eslint` verts. Aperçu bâti sur 127.0.0.1:8098,
  64 annonces factices dans huit stations, dont 22 à plus de 2 km d'une
  remontée ou à distance inconnue : « 42 logements dans 8 stations ». Alpes du
  Nord, Savoie, Les Trois Vallées : 19 domaines proposés, trois stations
  relevées (Courchevel, Les Menuires, Val Thorens) ; Val Thorens et « 1 km au
  plus » : un logement, à 839 m ; un autre massif vide département, domaine et
  station. Les deux Praloup se distinguent dans le choix. À 1 440 × 900, les
  cinq fourchettes font 211 px, rails alignés, et aucun champ ne déborde, même
  avec « 1 200 m à 1 800 m » ; à 1 100 px, 175 px, et « 2000 » tient encore.
  L'onglet station n'affiche aucun des nouveaux critères. Données effacées
  ensuite.
- Complétion des relevés (25 sept. 2026) : `npm test` 1 238 tests TS et 205
  sur 210 côté scripts ; `tsc --noEmit` et `eslint src` verts. La boucle d'une
  station est éprouvée hors ligne sur le vrai `trancheProfonde`, worker Airbnb
  et pages simulés, mémoire dans un dossier temporaire (`tranches.test.ts`,
  `completion.test.ts`) : tranches jusqu'au bout, refus, attente du limiteur,
  arrêt, tranches sans progrès, course suivante servie par la mémoire sans
  requête. `vite build` vert ; ni la mémoire des fiches, ni le worker, ni
  `trancheProfonde` dans le paquet client. Aucun relevé réel : le coût sur
  Airbnb (18 fiches par minute au plus) reste à mesurer. Après relecture, le
  même jour : `npm test` 1 266 tests TS, 205 sur 210 côté scripts, `npm run
  verify` 1 182 ; le chemin serveur est éprouvé à son tour
  (`completerFiche.test.ts`, `fetch` et horloge simulés, états partagés avec
  Python dans un dossier temporaire) : page coupée à l'échéance, hôte muet,
  403, erreur réseau, URL commune, une seconde par hôte d'une tranche à
  l'autre et quand les places manquent, 6 s entre deux pages `rooms/`, taxe
  de séjour.
