# Les questions d'un humain qui prépare un séjour au ski

Inventaire tenu du point de vue de l'utilisateur, pas du code. Chaque question
reçoit trois verdicts :

- **Légitime ?** — un vacancier se la pose-t-il vraiment ;
- **Réponse honnête possible ?** — SKITRACK détient-il la donnée *relevée*
  (l'invariant « rien n'est inventé » interdit d'y répondre par une
  vraisemblance) ;
- **Installée ?** — où la réponse vit dans l'interface, ou pourquoi elle n'y
  est pas.

Trois issues seulement : `✓ écran` (répondue, avec l'endroit), `→ installée le
2026-08-30` (répondue par ce chantier), `✗` (pas de donnée honnête — la
réponse serait une invention, ou le sujet est hors du métier de l'application).
Un `✗` n'est pas un refus définitif : c'est « pas tant qu'une source relevée
n'existe pas ».

## 1. Où aller — le niveau du groupe

| Question | Verdict |
| --- | --- |
| Le domaine est-il adapté à un débutant ? | → installée : répartition des pistes par couleur, fiche du domaine |
| Y a-t-il assez de pistes vertes pour des enfants qui commencent ? | → installée : compte de vertes, fiche |
| Un skieur expert va-t-il s'ennuyer ? | → installée : comptes rouge/noir, fiche |
| Quelle est la proportion de bleues pour un groupe intermédiaire ? | → installée : barre de répartition |
| Combien de pistes au total ? | → installée : total affiché avec la répartition |
| Combien de kilomètres de pistes ? | ✓ carte de station et fiche (`km`) |
| Combien de remontées ? | ✓ fiche |
| Le domaine est-il relié à un plus grand (forfait commun) ? | ✓ badge du forfait relié (`pass`) |
| Y a-t-il un snowpark, un boardercross ? | ✗ non relevé par le classeur ni OpenSkiMap importé |
| Des itinéraires hors-piste / freeride balisés ? | ✗ « unclassed » compte des tronçons sans difficulté, sans dire lesquels sont du freeride — l'afficher comme « freeride » serait une surinterprétation ; affiché comme « non classées » |
| Les pistes sont-elles larges, faciles à lire ? | ✗ subjectif, non mesuré |
| Y a-t-il du ski de fond, des itinéraires raquettes ? | ✗ non relevé |
| Peut-on skier de nuit ? | ✗ non relevé |
| Y a-t-il une piste de luge ? | ✗ non relevé |

## 2. Où aller — la neige

| Question | Verdict |
| --- | --- |
| Y a-t-il de la neige en ce moment ? | ✓ hauteur bas/haut des pistes, Open-Meteo, datée |
| Va-t-il neiger pendant mon séjour ? | ✓ prévision 7 jours (chutes, température) quand le séjour est proche |
| La neige tiendra-t-elle en bas des pistes ? | → installée : altitude **médiane** des pistes et part des kilomètres ≥ 2 000 m, fiche |
| La station est-elle « skis aux pieds » sûre en fin de saison ? | ✓ partiellement : altitude du front de neige + glacier ; le reste dépend de l'année |
| Y a-t-il un glacier (neige garantie tôt/tard) ? | ✓ badge Glacier |
| Quel est l'historique de neige de la station ? | → installée **pour l'avenir** : SKITRACK enregistre désormais localement chaque relevé quotidien de hauteur de neige, et l'affiche avec sa date de début. Aucune base historique antérieure n'existe dans l'application, et elle ne s'en invente pas une. |
| Quel enneigement l'an dernier à ces dates ? | ✗ pas de donnée antérieure à l'installation — voir ci-dessus |
| Combien de canons à neige / % du domaine couvert ? | ✗ non relevé |
| Les pistes sont-elles damées tous les jours ? | ✗ non relevé |
| Quelle exposition (nord/sud) — la neige reste-t-elle poudreuse ? | ✗ le moteur local connaît `north_facing_pct` mais seulement sidecar démarré et domaine importé ; non affiché tant que la donnée n'est pas systématique |
| Quel risque d'avalanche ? | ✓ saisie du niveau BRA lu sur le bulletin officiel, datée, périmée à 36 h ; liens vers le bulletin |
| Quelle température fera-t-il ? | ✓ prévision 7 jours au point culminant |
| Y aura-t-il du vent (remontées fermées) ? | ✓ vent maximal 7 jours affiché ; la décision de fermeture reste celle de la station |
| Quelle visibilité / soleil ? | ✓ pictogrammes de ciel 7 jours |
| Peut-on voir la station en direct ? | ✓ webcams officielles dans la fiche |
| À quoi ressemble la station ? | ✓ photo Commons créditée, corrigeable à la main |

## 3. Où aller — l'accès et la route

| Question | Verdict |
| --- | --- |
| C'est à combien d'heures de chez moi ? | ✓ estimation à vol d'oiseau annoncée comme telle, puis itinéraires OSRM calculés |
| Combien coûtera la route (carburant, péages) ? | ✓ barèmes annoncés comme estimation, remplaçables par saisie ou relevé ViaMichelin |
| Puis-je éviter les péages ? | ✓ option, répercutée sur itinéraires et coûts |
| Quelles stations à moins de N heures de route ? | ✓ filtre temps de trajet + isochrones sur la carte |
| La route est-elle une route de montagne difficile ? | ✗ non relevé (les cols, l'équipement hiver… hors données) |
| Faut-il des chaînes ? | ✗ non relevé, et dépend du jour |
| Y a-t-il un train / une navette depuis la vallée ? | ✗ non relevé |
| Où se garer, parking payant ? | ✗ non relevé |
| L'altitude du village — risque de mal des montagnes, route enneigée ? | ✓ altitude du front de neige sur la carte de station |
| La station est-elle loin des pistes (navette interne) ? | ✓ distance station→pistes du classeur (`slopeDistance`) portée par l'audit ; par logement : moteur local |

## 4. Où aller — le budget station

| Question | Verdict |
| --- | --- |
| Combien coûte le forfait pour mes dates exactes ? | ✓ tarif par durée réelle, origine affichée (relevé / saisi / interpolé / estimé) |
| Tarif enfant ? | ✓ affiché ; dérivé annoncé quand non relevé |
| Le forfait saison vaut-il le coup ? | ✓ grille de la fiche (journée, 6 j, saison) |
| Quelle station est la moins chère pour tout le séjour ? | ✓ écran Meilleures offres (logement + forfaits + route) |
| Quelle semaine est la moins chère ? | ✓ grille Combinaisons, projections marquées « ≈ » |
| Les vacances scolaires changent-elles le prix ? | ✓ semaines zone C marquées dans la grille |
| Y a-t-il des forfaits famille / tribu ? | ✗ grilles famille non relevées ; la note de la fiche le dit |
| Le forfait débutant (accès gratuit aux tapis) existe-t-il ? | ✗ non relevé |
| Combien coûtent les cours (ESF, moniteur privé) ? | ✓ barème annoncé comme estimation, remplaçable par le tarif relevé de l'école |
| Location de matériel ? | ✓ forfait moyen annoncé comme tel, débrayable |
| Quel budget total pour mon groupe, par personne, par foyer ? | ✓ coût par poste + « Qui paie quoi » |

## 5. Le logement — chercher

| Question | Verdict |
| --- | --- |
| Que trouve-t-on à louer pour mes dates et mon groupe ? | ✓ relevé multi-sources (centrale, Booking, Airbnb par collage) |
| À quel prix, tout le séjour ? | ✓ prix relevés, datés ; « prix du séjour » sans prétendre au « tout compris » |
| Le prix vaut-il pour MES dates ? | ✓ règle d'écran : prix vérifié pour ces dates ou annonce écartée (et compté) |
| Combien par personne et par nuit ? | ✓ affiché |
| Assez de place pour 8 ? 4 chambres ? | ✓ capacité et pièces comparées ; « n'annonce rien » écarté par défaut, réaffichable |
| Où est le logement exactement ? | ✓ position relevée quand la source la publie (Booking désormais) ; épingle « ≈ » sinon, qui le dit |
| À quelle distance des pistes, à pied ? | ✓ moteur local (distance, dénivelé, mode d'accès) ; « non calculée » sinon |
| Skis aux pieds ? | ✓ classement du moteur local |
| À quelle altitude dort-on ? | ✓ altitude du logement, fiche |
| Annulation gratuite ? | ✓ filtre + mention |
| Le logement est-il encore libre ? | ✓ « introuvable au dernier relevé à ces dates » signalé |
| Photos du logement ? | ✓ photo publiée par l'annonce |
| Avis des voyageurs ? | ✓ note ramenée sur 5 + nombre d'avis |
| Wifi, parquant, sauna, lave-vaisselle ? | ✗ équipements non relevés — l'annonce source les porte, le lien y mène |
| Draps inclus, ménage, caution ? | ✗ non relevé ; la fiche ne fabrique plus de décomposition |
| Taxe de séjour ? | ✗ ni relevée ni estimée — dit tel quel dans le récapitulatif |
| Animaux admis ? | ✗ non relevé |
| Le prix va-t-il baisser si j'attends ? | ✓ suivi de prix horaire local, courbe réelle vs simulée distinguées |
| Ce prix est-il correct pour la station ? | ✓ médiane du marché sur les offres tarifées |
| Même bien moins cher ailleurs ? | ✓ fusion des doublons multi-sources avec l'écart affiché |

## 6. Le logement — décider et partir

| Question | Verdict |
| --- | --- |
| Comment comparer mes 2-3 finalistes ? | ✓ comparateur |
| Comment partager le choix avec le groupe ? | ✓ récap texte à coller + votes et notes de la sélection |
| Un document propre à envoyer / imprimer ? | ✓ récapitulatif PDF, chaque valeur avec son origine, section « ce qui manque » |
| Comment réserver ? | ✓ lien vers l'annonce à la centrale/plateforme, dates et groupe pré-remplis |
| Qui paie quoi entre foyers ? | ✓ répartition + écart à un partage égal |
| Rappel des infos utiles sur place (plan, météo) ? | ✓ plan officiel en lien, webcams, météo |

## 7. Questions écartées en bloc (hors métier ou non relevables)

École/garderie et âge minimal, moniteurs anglophones, restaurants d'altitude,
après-ski, commerces, médecin/pharmacie, ESF vs écoles indépendantes,
affluence aux remontées, files d'attente, qualité du damage, « ambiance » de
la station, sécurité, taille des files au forfait, jour de changement de
draps, DVA obligatoires hors-piste, état des routes en temps réel, prix de
l'essence sur le trajet ce jour-là, disponibilité des cours à mes dates.
Toutes légitimes pour un vacancier ; aucune source relevée dans l'application
— y répondre serait inventer. Elles n'entrent pas tant qu'une source honnête
n'existe pas.

## Installées le 2026-08-30

1. **Répartition des pistes par couleur** (fiche du domaine) — vertes, bleues,
   rouges, noires, non classées, du classeur France Montagnes.
2. **Altitude médiane des pistes** et **part des kilomètres ≥ 2 000 m** (fiche)
   — la vraie réponse à « la neige tiendra-t-elle », sans prédire la météo.
3. **Plan des pistes officiel** et **fiche France Montagnes** en liens externes
   (fiche) — le plan s'ouvre dans le navigateur, jamais reproduit dans
   l'application (œuvre protégée).
4. **Historique de neige local** : chaque relevé quotidien est enregistré sur
   la machine et affiché avec sa date de début. L'application ne connaît rien
   d'avant son installation, et le dit.
