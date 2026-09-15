import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lectureFiche } from "./lectureFiche.ts";
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
    assert.equal(l.guests, 8);
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
    assert.equal(l.guests, 8);
    assert.equal(l.lat, 45.02298);
    assert.equal(l.lon, 6.12571);
  });

  it("lit « 8 voyageurs · 3 chambres » publiés dans les items de la fiche", () => {
    const html = `<html>"items":["8 voyageurs","3 chambres","5 lits","1 salle de bain"]</html>`;
    const l = lectureFiche(html);
    assert.equal(l.guests, 8);
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
    assert.equal(lectureFiche("").guests, null);
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
    assert.equal(l.guests, 8);
    assert.equal(l.rooms, 4);
    assert.equal(l.bedrooms, 3);
    assert.equal(l.lat, 45.00498);
    assert.equal(l.lon, 6.11673);
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
    assert.equal(l.guests, 8);
    assert.equal(l.bedrooms, 3);
  });

  it("lit un couple latitude/longitude hors bloc geo", () => {
    const html = `<html>{"name":"Les Violettes","latitude":"45.00565","longitude":"6.12365"}</html>`;
    const l = lectureFiche(html);
    assert.equal(l.lat, 45.00565);
    assert.equal(l.lon, 6.12365);
  });
});

describe("poserReleve : même annonce, champs déjà lus", () => {
  it("recopie capacité, chambres et GPS d'un relevé au même identifiant Airbnb", () => {
    const dump = [
      {
        id: "abnb-old",
        source: "Airbnb",
        title: "Les Deux-Alpes, appartement 6-8 pers, cosy, calme",
        guests: null as number | null,
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
        guests: null as number | null,
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
    assert.equal(live[0].guests, 8);
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
        guests: 8 as number | null,
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
        guests: null as number | null,
        bedrooms: null as number | null,
        url: "https://reservation.les2alpes.com/chalet-neve-chalet-8-personnes-les-2-alpes.html",
        lat: null as number | null,
        lon: null as number | null,
        proven: "live",
      },
    ];
    assert.equal(poserReleve(live, dump), 1);
    assert.equal(live[0].title, "CHALET NEVE Chalet 8 personnes");
    assert.equal(live[0].guests, 8);
  });
});
