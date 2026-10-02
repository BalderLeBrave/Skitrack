import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeHtml, ecarteeAirbnb, lectureAirbnb, lectureFiche } from "./lectureFiche.ts";
import { cleListing, poserReleve } from "./poserReleve.ts";

describe("lectureFiche : capacité, chambres et GPS lus sur la fiche", () => {
  it("lit VacationRental JSON-LD : occupancy.maxValue, geo, pas occupancy.value", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "VacationRental",
      name: "Duplex Arc en Ciel",
      latitude: 45.02298,
      longitude: 6.12571,
      containsPlace: {
        "@type": "Accommodation",
        occupancy: { "@type": "QuantitativeValue", value: 5, maxValue: 8 },
      },
      address: { addressLocality: "Mont-de-Lans" },
    })}</script>`;
    const l = lectureFiche(html);
    assert.equal(l.capacity, 8);
    assert.equal(l.lat, 45.02298);
    assert.equal(l.lon, 6.12571);
    assert.equal(l.locality, "Mont-de-Lans");
  });

  it("lit personCapacity et listingLat d'une fiche Airbnb", () => {
    const html = `<html><body>
      {"name":"StayEmbedData","id":"41701345","personCapacity":8}
      {"listingLat":45.02298,"listingLng":6.12571,"roomType":"Entire home/apt","personCapacity":8}
    </body></html>`;
    const l = lectureFiche(html);
    assert.equal(l.capacity, 8);
    assert.equal(l.lat, 45.02298);
    assert.equal(l.lon, 6.12571);
  });

  it("lectureAirbnb : l'aperçu de la page (« N voyageurs · N chambres · N lits ») avant le titre de partage", () => {
    // Bloc `overview` de rooms/1456397434311994216, lu le 2 octobre 2026 :
    // les lignes que l'écran montre sous le titre.
    const apercu = `{"overview":{"__typename":"StaysPdpOverview","title":"Logement entier : appartement - Bernex, France","items":["2 voyageurs","1 chambre","1 lit","1 salle de bain"],"reviewsInfo":null}}`;
    // Sans personCapacity : la capacité de l'aperçu, en text_regex ; les lits à part.
    const seul = lectureAirbnb(apercu);
    assert.deepEqual(
      [seul.capacity, seul.capacitySource, seul.bedrooms, seul.bedroomsSource, seul.beds],
      [2, "text_regex", 1, "text_regex", 1],
    );
    // personCapacity publié : il passe devant « 2 voyageurs ».
    const struct = lectureAirbnb(`{"personCapacity":4}${apercu}`);
    assert.deepEqual([struct.capacity, struct.capacitySource], [4, "structured"]);
    // L'aperçu passe devant le titre de partage pour les chambres.
    const deux = lectureAirbnb(
      `{"__typename":"StaysPdpOverview","title":"Logement entier : chalet","items":["6 voyageurs","2 chambres","4 lits","2 salles de bain"]}{"sharingConfig":{"title":"Chalet · 3 chambres · 4 lits"}}`,
    );
    assert.deepEqual([deux.capacity, deux.bedrooms, deux.beds], [6, 2, 4]);
    // Un studio dans l'aperçu : 0 chambre.
    const studio = lectureAirbnb(`{"__typename":"StaysPdpOverview","title":"Logement entier","items":["2 voyageurs","Studio","1 lit","1 salle de bain"]}`);
    assert.deepEqual([studio.bedrooms, studio.bedroomsSource, studio.beds], [0, "derived_from_type", 1]);
  });

  it("ecarteeAirbnb : la règle du worker, sur le roomType et le type publié de la page", () => {
    // rooms/21670960, 2 octobre 2026 : un logement entier.
    assert.equal(
      ecarteeAirbnb(`{"roomType":"Entire home/apt","personCapacity":6}{"propertyType":"Logement entier : hébergement"}`),
      false,
    );
    assert.equal(ecarteeAirbnb(`{"roomType":"Private room"}`), true);
    assert.equal(ecarteeAirbnb(`{"roomType":"Hotel room"}`), true);
    assert.equal(ecarteeAirbnb(`{"roomType":"Entire home/apt"}{"propertyType":"Logement entier : tente"}`), true);
    assert.equal(ecarteeAirbnb(`{"roomType":"Entire home/apt"}{"propertyType":"Chambre d'hôtes"}`), true);
    // « Hôtel » en tête, mais logement entier : gardé (`is_dropped_listing`).
    assert.equal(ecarteeAirbnb(`{"propertyType":"Hôtel particulier, appartement entier"}`), false);
    // Rien à juger : gardé.
    assert.equal(ecarteeAirbnb(`{"personCapacity":4}`), false);
    assert.equal(lectureAirbnb(`{"roomType":"Private room","personCapacity":2}`).ecartee, true);
  });

  it("lectureAirbnb : sans bedroomCount, les chambres du titre de partage ; « Studio » vaut 0", () => {
    // Page rooms/1456397434311994216 lue le 2 octobre 2026 (Abondance),
    // réduite aux champs lus : personCapacity, listingLat/Lng, sharingConfig.
    const page = `<html><script>{"listingLat":46.35609,"listingLng":6.69164,"roomType":"Entire home/apt","personCapacity":2}
      {"sharingConfig":{"__typename":"PdpSharingConfig","title":"Appartement · Bernex · ★4,92 · 1 chambre · 1 lit · 1 salle de bain","propertyType":"Appartement"}}</script></html>`;
    const l = lectureAirbnb(page);
    assert.deepEqual([l.capacity, l.capacitySource, l.bedrooms, l.bedroomsSource, l.lat, l.lon, l.gpsSource], [
      2, "structured", 1, "text_regex", 46.35609, 6.69164, "pdp",
    ]);
    const studio = lectureAirbnb(`{"sharingConfig":{"__typename":"PdpSharingConfig","title":"Appartement · Abondance · ★4,61 · Studio · 3 lits · 1 salle de bain"}}`);
    assert.deepEqual([studio.bedrooms, studio.bedroomsSource], [0, "derived_from_type"]);
    // Un bedroomCount publié passe devant le titre de partage.
    const structure = lectureAirbnb(`{"bedroomCount":2,"sharingConfig":{"title":"Maison · 1 chambre · 2 lits"}}`);
    assert.deepEqual([structure.bedrooms, structure.bedroomsSource], [2, "structured"]);
    // Sans titre de partage ni bedroomCount : un trou.
    assert.equal(lectureAirbnb(`{"personCapacity":4}`).bedrooms, null);
  });

  it("lit « 8 voyageurs · 3 chambres » publiés dans les items de la fiche", () => {
    const html = `<html>"items":["8 voyageurs","3 chambres","5 lits","1 salle de bain"]</html>`;
    const l = lectureFiche(html);
    assert.equal(l.capacity, 8);
    assert.equal(l.bedrooms, 3);
  });

  it("lit le GPS LocalBusiness d'une fiche de centrale", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "LocalBusiness",
      name: "Piekosz Jean Stanislas",
      location: {
        "@type": "Place",
        address: { addressLocality: "Les Deux Alpes", streetAddress: "17 route de Champamé" },
        geo: { latitude: "45.01672", longitude: "6.12515", "@type": "GeoCoordinates" },
      },
    })}</script>`;
    const l = lectureFiche(html);
    assert.equal(l.lat, 45.01672);
    assert.equal(l.lon, 6.12515);
    assert.equal(l.locality, "Les Deux Alpes");
    assert.equal(l.street, "17 route de Champamé");
  });

  it("un HTML trop court ou vide ne fabrique rien", () => {
    assert.equal(lectureFiche("").capacity, null);
    assert.equal(lectureFiche("<html></html>").lat, null);
  });

  it("lit une fiche Ingénie : GCAPAC, pièces, Chambre 1-N, GPS en clair", () => {
    const html = `<html><head>
      <meta name="description" content="LE PRINCE DES ECRINS N°505 Appartement 8 personnes, 4 pièces 82.75 m²" />
    </head><body>
      <li class="GCAPAC-G"><span class="type-titre">Capacité (bébés compris) : </span>
        <ul class="valeur-critere"><li class="GCAPAC-GCAP08-G">8 personnes</li></ul></li>
      <li class="GTYPAP-G"><span class="type-titre">Nombre de pièces : </span>
        <ul class="valeur-critere"><li class="GTYPAP-G4PIEC-G">4 pièces</li></ul></li>
      <span class="type-titre crit_GCHAM1">Chambre 1 <span>:</span> </span>
      <span class="type-titre crit_GCHAM2">Chambre 2 <span>:</span> </span>
      <span class="type-titre crit_GCHAM3">Chambre 3 <span>:</span> </span>
      <div class="latitude"><em>Latitude : 45.00498</em></div>
      <div class="longitude"><em>Longitude : 6.11673</em></div>
      <meta itemprop="latitude" content="45.00498" />
      <meta itemprop="longitude" content="6.11673" />
    </body></html>`;
    const l = lectureFiche(html);
    assert.equal(l.capacity, 8);
    assert.equal(l.rooms, 4);
    assert.equal(l.bedrooms, 3);
    assert.equal(l.lat, 45.00498);
    assert.equal(l.lon, 6.11673);
  });

  it("lit une fiche Ingénie d'Arêches : « personnes maximum » et « Nombre de chambre(s) » (Tervetuloa)", () => {
    // Extrait de reservation.areches-beaufort.com/tervetuloa-1.html, 1er octobre 2026.
    const html = `<div class="presentation"><div class="description"><div class="pave1 pave-containText"><span class="contenu_descriptif">Gîte dans la maison du propriétaire. Rez-de-chaussée : séjour-cuisine coin salon (1 canapé gigogne 2 lits 1 personne avec remise à niveau), 1 chambre (1 lit 2 personnes 140x190 cm), salle d'eau (douche), WC séparé.</span></div></div></div>
      <div class="zone_criteres" id="criteres"><div class="cadre critere3"><div class="titre-div">En Bref</div><ul class="type-critere">
      <li class="capacite-G"><span class="type-titre crit_capacite">Capacité <span>:</span> </span><ul class="valeur-critere"><li class="capacite-capaciteMaximumPossible-G"><span class="quantite">4</span> <span class="libelle">personnes maximum</span></li><li class="capacite-surface-G"><span class="quantite">37</span> <span class="libelle">m²</span></li></ul></li>
      <li class="NBDECHAMBRE-G"><span class="type-titre crit_NBDECHAMBRE">Nombre de chambre(s) <span>:</span> </span><ul class="valeur-critere"><li class="NBDECHAMBRE-CHAMBRE1-G">1 chambre</li></ul></li></ul></div>
      <div class="cadre critere4"><ul class="type-critere"><li class="CHAMBRE1-G"><span class="type-titre crit_CHAMBRE1">Chambre 1 <span>:</span> </span><ul class="valeur-critere"><li class="CHAMBRE1-LITDOUBLE-G"><span class="quantite">1</span> <span class="libelle">lit(s) double 140cm</span></li></ul></li></ul></div></div>
      <h1>Tervetuloa</h1>`;
    const l = lectureFiche(html);
    assert.equal(l.capacity, 4);
    assert.equal(l.capacitySource, "structured");
    assert.equal(l.bedrooms, 1);
    assert.equal(l.bedroomsSource, "structured");
  });

  it("lit une fiche Ingénie des Saisies : « Capacité maximale », et les chambres du descriptif (Chalet D'elise)", () => {
    // Extrait de reservation.lessaisies.com/chalet-d-elise-8-personnes-73g211126.html, 1er octobre 2026 :
    // un gîte sans critère de chambres, qui les écrit dans sa présentation.
    const html = `<h2 class="titre_bloc_fiche" id="description"><span>Présentation</span></h2><div class="presentation"><div class="description">
      <div class="pave2 pave-containText"><span class="contenu_descriptif"><table><tr><td><h2><span><strong>BONS PLANS AVEC LES SAISIES RÉSERVATION</strong></span></h2></td></tr></table>
</span></div><div class="pave1 pave-containText"><span class="contenu_descriptif">Maison indépendante. Rez-de-chaussée : séjour-cuisine, salon (2 lits gigognes 1 personne.), 3 chambres (1 lit 1 personne / 1 lit 2 personnes., 1 lit 1 personne / 1 lit 2 personnes), 2 salle d'eau (douche / douche + wc).</span></div></div></div>
      <div class="zone_criteres critere3" id="critere_3"><div class="cadre critere3"><ul class="type-critere">
      <li class="OPERSONNES-G"><span class="type-titre crit_OPERSONNES">Capacité maximale <span>:</span> </span><ul class="valeur-critere"><li class="OPERSONNES-8PERS-G">8 personnes</li></ul></li></ul></div></div>
      <h1>Chalet D'elise <span class="code_prest"><span>(</span>73G211126<span>)</span></span> </h1>`;
    const l = lectureFiche(html);
    assert.equal(l.capacity, 8);
    assert.equal(l.capacitySource, "structured");
    assert.equal(l.bedrooms, 3);
    assert.equal(l.bedroomsSource, "text_regex");
  });

  it("un couchage n'est pas une capacité ; « 2 chambres (1 lit 2 personnes) » ne s'additionne pas", () => {
    const html = `<div class="pave1 pave-containText"><span class="contenu_descriptif">Salon (2 lits gigognes 1 personne.), 2 chambres (1 lit 2 personnes).</span></div>`;
    const l = lectureFiche(html);
    assert.equal(l.capacity, null);
    assert.equal(l.bedrooms, 2);
  });

  it("la ligne « Capacité <span>:</span> … N personnes » se lit aussi", () => {
    const html = `<li><span class="type-titre">Capacité <span>:</span> </span><ul class="valeur-critere"><li>6 personnes</li></ul></li>`;
    const l = lectureFiche(html);
    assert.equal(l.capacity, 6);
    assert.equal(l.capacitySource, "text_regex");
  });

  it("lit le nom véritable sur le h1 d'une fiche Ingénie, pas l'alt photo", () => {
    const html = `<html><head>
      <meta property="og:title" content="CHALET NEVE Chalet 8 personnes - Les 2 Alpes : location" />
    </head><body>
      <h1>CHALET NEVE Chalet 8 personnes</h1>
      <img alt="_clients_223886005_photos_86a_5156059" title="_clients_223886005_photos_86a_5156059" />
    </body></html>`;
    const l = lectureFiche(html);
    assert.equal(l.title, "CHALET NEVE Chalet 8 personnes");
  });

  it("lit une taxe de séjour en somme, pas un tarif à la nuit", () => {
    const somme = lectureFiche(`<html><p>Taxe de séjour : 160,16 €</p></html>`);
    assert.equal(somme.taxeSejour, 160.16);
    const tarif = lectureFiche(`<html><p>taxe de séjour 2,60 € par personne par nuit</p></html>`);
    assert.equal(tarif.taxeSejour, null);
  });

  it("le point du logement (`location.geo`) passe avant celui du loueur", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "LocalBusiness",
      name: "Agence des Cimes",
      telephone: "04 76 00 00 00",
      geo: { latitude: "45.01000", longitude: "6.12000" },
      address: { addressLocality: "Grenoble", streetAddress: "3 place Victor Hugo" },
      location: {
        "@type": "Place",
        address: { addressLocality: "Les Deux Alpes", streetAddress: "17 route de Champamé" },
        geo: { latitude: "45.01672", longitude: "6.12515" },
      },
    })}</script>`;
    const l = lectureFiche(html);
    assert.equal(l.lat, 45.01672);
    assert.equal(l.lon, 6.12515);
    assert.equal(l.locality, "Les Deux Alpes");
    assert.equal(l.street, "17 route de Champamé");
  });

  it("le point Ingénie écrit en clair passe avant le bloc du loueur", () => {
    const html = `<html><script type="application/ld+json">${JSON.stringify({
      "@type": "LocalBusiness",
      name: "Location Dupont",
      geo: { latitude: "45.30000", longitude: "6.50000" },
    })}</script>
      <div class="latitude"><em>Latitude : 45.00498</em></div>
      <div class="longitude"><em>Longitude : 6.11673</em></div></html>`;
    const l = lectureFiche(html);
    assert.equal(l.lat, 45.00498);
    assert.equal(l.lon, 6.11673);
  });

  it("le point, la rue et la commune du loueur ne sont jamais ceux du logement", () => {
    // Une fiche sans `location.geo` : le seul point de la page est celui de
    // l'agence, écrit dans son bloc et relu par la recherche d'un `"geo"`.
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "LocalBusiness",
      name: "Location Dupont",
      geo: { latitude: "45.01230", longitude: "6.12340" },
      address: { addressLocality: "Vaujany", streetAddress: "1 place de l'Office" },
    })}</script>`;
    const l = lectureFiche(html);
    assert.equal(l.lat, null);
    assert.equal(l.lon, null);
    assert.equal(l.street, null);
    assert.equal(l.locality, null);
  });

  it("le point de l'agence repris ailleurs dans la page n'est pas celui du logement", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "RealEstateAgent",
      name: "Agence des Cimes",
      geo: { latitude: "45.01230", longitude: "6.12340" },
    })}</script><div class="carte" data-lat="45.0123" data-lng="6.1234"></div>`;
    const l = lectureFiche(html);
    assert.equal(l.lat, null);
    assert.equal(l.lon, null);
  });

  it("un logement vendu par une entreprise hôtelière garde son propre point", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": ["LocalBusiness", "LodgingBusiness"],
      name: "Résidence Les Mélèzes",
      geo: { latitude: "45.20000", longitude: "6.60000" },
    })}</script><div data-lat="45.9" data-lng="6.9"></div>`;
    const l = lectureFiche(html);
    assert.equal(l.lat, 45.2);
    assert.equal(l.lon, 6.6);
  });

  it("un geo Ingénie vide n'est pas un GPS", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "LocalBusiness",
      location: { geo: { latitude: "", longitude: "", "@type": "GeoCoordinates" } },
    })}</script>`;
    const l = lectureFiche(html);
    assert.equal(l.lat, null);
    assert.equal(l.lon, null);
  });

  it("lit maxOccupancy, sleeps et Max. N personnes d'une fiche Booking", () => {
    const html = `<html>
      {"maxOccupancy":8,"numberOfBedrooms":3}
      <span>Max. 8 personnes</span>
    </html>`;
    const l = lectureFiche(html);
    assert.equal(l.capacity, 8);
    assert.equal(l.bedrooms, 3);
  });

  it("lit le bloc capacity du __NEXT_DATA__ d'une fiche MSEM", () => {
    // Fiche relevée le 25 septembre 2026 (reservation.alpedhuez.com,
    // « Écrin d'Huez »), réduite au bloc lu.
    const html = `<html><script id="__NEXT_DATA__" type="application/json">
      {"props":{"pageProps":{"lodging":{"capacity":{"maxCapacity":7,"minCapacity":1,"nbRooms":3,"nbBedrooms":2}}}}}
    </script></html>`;
    const l = lectureFiche(html);
    assert.equal(l.capacity, 7);
    assert.equal(l.bedrooms, 2);
    assert.equal(l.rooms, 3);
    // Flaine : « nbBedrooms » nul, rien n'est inventé.
    const flaine = lectureFiche(
      `<html>{"capacity":{"maxCapacity":6,"nbRooms":2,"nbBedrooms":null}}</html>`,
    );
    assert.equal(flaine.bedrooms, null);
    assert.equal(flaine.rooms, 2);
  });

  it("décode &amp; et &quot; du titre og:title", () => {
    const fiche = (titre: string) =>
      `<html><head><meta property="og:title" content="${titre}" /></head><body></body></html>`;
    assert.equal(lectureFiche(fiche("Ride &amp; Breakfast")).title, "Ride & Breakfast");
    assert.equal(lectureFiche(fiche("Chalet &quot;Le Lys&quot;")).title, 'Chalet "Le Lys"');
  });

  it("décode le titre une seule fois : &amp;quot; reste &quot;", () => {
    const og = `<html><head><meta property="og:title" content="Chalet &amp;quot;Le Lys&amp;quot;" /></head></html>`;
    assert.equal(lectureFiche(og).title, "Chalet &quot;Le Lys&quot;");
    // Sans GPS, la page repasse par les recours de point : le titre h1 n'y est pas relu.
    const h1 = `<html><body><h1>Chalet &amp;quot;Neve&amp;quot;</h1></body></html>`;
    assert.equal(lectureFiche(h1).title, "Chalet &quot;Neve&quot;");
    const jsonLd = `<script type="application/ld+json">${JSON.stringify({
      "@type": "VacationRental",
      name: "Chalet &amp;quot;Neve&amp;quot;",
      containsPlace: { "@type": "Accommodation", occupancy: { maxValue: 8 } },
    })}</script>`;
    assert.equal(lectureFiche(jsonLd).title, "Chalet &quot;Neve&quot;");
    // Une entité numérique derrière un `&amp;` ne se décode pas non plus.
    const apostrophe = `<html><head><meta property="og:title" content="Chalet L&amp;#39;Arolle" /></head></html>`;
    assert.equal(lectureFiche(apostrophe).title, "Chalet L&#39;Arolle");
  });

  it("lit « Nb chambre(s) : N » d'une fiche iResa, rien pour un studio", () => {
    // Fiche relevée le 2 octobre 2026 (lesarcs-reservation.com, « Résidence Le
    // Rochefort - appartement 2 pièces cabine 4 personnes n°309 »), réduite
    // aux lignes lues.
    const html = `<html><ul><li class="SheetEquipmentServices-listing"> Nb chambre(s) : 1 </li>
      <li class="SheetEquipmentServices-listing"> Draps fournis : non </li>
      <li class="SheetEquipmentServices-listing"> Séjour : 1 canapé lit pour 2 personnes </li></ul></html>`;
    const l = lectureFiche(html);
    assert.equal(l.bedrooms, 1);
    assert.equal(l.bedroomsSource, "structured");
    assert.equal(l.lat, null);
    // Le studio n°317 (Le Ruitor) n'a pas la ligne : rien n'est déduit ici.
    const studio = lectureFiche(
      `<html><ul><li class="SheetEquipmentServices-listing"> Draps fournis : non </li>
      <li class="SheetEquipmentServices-listing"> Étage : 03 </li></ul></html>`,
    );
    assert.equal(studio.bedrooms, null);
  });

  it("lit un couple latitude/longitude hors bloc geo", () => {
    const html = `<html>{"name":"Les Violettes","latitude":"45.00565","longitude":"6.12365"}</html>`;
    const l = lectureFiche(html);
    assert.equal(l.lat, 45.00565);
    assert.equal(l.lon, 6.12365);
  });
});

describe("decodeHtml : entités d'un attribut content", () => {
  it("décode &amp;, &quot; et l'apostrophe sous ses trois formes", () => {
    assert.equal(decodeHtml("Ride &amp; Breakfast"), "Ride & Breakfast");
    assert.equal(decodeHtml("Chalet &quot;Le Lys&quot;"), 'Chalet "Le Lys"');
    assert.equal(decodeHtml("L&#39;Ourson, L&apos;Isba, L&#x27;Igloo"), "L'Ourson, L'Isba, L'Igloo");
  });

  it("ne décode pas deux fois : &amp;quot; reste &quot;", () => {
    assert.equal(decodeHtml("&amp;quot;"), "&quot;");
    assert.equal(decodeHtml("&amp;#39;"), "&#39;");
    assert.equal(decodeHtml("&#38;amp;"), "&amp;");
  });

  it("garde l'espace, le degré, et une entité inconnue telle quelle", () => {
    assert.equal(decodeHtml("8&nbsp;personnes, 4&#160;pièces"), "8 personnes, 4 pièces");
    assert.equal(decodeHtml("-5&deg;C, -7&#176;C"), "-5°C, -7°C");
    assert.equal(decodeHtml("&inconnue;"), "&inconnue;");
  });
});

describe("poserReleve : même annonce, champs déjà lus", () => {
  it("recopie chambres et GPS d'un relevé au même identifiant Airbnb, jamais une capacité tirée d'un titre", () => {
    const dump = [
      {
        id: "abnb-old",
        source: "Airbnb",
        title: "Les Deux-Alpes, appartement 6-8 pers, cosy, calme",
        capacity: null as number | null,
        bedrooms: 3 as number | null,
        rooms: null as number | null,
        photo:
          "https://a0.muscache.com/im/pictures/miso/Hosting-27623894/original/f09c2e09-9c61-4a8a-a3a2-d7481a14b78e.jpeg",
        url: null as string | null,
        lat: 45.022 as number | null,
        lon: 6.1247 as number | null,
        proven: "dump",
      },
    ];
    const live = [
      {
        id: "abnb-27623894",
        source: "Airbnb",
        title: "Appartement cosy",
        capacity: null as number | null,
        bedrooms: null as number | null,
        rooms: null as number | null,
        photo: null as string | null,
        url: "https://www.airbnb.fr/rooms/27623894",
        lat: null as number | null,
        lon: null as number | null,
        proven: "live",
      },
    ];
    assert.equal(cleListing(live[0]), "Airbnb:27623894");
    assert.equal(poserReleve(live, dump), 1);
    // « 6-8 pers » dans le titre n'est pas une capacité Airbnb (règle du
    // 1er octobre 2026) : seule la page du logement la donnera.
    assert.equal(live[0].capacity, null);
    assert.equal(live[0].bedrooms, 3);
    assert.equal(live[0].lat, 45.022);
    assert.equal(live[0].lon, 6.1247);
  });

  it("recopie le nom véritable à la place d'un alt photo", () => {
    const dump = [
      {
        id: "ing-2a-neve",
        source: "Centrale",
        title: "CHALET NEVE Chalet 8 personnes",
        capacity: 8 as number | null,
        bedrooms: null as number | null,
        url: "https://reservation.les2alpes.com/chalet-neve-chalet-8-personnes-les-2-alpes.html",
        lat: null as number | null,
        lon: null as number | null,
        proven: "dump",
      },
    ];
    const live = [
      {
        id: "ing-2a-neve",
        source: "Centrale",
        title: "_clients_223886005_photos_86a_5156059",
        capacity: null as number | null,
        bedrooms: null as number | null,
        url: "https://reservation.les2alpes.com/chalet-neve-chalet-8-personnes-les-2-alpes.html",
        lat: null as number | null,
        lon: null as number | null,
        proven: "live",
      },
    ];
    assert.equal(poserReleve(live, dump), 1);
    assert.equal(live[0].title, "CHALET NEVE Chalet 8 personnes");
    assert.equal(live[0].capacity, 8);
  });
});

describe("lectureFiche : fiches des centrales relevées le 2 octobre 2026", () => {
  it("Ingénie : le critère structuré passe devant « 3 personnes » du titre, et « Studio » vaut une pièce", () => {
    const html = `<html><head><title>L' ANDROMEDE N°68 Appartement 3 personnes</title></head><body>
      <h1>L' ANDROMEDE N°68 Appartement 3 personnes</h1>
      <li class="GTYPAP-G"><span class="type-titre">Nombre de pièces : </span><ul class="valeur-critere"><li class="GTYPAP-GSTUDI-G">Studio</li><li class="GTYPAP-STUDIOCOINNUIT-G">Studio + coin(s) nuit</li></ul></li>
      <li class="GCAPAC-G"><span class="type-titre">Capacité (bébés compris) : </span><ul class="valeur-critere"><li class="GCAPAC-GCAP03-G">3 personnes</li></ul></li>
      </body></html>`;
    const l = lectureFiche(html);
    assert.deepEqual([l.capacity, l.capacitySource, l.rooms], [3, "structured", 1]);
  });

  it("Ingénie : `ICAPAC-ICAPAC` et un descriptif « studio 18 m2 »", () => {
    const html = `<html><body>${"<p>x</p>".repeat(30)}
      <span class="ICAPAC-ICAPAC-I"><span class="quantite">2</span> <span class="libelle">personnes</span></span>
      <div class="cadre"><span class="contenu_descriptif">"Asters 18 Bâtiment C1" studio 18 m2 au 2ème étage. Séjour avec 1 divan-lit double.</span></div>
      </body></html>`;
    const l = lectureFiche(html);
    assert.deepEqual([l.capacity, l.capacitySource, l.rooms, l.bedrooms], [2, "structured", 1, null]);
  });

  it("Ingénie : le bloc « Capacité » (`capacite-nombreChambres`, `-nombrePieces`, `-capaciteHebergement`)", () => {
    const html = `<html><body>${"<p>x</p>".repeat(30)}
      <li class="capacite-G"><span class="type-titre crit_capacite">Capacité <span>:</span> </span><ul class="valeur-critere">
      <li class="capacite-nombreChambres-G"><span class="quantite">1</span> <span class="libelle">chambre(s)</span></li>
      <li class="capacite-capaciteHebergement-G"><span class="quantite">4</span> <span class="libelle">personnes</span></li>
      <li class="capacite-nombrePieces-G"><span class="quantite">2</span> <span class="libelle">pièce(s)</span></li></ul></li>
      </body></html>`;
    const l = lectureFiche(html);
    assert.deepEqual([l.capacity, l.capacitySource, l.bedrooms, l.bedroomsSource, l.rooms], [4, "structured", 1, "structured", 2]);
  });

  it("Ingénie : « Cabine 1 » (`crit_GCHAM7`) n'est pas une septième chambre", () => {
    const html = `<html><body>${"<p>x</p>".repeat(30)}
      <li class="GCHAM1-I"><span class="type-titre crit_GCHAM1">Chambre 1 <span>:</span> </span></li>
      <li class="GCHAM7-I"><span class="type-titre crit_GCHAM7">Cabine 1 <span>:</span> </span></li>
      </body></html>`;
    const l = lectureFiche(html);
    assert.deepEqual([l.bedrooms, l.bedroomsSource], [1, "structured"]);
  });

  it("Gîtes de France (widget ITEA) : la capacité du formulaire de réservation `formule_capacite`", () => {
    const html = `<html><body>${"<p>x</p>".repeat(30)}
      <select name="formule_capacite" id="formule_selectCapacite"><option value="1">1 personne</option><option selected value="2">2 personnes</option><option value="3">3 personnes</option></select>
      <select name="formule_capacite_enfant"><option value="0">0 enfant</option><option value="4">4 enfants</option></select>
      </body></html>`;
    const l = lectureFiche(html);
    assert.deepEqual([l.capacity, l.capacitySource], [3, "structured"]);
  });
});

describe("lectureFiche : libellés et descriptions des fiches, 2 octobre 2026", () => {
  it("Orchestra : le bloc « Information » en gras (capacité, chambres à coucher, type)", () => {
    const html = `<div class="txt-content">- <strong>Ref:</strong> LC-SXT306<br/>- <strong>Type</strong>: Appt 2 pièces<br/>- <strong>Capacité:</strong> 4<br/>- <strong>Chambres à coucher:</strong> 1<br/>- <strong>Lit simple:</strong> 2<br/></div>${"<p>x</p>".repeat(30)}`;
    const l = lectureFiche(html);
    assert.deepEqual([l.capacity, l.capacitySource, l.bedrooms, l.bedroomsSource, l.rooms], [4, "structured", 1, "structured", 2]);
  });

  it("Ingénie : le critère « TYPE DE LOGEMENT » (`OTYPA`), « deux pièces » ou des studios", () => {
    const deux = `<ul class="valeur-critere"><li class="OTYPA-OTYAPPT-G">appartement</li><li class="OTYPA-OTYP2P-G">deux pièces</li></ul>${"<p>x</p>".repeat(30)}`;
    assert.equal(lectureFiche(deux).rooms, 2);
    const studio = `<ul class="valeur-critere"><li class="OTYPA-OTYAPPT-G">appartement</li><li class="OTYPA-OTYPST-G">studio</li><li class="OTYPA-OTYPSC-G">studio cabine</li></ul>${"<p>x</p>".repeat(30)}`;
    assert.equal(lectureFiche(studio).rooms, 1);
  });

  it("la description du `Product` d'une fiche : « pour 4 personnes », pas la taille d'un lit", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Product",
      name: "Studio - LES BALCONS DE LA TARENTAISE",
      description: "Studio neuf avec mezzanine et coin montagne pour 4 personnes. Séjour avec 1 lit 2 personnes.",
    })}</script>${"<p>x</p>".repeat(30)}`;
    const l = lectureFiche(html);
    assert.deepEqual([l.capacity, l.capacitySource], [4, "text_regex"]);
  });

  it("la valeur d'un champ de formulaire (`value=\"2 personnes\"`) n'est pas une capacité", () => {
    const html = `<label>Voyageurs</label><input type="text" value="2 personnes"/>${"<p>x</p>".repeat(30)}`;
    assert.equal(lectureFiche(html).capacity, null);
  });
});

