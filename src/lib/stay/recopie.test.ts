import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../listings.ts";
import { MARQUE_SOEUR, memeLogement, recopierSoeurs } from "./recopie.ts";

/** La forme des annonces du relevé d'Avoriaz du 23 septembre 2026 (voir
 *  `regroupement.test.ts`), réduite à ce que la recopie lit. */
function annonce(p: Partial<Listing> & Pick<Listing, "id" | "source">): Listing {
  return {
    stationId: "avoriaz",
    title: "Les Sermes M304 plein sud",
    total: 1000,
    currency: "EUR",
    guests: 4,
    bedrooms: 1,
    available: true,
    photo: null,
    url: null,
    lat: 46.1773,
    lon: 6.7076,
    proven: "pyairbnb live 2027-02-06→2027-02-13",
    ...p,
  };
}
const cozy = (source: Listing["source"]) => `CozyCozy ${source} live 2027-02-06→2027-02-13`;

describe("recopie entre offres d'un même logement", () => {
  it("un Airbnb direct sans capacité reçoit celle de son annonce Abritel, à 5 m", () => {
    const airbnb = annonce({ id: "abnb-1", source: "Airbnb", guests: null, bedrooms: null });
    const abritel = annonce({
      id: "abr-9",
      source: "Abritel",
      guests: 6,
      bedrooms: 2,
      rooms: 3,
      lat: 46.17734,
      proven: cozy("Abritel"),
    });
    const r = recopierSoeurs([airbnb, abritel]);
    assert.deepEqual(r.get("abnb-1"), {
      guests: 6,
      bedrooms: 2,
      rooms: 3,
      proven: `${airbnb.proven} · ${MARQUE_SOEUR}`,
    });
    assert.equal(r.has("abr-9"), false);
  });

  it("jamais une valeur publiée remplacée", () => {
    const a = annonce({ id: "abnb-1", source: "Airbnb", guests: 4, bedrooms: null });
    const b = annonce({ id: "abr-9", source: "Abritel", guests: null, bedrooms: 2, proven: cozy("Abritel") });
    const r = recopierSoeurs([a, b]);
    assert.deepEqual(r.get("abnb-1"), { bedrooms: 2, proven: `${a.proven} · ${MARQUE_SOEUR}` });
    assert.deepEqual(r.get("abr-9"), { guests: 4, proven: `${b.proven} · ${MARQUE_SOEUR}` });
  });

  it("même titre à plus de 150 m : deux logements, rien ne passe", () => {
    const a = annonce({ id: "abnb-1", source: "Airbnb", guests: null, bedrooms: null });
    const b = annonce({ id: "abr-9", source: "Abritel", guests: 6, lat: 46.18, proven: cozy("Abritel") });
    assert.equal(recopierSoeurs([a, b]).size, 0);
  });

  it("même identifiant Cozy et même titre : la position passe, même sans point d'un côté", () => {
    const bk = annonce({ id: "bk-77", source: "Booking", lat: null, lon: null, proven: cozy("Booking") });
    const abr = annonce({ id: "abr-77", source: "Abritel", proven: cozy("Abritel") });
    const r = recopierSoeurs([bk, abr]);
    assert.deepEqual(r.get("bk-77"), {
      lat: 46.1773,
      lon: 6.7076,
      proven: `${bk.proven} · ${MARQUE_SOEUR}`,
    });
  });

  it("même identifiant Cozy, titres différents : Cozy mêle parfois un lot et sa résidence", () => {
    const bk = annonce({
      id: "bk-1156975",
      source: "Booking",
      title: "Studio Joséphine",
      guests: null,
      proven: cozy("Booking"),
    });
    const abr = annonce({
      id: "abr-1156975",
      source: "Abritel",
      title: "Résidence Joséphine",
      guests: 6,
      bedrooms: 3,
      proven: cozy("Abritel"),
    });
    assert.equal(memeLogement(bk, abr), false);
    assert.equal(recopierSoeurs([bk, abr]).size, 0);
  });

  it("un titre porté deux fois par une plateforme est un type de logement : rien ne passe", () => {
    const a1 = annonce({ id: "abr-1", source: "Abritel", guests: 4, proven: cozy("Abritel") });
    const a2 = annonce({ id: "abr-2", source: "Abritel", guests: 6, proven: cozy("Abritel") });
    const b = annonce({ id: "abnb-3", source: "Airbnb", guests: null, bedrooms: null });
    assert.equal(recopierSoeurs([a1, a2, b]).size, 0);
  });

  it("de sœur en sœur : A et B par le titre et le point, B et C par Cozy", () => {
    const a = annonce({ id: "abnb-1", source: "Airbnb", guests: null, bedrooms: null });
    const b = annonce({ id: "abr-5", source: "Abritel", guests: null, bedrooms: null, proven: cozy("Abritel") });
    const c = annonce({
      id: "bk-5",
      source: "Booking",
      guests: 5,
      bedrooms: 2,
      lat: null,
      lon: null,
      proven: cozy("Booking"),
    });
    const r = recopierSoeurs([a, b, c]);
    assert.equal(r.get("abnb-1")?.guests, 5);
    assert.equal(r.get("abr-5")?.bedrooms, 2);
    assert.equal(r.get("bk-5")?.lat, 46.1773);
  });

  it("un groupe formé de proche en proche qui réunit deux capacités différentes : rien ne passe", () => {
    // Trois offres du même titre à moins de 5 m. `regrouper` unit A et B, puis
    // B et C, mais A (4 personnes) et C (6 personnes) sont deux logements.
    const titre = "Appartement Les Chalets du Soleil vue pistes";
    const a = annonce({ id: "abr-1", source: "Abritel", title: titre, guests: 4, bedrooms: null, proven: cozy("Abritel") });
    const b = annonce({ id: "abnb-2", source: "Airbnb", title: titre, guests: null, bedrooms: null, lat: 46.17732 });
    const c = annonce({
      id: "bk-3",
      source: "Booking",
      title: titre,
      guests: 6,
      bedrooms: 3,
      lon: 6.70762,
      proven: cozy("Booking"),
    });
    assert.equal(memeLogement(a, c), false);
    const r = recopierSoeurs([a, b, c]);
    assert.equal(r.get("abr-1"), undefined);
    assert.equal(r.get("abnb-2"), undefined);
    assert.equal(r.size, 0);
  });

  it("même identifiant Cozy et même titre, mais deux capacités publiées : pas le même logement", () => {
    const bk = annonce({ id: "bk-88", source: "Booking", guests: 4, bedrooms: 1, lat: null, lon: null, proven: cozy("Booking") });
    const abr = annonce({ id: "abr-88", source: "Abritel", guests: 6, bedrooms: 3, proven: cozy("Abritel") });
    assert.equal(memeLogement(bk, abr), false);
  });

  it("une offre seule ne reçoit rien", () => {
    assert.equal(recopierSoeurs([annonce({ id: "abnb-1", source: "Airbnb", guests: null })]).size, 0);
  });
});
