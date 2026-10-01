import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lectureAirbnb, pageAirbnbLisible } from "./lectureFiche.ts";
import { adressePourBan, pointBan, RAYON_BAN_KM, requeteBan, type FeatureBan } from "./repliGps.ts";

/** Abondance, telle que le référentiel la situe. */
const STATION = { lat: 46.2808, lon: 6.7203 };

const hit = (
  over: Partial<NonNullable<FeatureBan["properties"]>> = {},
  coord = [6.7213, 46.2795],
): FeatureBan => ({
  geometry: { coordinates: coord },
  properties: {
    type: "housenumber",
    housenumber: "12",
    street: "Route des Granges",
    city: "Abondance",
    label: "12 Route des Granges 74360 Abondance",
    ...over,
  },
});

describe("repli GPS Airbnb : l'adresse publiée par la page", () => {
  it("une voie, un code postal, une commune : la requête BAN", () => {
    const a = adressePourBan("12 Route des Granges", "74360", "Abondance");
    assert.deepEqual(a, {
      voie: "12 Route des Granges",
      codePostal: "74360",
      commune: "Abondance",
    });
    assert.equal(requeteBan(a!), "12 Route des Granges 74360 Abondance");
  });

  it("une voie sans numéro reste une adresse", () => {
    assert.equal(
      adressePourBan("Chemin des Pierrarains", null, "Beaufort")?.voie,
      "Chemin des Pierrarains",
    );
  });

  it("« Abondance » seule n'est pas une adresse : rejetée, pas de géocodage", () => {
    assert.equal(adressePourBan("Abondance", null, "Abondance"), null);
    assert.equal(adressePourBan("74360 Abondance", "74360", "Abondance"), null);
    assert.equal(adressePourBan(null, "74360", "Abondance"), null);
    assert.equal(adressePourBan("12 Route des Granges", "74360", null), null);
  });
});

describe("repli GPS Airbnb : le point BAN, jugé", () => {
  const adresse = adressePourBan("12 Route des Granges", "74360", "Abondance")!;

  it("un numéro dans la commune de l'annonce, dans le rayon : accepté", () => {
    assert.deepEqual(pointBan([hit()], adresse, STATION), { lat: 46.2795, lon: 6.7213 });
  });

  it("une voie sans numéro dans la commune : acceptée", () => {
    const voie = hit({
      type: "street",
      housenumber: null,
      label: "Route des Granges 74360 Abondance",
    });
    assert.deepEqual(pointBan([voie], adresse, STATION), { lat: 46.2795, lon: 6.7213 });
  });

  it("la commune seule, un lieu-dit, une mairie : rejetés", () => {
    assert.equal(
      pointBan([hit({ type: "municipality", housenumber: null, street: null })], adresse, STATION),
      null,
    );
    assert.equal(pointBan([hit({ type: "locality", housenumber: null })], adresse, STATION), null);
    assert.equal(
      pointBan([hit({ name: "Mairie", label: "Mairie 74360 Abondance" })], adresse, STATION),
      null,
    );
  });

  it("une autre commune : rejeté", () => {
    assert.equal(pointBan([hit({ city: "Châtel" })], adresse, STATION), null);
  });

  it(`au-delà de ${RAYON_BAN_KM} km de la station : rejeté`, () => {
    assert.equal(pointBan([hit({}, [6.13, 45.9])], adresse, STATION), null);
  });

  it("le premier hit recevable : un mauvais en tête n'empêche pas le bon", () => {
    const commune = hit({ type: "municipality", housenumber: null }, [6.72, 46.28]);
    assert.deepEqual(pointBan([commune, hit()], adresse, STATION), { lat: 46.2795, lon: 6.7213 });
    assert.equal(pointBan(null, adresse, STATION), null);
  });
});

describe("page du logement Airbnb : les quatre champs, eux seuls", () => {
  const page = (donnees: string, autour = "") =>
    `<html><head>${autour}</head><body><script id="data-deferred-state-0">{${donnees}}</script></body></html>`;

  it("personCapacity, bedroomCount, listingLat et listingLng, structurés et de provenance pdp", () => {
    const l = lectureAirbnb(
      page(`"personCapacity":6,"bedroomCount":2,"listingLat":46.2791,"listingLng":6.7188`),
    );
    assert.equal(l.capacity, 6);
    assert.equal(l.capacitySource, "structured");
    assert.equal(l.bedrooms, 2);
    assert.equal(l.bedroomsSource, "structured");
    assert.deepEqual([l.lat, l.lon, l.gpsSource], [46.2791, 6.7188, "pdp"]);
  });

  it("0 chambre est un studio ; 0 personne n'est pas une capacité", () => {
    const l = lectureAirbnb(page(`"personCapacity":0,"bedroomCount":0`));
    assert.equal(l.capacity, null);
    assert.equal(l.bedrooms, 0);
  });

  it("ni titre ni méta ni texte : « 8 voyageurs · 3 chambres » ne compte pas", () => {
    const meta = `<meta property="og:title" content="Chalet · 8 voyageurs · 3 chambres" /><title>Chalet 8 personnes</title>`;
    const l = lectureAirbnb(page(`"listingLat":46.2791,"listingLng":6.7188`, meta));
    assert.equal(l.capacity, null);
    assert.equal(l.bedrooms, null);
  });

  it("une coquille sans données n'est pas une page lue", () => {
    assert.equal(pageAirbnbLisible("<html><body>Connexion</body></html>"), false);
    assert.equal(pageAirbnbLisible(page("")), true);
  });
});
