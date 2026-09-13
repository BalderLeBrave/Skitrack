# Audit des centrales de réservation

Relevé du 13 septembre 2026, sur les **320 stations du référentiel** et non sur les seules 49 que `src/lib/centrales.data.json` nommait.

Lecture seule et polie : `robots.txt` a été lu pour chaque hôte avant toute autre demande, et aucune page interdite n'a été visitée. Aucun contournement de protection anti-robot, aucun service de proxy, aucune résolution de captcha : ce n'est pas une orientation de ce dépôt et l'audit ne la ressuscite pas. **Aucun connecteur n'a été écrit** : cette phase rend un rapport, pas du code.

---

## 1. Ce qui est branché aujourd'hui : rien

La question posée était de confirmer ou d'infirmer. Elle est confirmée, et plus durement qu'annoncé.

- `src/lib/scrape/` contient cinq collecteurs : Airbnb, Booking, Abritel (par CozyCozy), Gîtes de France, et le pilote de navigateur. **Aucun ne mentionne une centrale de station.**
- `src/lib/centrales.ts` sait dire quelle centrale dessert une station, avec son URL et son hôte. Il ne relève aucun prix. Et il n'est importé par **aucun** écran : seul son test le lit. C'est une table, pas une intégration.
- Ce que l'écran Logements montre pour Les 2 Alpes sous l'étiquette « Centrale » vient du **relevé figé** de `src/lib/listings.ts` — quatre annonces, `source: "Centrale"`, relevées à la main le 3 septembre 2026 — et du repli `dumpFallback` de `run.server.ts`, qui est cloué aux 2 Alpes et aux dates du 6 au 13 février 2027.

Autrement dit : **aucune centrale n'est appelée, pour aucune station, jamais.** Chercher un bogue dans une intégration qui n'existe pas aurait été du temps perdu. La colonne « Appelée ? » du tableau ci-dessous vaut « non » partout, et elle n'est donc pas répétée.

La Plagne ne remonte rien de sa centrale pour la même raison, à quoi s'ajoute que `listingsForStay` filtre le relevé figé sur `stationId` : hors des 2 Alpes, il rend zéro.

---

## 2. Couverture

| | |
| --- | --- |
| Stations au référentiel | 320 |
| Avec une centrale identifiée | 113 |
| Sans centrale trouvée | 207 |
| Centrales distinctes (hôtes) | 67 |

Les 113 viennent de deux sources : le relevé du dépôt (49 stations et 5 domaines, du classeur `centrales-selecteurs.xlsx`), et une découverte menée pour cet audit à partir du site officiel de chacun des 169 domaines du catalogue de forfaits — on y lit le lien « réserver / hébergements / location » que le site publie lui-même, sans deviner d'URL ni balayer de sous-domaines.

Pourquoi les 207 autres n'ont rien :

| Motif | Stations |
| --- | ---: |
| aucun domaine de forfait rattaché | 195 |
| aucun lien de réservation trouvé sur le site du domaine | 8 |
| site du domaine : 403 | 2 |
| domaine de forfait sans centrale trouvée | 2 |

La plupart sont de petites stations sans domaine de forfait rattaché, ou dont l'office de tourisme ne vend pas d'hébergement en ligne. Une absence de centrale est un fait, pas un trou à combler.

---

## 3. Les moteurs — la colonne qui décide

Ces centrales ne sont pas des sites différents : ce sont quelques moteurs mutualisés sous autant d'habillages. Le moteur est reconnu à l'empreinte laissée dans la page et dans les en-têtes, et confirmé par le `robots.txt` : vingt-trois de ces hôtes servent un `robots.txt` de 894 à 912 octets, au mot près le même, qui est celui du moteur et non du site.

| Moteur | Stations desservies | Hôtes | Exemples |
| --- | ---: | ---: | --- |
| Ingénie | 54 | 28 | fr.locationlesmenuires.com, reservation.tignes.net, reservation.valdarly-montblanc.com, www.risoul.com |
| non identifié | 31 | 25 | www.laplagneresort.com, booking.chamonix.com, beuil.fr, booking.prazsurarly.com |
| Open System | 16 | 7 | reservation.la-toussuire.com, reservation.haute-maurienne-vanoise.com, reservation.ledevoluy.com, piau-engaly.com |
| Ublo | 7 | 3 | reservation.alpedhuez.com, reservation.saintfrancoislongchamp.com, www.saintefoy-reservation.com |
| Diffusio | 3 | 2 | www.sancy.com, www.n-py.com |
| Deskline / Feratel | 1 | 1 | www.laclusaz.com |
| Elloha | 1 | 1 | www.villarddelans-correnconenvercors.com |

