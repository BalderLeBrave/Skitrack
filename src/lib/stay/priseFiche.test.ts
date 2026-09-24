import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../listings.ts";
import { choisirFiches, disjoncteur, ecrireLaissees, raisonDeLaisser, trousDe } from "./priseFiche.ts";

function annonce(extra: Partial<Listing> = {}): Listing {
  return {
    id: "x",
    stationId: "avoriaz",
    title: "Studio pied des pistes",
    source: "Abritel",
    total: 900,
    currency: "EUR",
    guests: 4,
    bedrooms: 1,
    available: true,
    photo: null,
    url: null,
    lat: 46.19,
    lon: 6.77,
    proven: "test",
    ...extra,
  };
}

const ABRITEL = "https://www.abritel.fr/location-vacances/p2125874";
const BOOKING = "https://www.booking.com/hotel/fr/les-tilleuls-le-biot.html";
const AIRBNB = "https://www.airbnb.fr/rooms/10673653";
const GITES = "https://widget.itea.fr/widget.php?code=H74G000123";

describe("trous d'une annonce", () => {
  it("nomme capacité, chambres, GPS et titre-fichier", () => {
    assert.deepEqual(trousDe(annonce()), []);
    assert.deepEqual(
      trousDe(annonce({ guests: null, bedrooms: null, lat: null, lon: null, title: "IMG_4021.jpg" })),
      ["capacite", "chambres", "gps", "titre"],
    );
  });

  it("des pièces tiennent lieu de chambres, pas un zéro", () => {
    assert.deepEqual(trousDe(annonce({ bedrooms: null, rooms: 2 })), []);
    assert.deepEqual(trousDe(annonce({ bedrooms: null, rooms: 0 })), ["chambres"]);
  });
});

describe("ouvrir une fiche seulement si elle peut combler", () => {
  it("Booking en HTTP simple ne rend qu'un défi : jamais ouvert", () => {
    assert.equal(raisonDeLaisser(annonce({ source: "Booking", guests: null }), BOOKING), "booking.com");
    assert.equal(raisonDeLaisser(annonce({ source: "Booking", lat: null, lon: null }), BOOKING), "booking.com");
  });

  it("Abritel publie le GPS et le titre, ni capacité ni chambres", () => {
    assert.equal(raisonDeLaisser(annonce({ guests: null }), ABRITEL), "abritel.fr");
    assert.equal(raisonDeLaisser(annonce({ guests: null, bedrooms: null }), ABRITEL), "abritel.fr");
    assert.equal(raisonDeLaisser(annonce({ guests: null, lat: null, lon: null }), ABRITEL), null);
    assert.equal(raisonDeLaisser(annonce({ title: "photos_ab12_1234" }), ABRITEL), null);
  });

  it("Airbnb : rooms/ seulement pour un GPS vide, comme avant", () => {
    const sansCap = annonce({ source: "Airbnb", guests: null, bedrooms: null });
    assert.equal(raisonDeLaisser(sansCap, AIRBNB), "Airbnb avec GPS");
    assert.equal(raisonDeLaisser({ ...sansCap, lat: null, lon: null }, AIRBNB), null);
  });

  it("Gîtes et hôte inconnu restent ouverts", () => {
    assert.equal(raisonDeLaisser(annonce({ source: "Gîtes de France" }), GITES), null);
    assert.equal(
      raisonDeLaisser(annonce({ source: "Centrale", guests: null }), "https://reservation.exemple.fr/fiche/12"),
      null,
    );
  });
});

describe("choisir avant de borner", () => {
  it("les Airbnb à GPS ne prennent plus la place des fiches qu'on ouvre", () => {
    const airbnbs = Array.from({ length: 170 }, (_, i) =>
      annonce({ id: `a${i}`, source: "Airbnb", guests: null, bedrooms: null, url: `${AIRBNB}${i}` }),
    );
    const gite = annonce({ id: "g", source: "Gîtes de France", guests: null, url: GITES });
    const airbnbSansGps = annonce({ id: "n", source: "Airbnb", guests: null, lat: null, lon: null, url: AIRBNB });
    const { aLire, laissees } = choisirFiches([...airbnbs, gite, airbnbSansGps], (l) => l.url);
    assert.deepEqual(
      aLire.map((l) => l.id),
      ["g", "n"],
    );
    assert.equal(laissees.get("Airbnb avec GPS"), 170);
    assert.equal(ecrireLaissees(laissees), " · laissées : Airbnb avec GPS 170");
  });

  it("une annonce sans URL de fiche n'est ni lue ni comptée", () => {
    const { aLire, laissees } = choisirFiches([annonce({ guests: null })], () => null);
    assert.equal(aLire.length, 0);
    assert.equal(laissees.size, 0);
    assert.equal(ecrireLaissees(laissees), "");
  });
});

describe("disjoncteur par hôte", () => {
  it("coupe après N lectures de suite sans rien combler, et le dit une fois", () => {
    const d = disjoncteur(3);
    assert.equal(d.noter("a.fr", false), false);
    assert.equal(d.noter("a.fr", false), false);
    assert.equal(d.coupe("a.fr"), false);
    assert.equal(d.noter("a.fr", false), true);
    assert.equal(d.coupe("a.fr"), true);
    assert.equal(d.noter("a.fr", false), false);
  });

  it("une lecture qui comble remet le compte à zéro", () => {
    const d = disjoncteur(2);
    d.noter("a.fr", false);
    d.noter("a.fr", true);
    d.noter("a.fr", false);
    assert.equal(d.coupe("a.fr"), false);
  });

  it("les hôtes se comptent séparément", () => {
    const d = disjoncteur(2);
    d.noter("a.fr", false);
    d.noter("b.fr", false);
    assert.equal(d.coupe("a.fr"), false);
    assert.equal(d.coupe("b.fr"), false);
  });
});
