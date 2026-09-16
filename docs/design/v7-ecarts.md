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