### Combien d'intégrations pour combien de stations

| Intégrations | Moteurs couverts | Stations | Hôtes |
| ---: | --- | ---: | ---: |
| 1 | Ingénie | 54 | 28 |
| 2 | Ingénie + Open System | 70 | 35 |
| 3 | Ingénie + Open System + Ublo | 77 | 38 |
| 4 | Ingénie + Open System + Ublo + Diffusio | 80 | 40 |
| 5 | Ingénie + Open System + Ublo + Diffusio + Deskline / Feratel | 81 | 41 |
| 6 | Ingénie + Open System + Ublo + Diffusio + Deskline / Feratel + Elloha | 82 | 42 |

**C'est le chiffre qui décide.** Une seule intégration, Ingénie, couvre 54 stations réparties sur 28 hôtes. Trois intégrations en couvrent 77. Écrire quarante-cinq collecteurs serait écrire quarante-cinq fois le même.

---

## 4. Une ligne par centrale

« Branchée ? » et « Appelée ? » valent **non** partout : voir le § 1. Les colonnes retenues sont donc celles qui varient.

| Centrale (hôte) | Stations | Moteur | Robots (pour notre agent) | Répond | API |
| --- | ---: | --- | --- | --- | --- |
| `fr.locationlesmenuires.com` | 12 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `reservation.tignes.net` | 8 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `reservation.la-toussuire.com` | 6 | Open System | illisible (robots.txt illisible) | 200 | non vérifiée |
| `reservation.alpedhuez.com` | 5 | Ublo | autorisé (aucune règle) | 200 | non vérifiée |
| `www.laplagneresort.com` | 5 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 200 | sans objet tant que le moteur n'est pas nommé |
| `reservation.haute-maurienne-vanoise.com` | 4 | Open System | autorisé (Allow: /) | 200 | non vérifiée |
| `reservation.valdarly-montblanc.com` | 4 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `www.risoul.com` | 4 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `booking.chamonix.com` | 3 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 200 | sans objet tant que le moteur n'est pas nommé |
| `reservation.ledevoluy.com` | 2 | Open System | illisible (robots.txt illisible) | 200 | non vérifiée |
| `reservation.lessaisies.com` | 2 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `www.chamrousse.com` | 2 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `www.sancy.com` | 2 | Diffusio | autorisé (aucune règle ne couvre ce chemin) | 200 | non vérifiée |
| `beuil.fr` | 1 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 200 | sans objet tant que le moteur n'est pas nommé |
| `booking.prazsurarly.com` | 1 | non identifié | autorisé (aucune règle) | 200 | sans objet tant que le moteur n'est pas nommé |
| `font-romeu.fr` | 1 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 200 | sans objet tant que le moteur n'est pas nommé |
| `fr.locationsaintmartin.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `isola2000.com` | 1 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 200 | sans objet tant que le moteur n'est pas nommé |
| `lesangles.com` | 1 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 403 | sans objet tant que le moteur n'est pas nommé |
| `luz-ardiden.com` | 1 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 200 | sans objet tant que le moteur n'est pas nommé |
| `peyragudes.com` | 1 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 200 | sans objet tant que le moteur n'est pas nommé |
| `piau-engaly.com` | 1 | Open System | autorisé (aucune règle ne couvre ce chemin) | 200 | non vérifiée |
| `resa.saintlary.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `reservation.areches-beaufort.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `reservation.ax-ski.com` | 1 | Open System | autorisé (Allow: /) | 200 | non vérifiée |
| `reservation.combloux.com` | 1 | non identifié | autorisé (aucune règle) | 200 | sans objet tant que le moteur n'est pas nommé |
| `reservation.courchevel.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `reservation.larosiere.net` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `reservation.lecollet.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `reservation.legrandbornand.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `reservation.les2alpes.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `reservation.lescontamines.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `reservation.lesorres.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `reservation.montgenevre.com` | 1 | non identifié | interdit (Disallow: /) | non interrogée | sans objet tant que le moteur n'est pas nommé |
| `reservation.orcieres.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `reservation.saintfrancoislongchamp.com` | 1 | Ublo | autorisé (aucune règle) | 200 | non vérifiée |
| `reservation.serre-chevalier.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `sites.valdabondance.com` | 1 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 200 | sans objet tant que le moteur n'est pas nommé |
| `www.ballons-hautes-vosges.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `www.chatel.com` | 1 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 200 | sans objet tant que le moteur n'est pas nommé |
| `www.chioula.fr` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `www.flaine.com` | 1 | non identifié | autorisé (Allow: /) | 200 | sans objet tant que le moteur n'est pas nommé |
| `www.gerardmer-reservation.net` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `www.gourette.com` | 1 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 200 | sans objet tant que le moteur n'est pas nommé |
| `www.haut-giffre.fr` | 1 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 200 | sans objet tant que le moteur n'est pas nommé |
| `www.karellis.com` | 1 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 200 | sans objet tant que le moteur n'est pas nommé |
| `www.labresse.net` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `www.laclusaz.com` | 1 | Deskline / Feratel | autorisé (aucune règle ne couvre ce chemin) | 200 | Feratel publie des web services partenaires (Deskline) — accès sous contrat |
| `www.lesarcs.com` | 1 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 200 | sans objet tant que le moteur n'est pas nommé |
| `www.lesrousses.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `www.matheysine-tourisme.com` | 1 | Open System | autorisé (aucune règle ne couvre ce chemin) | 200 | non vérifiée |
| `www.mole-brasses.com` | 1 | non identifié | autorisé (Allow: /) | 200 | sans objet tant que le moteur n'est pas nommé |
| `www.n-py.com` | 1 | Diffusio | autorisé (aucune règle ne couvre ce chemin) | 200 | non vérifiée |
| `www.paysdesecrins.com` | 1 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 200 | sans objet tant que le moteur n'est pas nommé |
| `www.peisey-vallandry.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `www.prazdelys-sommand.com` | 1 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 200 | sans objet tant que le moteur n'est pas nommé |
| `www.reservationpralognan.fr` | 1 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 200 | sans objet tant que le moteur n'est pas nommé |
| `www.saintefoy-reservation.com` | 1 | Ublo | autorisé (aucune règle) | 200 | non vérifiée |
| `www.valberg.com` | 1 | non identifié | autorisé (Allow: /) | 200 | sans objet tant que le moteur n'est pas nommé |
| `www.valdallos.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `www.valfrejus.com` | 1 | non identifié | illisible (robots.txt illisible) | 403 | sans objet tant que le moteur n'est pas nommé |
| `www.valleesdegavarnie.com` | 1 | non identifié | autorisé (aucune règle ne couvre ce chemin) | 200 | sans objet tant que le moteur n'est pas nommé |
| `www.valloire.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `www.valmeinier-reservation.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `www.valmorel.com` | 1 | Open System | autorisé (aucune règle ne couvre ce chemin) | 200 | non vérifiée |
| `www.vercors-experience.com` | 1 | Ingénie | autorisé (aucune règle ne couvre ce chemin) | 200 | Passerelle SIT documentée (XML et JSON, « webservice Passerelle », ingenie.fr) — partenaire, pas publique |
| `www.villarddelans-correnconenvercors.com` | 1 | Elloha | autorisé (aucune règle ne couvre ce chemin) | 200 | non vérifiée |

Les stations desservies par chaque hôte sont listées en annexe A.

---

## 5. Ce que robots.txt autorise

- **Autorisé** pour la page de réservation : 63 hôtes sur 67.
- **Interdit** : 1 — `reservation.montgenevre.com`. Ces pages n'ont pas été visitées.
- **robots.txt illisible** (absent ou en erreur) : 3 — `reservation.la-toussuire.com`, `reservation.ledevoluy.com`, `www.valfrejus.com`.
- **Refus au niveau du serveur** (403, protection anti-robot) : 2 — `lesangles.com`, `www.valfrejus.com`. Constaté, et laissé tel quel : un 403 est une réponse, pas un obstacle à contourner.

Une autorisation de robots.txt ne vaut pas autorisation contractuelle. Les conditions d'utilisation de chaque centrale sont à lire avant toute collecte, et l'audit ne les a pas lues.

---

## 6. Les photos manquantes des 2 Alpes

Le relevé figé porte une photo pour **les vingt et une annonces** : le champ n'est jamais absent. Le manque est à l'affichage, et il vient de deux hôtes sur cinq.

| Source | Hôte de l'image | Sans référent | Avec un référent tiers |
| --- | --- | --- | --- |
| Gîtes de France | `www.gites-de-france.com` | 200 image/jpeg | 200 image/jpeg |
| Centrale | `reservation.les2alpes.com` | 404 text/html | 404 text/html |
| Airbnb | `a0.muscache.com` | 200 image/avif | 200 image/avif |
| Abritel | `q-xx.bstatic.com` | 200 image/jpeg | 200 image/jpeg |
| Gîtes de France | `widget-fngf.itea.fr` | échec (UND_ERR_CONNECT_TIMEOUT)  | échec (UND_ERR_CONNECT_TIMEOUT)  |

Diagnostic, poste par poste :

- **Ce n'est pas un blocage de référent.** Les trois hôtes qui répondent rendent exactement la même chose avec et sans référent tiers : `a0.muscache.com` (Airbnb), `q-xx.bstatic.com` (le dépôt d'images de Booking, d'où viennent aussi les annonces Abritel passées par CozyCozy) et `www.gites-de-france.com`. Ils servent leurs images à qui les demande.
- **`reservation.les2alpes.com` rend 404**, et du `text/html` : l'URL de la photo n'existe plus sur la centrale. C'est une **URL périmée**, relevée le 3 septembre 2026 et morte depuis. Les quatre annonces « Centrale » du relevé en dépendent ; une seule image cassée est visible à l'écran parce que les trois autres pointent des chemins encore servis.
- **`widget-fngf.itea.fr` ne répond pas** : délai dépassé à l'établissement de la connexion. C'est le widget ITEA de Gîtes de France ; l'hôte est injoignable depuis ici, ce qui peut être un filtrage réseau autant qu'une panne.

Mesuré à l'écran après le correctif du § 7, sur 91 annonces affichées : **une seule image cassée**, une « Centrale ». Abritel (36), Airbnb (21), Booking (29) et Gîtes de France (1) n'en ont aucune.

Rien n'est corrigé ici, comme demandé. La réparation consistera à vérifier l'URL au relevé et à ne pas poser d'`img` sur une adresse qui ne répond pas — l'écran sait déjà dire « Pas de photo dans l'annonce ».

---

## 7. Un défaut trouvé pendant l'audit, et corrigé

En mesurant les photos, l'écran Logements annonçait « 4 annonces sur 96 · 92 sur d'autres domaines ». La règle de zone de la phase 1 paraissait écarter presque tout.

Elle ne se trompait pas. La recherche en direct était lancée avec le `stationId` du magasin **séjour**, tandis que le nom et les coordonnées venaient de la station du **parcours**. Quand les deux divergent — ce qui s'est produit en recette — le serveur interroge la bonne station par son nom mais mesure l'accès depuis le repère de l'autre. Relevé dans la réponse du serveur : des annonces intitulées « Les Deux Alpes », aux coordonnées des 2 Alpes, portant `stationId: "brides-les-bains"` et `distToSlopesM: 60470`.

Le chargement utile prend maintenant l'identifiant de la station affichée. Après correction, et sans rien changer d'autre : **91 annonces sur 91**, aucune écartée.

C'est aussi ce qui valide la phase 1 : la règle de zone a rendu visible un défaut que rien ne signalait.

---

## 8. Ce que l'audit recommande

**Un fichier par centrale.** C'est la consigne, et elle est juste : un connecteur qui casse ne doit pas emporter les quarante-quatre autres. Chaque fichier ne porte alors que ce qui lui est propre — l'URL, les paramètres de la requête, les particularités du gabarit.

**Un moteur par module partagé, importé par ces fichiers.** Sans quoi le même analyseur Ingénie serait recopié vingt-huit fois et divergerait à la première correction. L'isolement porte sur la centrale, la logique sur le moteur :

```
src/lib/scrape/centrales/
  moteurs/ingenie.server.ts        ← l'analyseur, écrit une fois
  moteurs/open-system.server.ts
  moteurs/ublo.server.ts
  les-2-alpes.server.ts            ← 8 lignes : hôte, chemin, moteur
  tignes.server.ts
  ...