describe("lectureFiche : la description qu'Ingénie écrit dans le bloc de l'agence", () => {
  const page = (description: string, ingenie = true) =>
    `<html><head>${ingenie ? '<script src="https://static.ingenie.fr/js/ScriptsLoader.js"></script>' : ""}<script type="application/ld+json">${JSON.stringify({
      "@type": "LocalBusiness",
      name: "Agence Cimalpes",
      description,
    })}</script></head><body>${"<p>x</p>".repeat(30)}</body></html>`;

  it("« offre 5 chambres et peut accueillir 12 personnes », puis l'énumération des chambres", () => {
    const l = lectureFiche(
      page("Chalet de 193m² qui offre 5 chambres et peut accueillir 12 personnes.<br />- 1 Chambre avec un lit double<br />- 1 Chambre avec deux lits doubles<br />- 1 Chambre en suite<br />- 1 Chambre avec un lit double<br />- 1 Chambre avec un lit double"),
    );
    assert.deepEqual([l.capacity, l.bedrooms], [12, 5]);
  });

  it("une énumération sans total : sa somme (« - 1 chambre … - 1 chambre en suite »)", () => {
    const l = lectureFiche(page("Conçu pour 8 personnes.<br />- 1 chambre avec lit double (160x200)<br />- 1 dortoir avec 2 lits superposés<br />- 1 chambre en suite avec salle de douche"));
    assert.deepEqual([l.capacity, l.bedrooms], [8, 2]);
  });

  it("hors d'une page Ingénie, la description d'une agence n'est pas lue", () => {
    const l = lectureFiche(page("Agence fondée en 1980, 3 chambres d'hôtes et 12 personnes à votre service", false));
    assert.deepEqual([l.capacity, l.bedrooms], [null, null]);
  });
});

describe("lectureFiche : le résumé d'une fiche Abritel", () => {
  it("`propertyHighlightedDetails` : « 22 chambres » (icône room), « 62 personnes » (icône people)", () => {
    const item = (icone: string, texte: string) =>
      `{\\"__typename\\":\\"PropertyInfoItem\\",\\"primary\\":{\\"__typename\\":\\"EGDSGraphicText\\",\\"graphic\\":{\\"__typename\\":\\"Icon\\",\\"description\\":\\"\\",\\"id\\":\\"${icone}\\",\\"size\\":null}},\\"text\\":\\"${texte}\\"}`;
    const html = `<script>window.__DATA__ = "{\\"propertyHighlightedDetails\\":{\\"__typename\\":\\"PropertyInfoContent\\",\\"infoItems\\":[${item("room", "22 chambres")},${item("bathroom", "9 salles de bain")},${item("people", "62 personnes")}]}}";</script>${"<p>x</p>".repeat(30)}`;
    const l = lectureFiche(html);
    assert.deepEqual([l.capacity, l.capacitySource, l.bedrooms, l.bedroomsSource], [62, "structured", 22, "structured"]);
  });
});

describe("lectureFiche : la somme des couchages, faute de capacité chiffrée", () => {
  it("critère Ingénie « 1 x 2 lits 1 personne superposés » : 2, marquée", () => {
    const html = `<div><span class="libelle-critere" id="crit_GCOINM">Coin montagne ouvert <span>:</span> </span><ul class="valeur-critere"><li class="GCOINM-G2LSUP-G">1 x 2 lits 1 personne superposés</li></ul></div>${"<p>x</p>".repeat(10)}`;
    const l = lectureFiche(html);
    assert.deepEqual([l.capacity, l.capacitySource, l.capaciteCouchages], [2, "text_regex", true]);
  });

  it("un couchage sans places : rien", () => {
    const html = `<div><ul class="valeur-critere"><li>1 lit double</li><li>1 canapé-lit</li></ul></div>${"<p>x</p>".repeat(10)}`;
    const l = lectureFiche(html);
    assert.equal(l.capacity, null);
    assert.equal(l.capaciteCouchages, undefined);
  });

  it("une capacité chiffrée passe devant les couchages", () => {
    const html = `<div><span class="GCAPAC-GCAP06"></span><ul class="valeur-critere"><li>1 lit 2 personnes</li></ul></div>${"<p>x</p>".repeat(10)}`;
    const l = lectureFiche(html);
    assert.equal(l.capacity, 6);
    assert.equal(l.capaciteCouchages, undefined);
  });
});