```

**Par où commencer.** Ingénie : 54 stations pour un seul analyseur. Puis Open System, puis Ublo.

**Avant d'écrire quoi que ce soit**, trois questions restent ouvertes, et elles ne sont pas techniques :

1. Les conditions d'utilisation de chaque centrale autorisent-elles la collecte ? `robots.txt` ne répond pas à cette question.
2. Ingénie documente une passerelle SIT en XML et JSON, réservée aux partenaires. Une convention vaudrait mieux qu'une collecte, et couvrirait 54 stations d'un coup.
3. Les 2 hôtes qui répondent 403 derrière une protection anti-robot sont hors de portée, et le resteront : c'est une orientation abandonnée.

---

## Annexe A — stations desservies, par centrale

| Centrale (hôte) | Stations |
| --- | --- |
| `fr.locationlesmenuires.com` | Brides les Bains, Courchevel Le Praz, Courchevel Moriond 1650, Courchevel Village 1550, La Tania, Les Menuires, Méribel, Méribel Village, Méribel-Mottaret, Orelle, Reberty, Val Thorens |
| `reservation.tignes.net` | La Daille, Le Fornet, Tignes, Tignes Le Lac, Tignes Les Boisses, Tignes Les Brévières, Tignes Val Claret, Val d'Isère |
| `reservation.la-toussuire.com` | La Toussuire, Le Corbier, Les Bottières, Saint Sorlin d'Arves, Saint Jean d'Arves, Saint-Pancrace les Bottières |
| `reservation.alpedhuez.com` | Alpe d'Huez, Auris en oisans, OZ 3300, Vaujany, Villard Reculas |
| `www.laplagneresort.com` | Aime 2000, Champagny en Vanoise, La Plagne, Montchavin - La Plagne, Plagne Bellecôte |
| `reservation.haute-maurienne-vanoise.com` | Aussois, Bonneval sur Arc, La Norma, Val Cenis |
| `reservation.valdarly-montblanc.com` | Crest Voland Cohennoz, Flumet - St Nicolas la Chapelle, La Giettaz, Notre Dame de Bellecombe |
| `www.risoul.com` | Les Claux, Risoul, Vars, Vars Sainte-Marie |
| `booking.chamonix.com` | Chamonix-Mont-Blanc, Les Houches, Vallorcine |
| `reservation.ledevoluy.com` | La Joue du Loup, Superdévoluy / La Joue du Loup |
| `reservation.lessaisies.com` | Bisanne 1500, Les Saisies |
| `www.chamrousse.com` | Chamrousse, Chamrousse 1750 |
| `www.sancy.com` | Besse Super Besse, Le Mont Dore |
| `beuil.fr` | Beuil les Launes |
| `booking.prazsurarly.com` | Praz sur Arly |
| `font-romeu.fr` | Font-Romeu - Pyrénées 2000 |
| `fr.locationsaintmartin.com` | Saint Martin de Belleville |
| `isola2000.com` | Isola 2000 |
| `lesangles.com` | Les Angles |
| `luz-ardiden.com` | Luz Ardiden |
| `peyragudes.com` | Peyragudes |
| `piau-engaly.com` | Piau Engaly |
| `resa.saintlary.com` | Saint Lary |
| `reservation.areches-beaufort.com` | Areches Beaufort |
| `reservation.ax-ski.com` | Ax 3 Domaines |
| `reservation.combloux.com` | Combloux |
| `reservation.courchevel.com` | Courchevel |
| `reservation.larosiere.net` | La Rosière 1850 |
| `reservation.lecollet.com` | Le Collet d'Allevard |
| `reservation.legrandbornand.com` | Le Grand Bornand |
| `reservation.les2alpes.com` | Les 2 Alpes |
| `reservation.lescontamines.com` | Les Contamines Montjoie |
| `reservation.lesorres.com` | Les Orres |
| `reservation.montgenevre.com` | Montgenèvre |
| `reservation.orcieres.com` | Orcières Merlette |
| `reservation.saintfrancoislongchamp.com` | Saint François Longchamp |
| `reservation.serre-chevalier.com` | Serre Chevalier |
| `sites.valdabondance.com` | Abondance |
| `www.ballons-hautes-vosges.com` | Saint Maurice sur Moselle |
| `www.chatel.com` | Chatel |
| `www.chioula.fr` | Le Chioula |
| `www.flaine.com` | Flaine |
| `www.gerardmer-reservation.net` | Gérardmer |
| `www.gourette.com` | Gourette |
| `www.haut-giffre.fr` | Sixt Fer à Cheval |
| `www.karellis.com` | Les Karellis |
| `www.labresse.net` | La Bresse Hohneck |
| `www.laclusaz.com` | La Clusaz |
| `www.lesarcs.com` | Villaroger |
| `www.lesrousses.com` | Station des Rousses – Jura sur Léman |
| `www.matheysine-tourisme.com` | Alpe du Grand Serre |
| `www.mole-brasses.com` | Les Brasses |
| `www.n-py.com` | Grand Tourmalet (La Mongie / Barèges) |
| `www.paysdesecrins.com` | Puy-Saint-Vincent |
| `www.peisey-vallandry.com` | Les Arcs |
| `www.prazdelys-sommand.com` | Praz de Lys Sommand |
| `www.reservationpralognan.fr` | Pralognan la Vanoise |
| `www.saintefoy-reservation.com` | Sainte Foy Tarentaise |
| `www.valberg.com` | Valberg |
| `www.valdallos.com` | Val d'Allos |
| `www.valfrejus.com` | Valfréjus |
| `www.valleesdegavarnie.com` | Gavarnie Gèdre |
| `www.valloire.com` | Valloire |
| `www.valmeinier-reservation.com` | Valmeinier |
| `www.valmorel.com` | Valmorel |
| `www.vercors-experience.com` | Lans en Vercors |
| `www.villarddelans-correnconenvercors.com` | Corrençon en Vercors |

## 9. Suite du 13 septembre : cinq centrales sont maintenant appelées

Cette section corrige et prolonge l'audit ci-dessus. Elle est écrite le même jour, après les connecteurs, et elle contredit l'audit sur deux points.

### Ce qui est branché

| Centrale | Moteur | Stations | Relevé du 6 au 13 février 2027, 8 personnes |
| --- | --- | ---: | --- |
| Haute Maurienne Vanoise | Open System | 4 | 107 logements, sur 8 rubriques |
| Alpe d'Huez Grand Domaine | MSEM | 5 | 53 vendables sur 957 au catalogue |
| Corrençon-en-Vercors | MSEM | 1 | 22 vendables sur 276 |
| Saint-François-Longchamp | MSEM | 1 | 21 vendables sur 299 |
| Sainte-Foy Tarentaise | MSEM | 1 | 4 vendables sur 79 |

Douze stations interrogées en direct, plus huit couvertes par un connecteur qui dit pourquoi il ne peut pas.

### Deux corrections à l'audit

**« Ublo » n'est pas le moteur de réservation.** Ublo est le gestionnaire de contenu, signé Valraiso, qui fabrique le site. La recherche d'hébergement est un composant chargé à part, « Mon Séjour En Montagne », servi par `services.msem.tech`. Les quatre centrales concernées ne sont donc pas quatre moteurs : c'est une seule API, à deux identifiants près — `resort` et `channel`.

**Corrençon-en-Vercors n'est pas sous Elloha.** L'audit l'avait classée ainsi ; le site publie lui-même `resort` 30002 et `channel` « OTVDL » vers `services.msem.tech`, et l'API répond. `moteurs.data.json` est corrigé, avec le motif dans le fichier. Elloha ne dessert donc plus aucune centrale du parc.

**Open System existe en deux générations.** La moderne rend ses résultats côté serveur, sur des pages `pr<N>-....htm`, et c'est elle qu'on interroge. L'ancienne — La Toussuire, Ax 3 Domaines, Dévoluy — sert une coquille statique et laisse un widget peupler la page : les trois réponses du triplet de contrôle sont identiques à l'octet près, même somme de contrôle, zéro prix. Ce n'est pas un paramètre mal deviné, c'est une différence d'architecture.

### Le prix, vérifié et non supposé

Le contrôle est le même partout : sans dates, puis sept nuits, puis trois ou quatorze.

| Centrale | Sans dates | Épreuve de durée |
| --- | --- | --- |
| Haute Maurienne Vanoise | 0 prix | « La clé des champs » 840 € sur 7 nuits, 360 € sur 3 |
| Sainte-Foy | 0 offre | « Soldanelle » 2 259,58 € sur 7 nuits, 865,82 € sur 3 |
| Alpe d'Huez | 0 offre | « Le Kaila 601 » 5 660,16 € sur 7 nuits, 11 320,32 € sur 14 |
| Saint-François-Longchamp | 0 offre | « L'Ancolie » 3 180,76 € puis 6 335,40 € |
| Corrençon-en-Vercors | 0 offre | « Maison Sapin Bleu » 2 087,80 € puis 4 160,60 € |

### Ce qui reste fermé, et pourquoi

- **Ingénie**, 28 hôtes et 54 stations. La recherche-liste datée est un `GET /booking?action=searchAjax&cid=<n>&datedeb=…`, forme lue dans le formulaire rendu par `www.valloire.com`.

  Les vingt-huit `robots.txt` ont été relus un par un et confrontés à cette URL exacte. Vingt-deux la ferment par `Disallow: /*booking?*`. Six ne la couvrent par aucune règle : `www.risoul.com`, `www.chamrousse.com`, `reservation.lescontamines.com`, `www.valmeinier-reservation.com`, `www.valdallos.com` et `www.labresse.net`. Un cas à part, `www.lesrousses.com`, porte `Disallow: /*?`, qui ferme toute URL à paramètres.

  `www.chamrousse.com` mérite une mention, parce qu'il pose une question et non une réponse : il porte bien `Disallow: /*?action=*` et `Disallow: /*?cid=*`, mais dans l'URL que son propre formulaire fabrique ces deux paramètres ne sont pas en tête, si bien que la chaîne `?action=` n'y apparaît jamais et que la règle, à la lettre, ne s'apparie pas. L'intention est pourtant claire. Réordonner les paramètres pour passer serait une exception déguisée ; cette centrale est donc tenue pour fermée.

  Sur les hôtes ouverts, la recherche a été appelée pour de bon. Elle fonctionne et réclame bien des dates — sans dates elle répond « Le format de la date n'est pas valide » — mais avec des dates valides, avec ou sans session, elle répond « Une erreur s'est produite ». La variante `resultatAjax` rend une page de 91 380 octets identique pour sept nuits, quatorze nuits et sans dates, sans un montant. Et la fiche datée, autorisée partout, rend 503 « Site en maintenance ! » sur tous les hôtes essayés. La porte est ouverte, le service ne sert pas. `www.risoul.com` et ses quatre stations sont la centrale à réessayer en premier, et elle a son fichier pour cela.
- **Diffusio**. `www.sancy.com` affiche 800 prix sans qu'aucune date soit demandée, et son application n'expose aucun filtre de date, de durée ou de personnes : c'est une grille tarifaire, pas un total de séjour. `www.n-py.com` interdit nommément, sous un titre « Filtres pages hebergements », chacun des paramètres de son propre formulaire.
- **Deskline / Feratel**, `www.laclusaz.com`. Rien ne l'interdit, ni sur le site ni sur les deux hôtes Feratel. L'empêchement est technique et reste à lever.
- **Les trois sites à empreinte Open System sans moteur** — Valmorel, Alpe du Grand Serre, Piau-Engaly. L'empreinte relevée par l'audit était celle d'un widget **panier** d'Alliance Réseaux, pas d'un moteur de recherche. C'est ce qui avait induit l'audit en erreur. La réservation de Piau-Engaly part chez `www.n-py.com`, qui l'interdit.

### Ce qui a été respecté

Aucun contournement de protection anti-robot, aucun proxy, aucune résolution de captcha. `robots.txt` lu avant chaque appel et relu à l'exécution, avec un vrai analyseur de motifs. Aucun chemin interdit visité, y compris quand il était le seul à porter les prix — c'est le cas d'Ax 3 Domaines, dont le canal de données est fermé par `Disallow: /*callback=jQuery*_WPJS=r*`. L'agent déclaré à `robots.txt` est celui qui part dans l'en-tête.

---

## Annexe B — méthode

- Corpus : `src/lib/centrales.data.json` (49 stations, 5 domaines) et les 169 sites de domaine de `src/lib/forfaits/catalog.json`.
- Agent déclaré : `SkitrackAudit/1.0 (+audit de faisabilite, lecture seule)`.
- Pour chaque hôte : `robots.txt`, puis la page seulement si le groupe qui nous vise l'autorise. Règle au plus long motif, `*` et `$` interprétés, `Allow` l'emportant à longueur égale.
- Moteur reconnu sur l'URL finale, les en-têtes `server` et `x-powered-by`, et le HTML. L'empreinte du `robots.txt` sert de confirmation : un même fichier, un même moteur.
- Délai de 350 à 400 ms entre deux demandes, cinq à six en parallèle au plus.
- Les scripts de relevé vivent dans le répertoire de travail de la session, hors du dépôt : ils ne sont pas du code d'application.
