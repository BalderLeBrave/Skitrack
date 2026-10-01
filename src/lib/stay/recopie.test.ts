import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../listings.ts";
import { jumelageGpsAirbnb, MARQUE_SOEUR, memeLogement, recopierSoeurs } from "./recopie.ts";

/** La forme des annonces du relevé d'Avoriaz du 23 septembre 2026 (voir
 *  `regroupement.test.ts`), réduite à ce que la recopie lit. */
function annonce(p: Partial<Listing> & Pick<Listing, "id" | "source">): Listing {
  return {
    stationId: "avoriaz",
    title: "Les Sermes M304 plein sud",
    total: 1000,
    currency: "EUR",
    capacity: 4,
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
  it("une offre Booking sans capacité reçoit celle de son annonce Abritel, à 5 m", () => {
    const airbnb = annonce({ id: "bk-1", source: "Booking", capacity: null, bedrooms: null });
    const abritel = annonce({
      id: "abr-9",
      source: "Abritel",
      capacity: 6,
      bedrooms: 2,
      rooms: 3,
      lat: 46.17734,
      proven: cozy("Abritel"),
    });
    const r = recopierSoeurs([airbnb, abritel]);
    assert.deepEqual(r.get("bk-1"), {
      capacity: 6,
      capacitySource: "structured",
      bedrooms: 2,
      bedroomsSource: "structured",
      rooms: 3,
      proven: `${airbnb.proven} · ${MARQUE_SOEUR}`,
    });
    assert.equal(r.has("abr-9"), false);
  });

  it("jamais une valeur publiée remplacée", () => {
    const a = annonce({ id: "bk-1", source: "Booking", capacity: 4, bedrooms: null });
    const b = annonce({ id: "abr-9", source: "Abritel", capacity: null, bedrooms: 2, proven: cozy("Abritel") });
    const r = recopierSoeurs([a, b]);
    assert.deepEqual(r.get("bk-1"), {
      bedrooms: 2,
      bedroomsSource: "structured",
      proven: `${a.proven} · ${MARQUE_SOEUR}`,
    });
    assert.deepEqual(r.get("abr-9"), {
      capacity: 4,
      capacitySource: "structured",
      proven: `${b.proven} · ${MARQUE_SOEUR}`,
    });
  });

  it("une valeur du texte ne comble qu'un vide, et le reste ; un champ structuré la remplace", () => {
    const a = annonce({
      id: "bk-1",
      source: "Booking",
      capacity: 6,
      capacitySource: "text_regex",
      bedrooms: 2,
      bedroomsSource: "derived_from_type",
    });
    const b = annonce({
      id: "abr-9",
      source: "Abritel",
      capacity: 6,
      capacitySource: "structured",
      bedrooms: null,
      proven: cozy("Abritel"),
    });
    const r = recopierSoeurs([a, b]);
    // La capacité structurée d'Abritel remplace celle que le titre donnait à Booking.
    assert.deepEqual(r.get("bk-1"), {
      capacity: 6,
      capacitySource: "structured",
      proven: `${a.proven} · ${MARQUE_SOEUR}`,
    });
    // Les chambres que le type donnait à Booking comblent le vide d'Abritel, dérivées.
    assert.deepEqual(r.get("abr-9"), {
      bedrooms: 2,
      bedroomsSource: "derived_from_type",
      proven: `${b.proven} · ${MARQUE_SOEUR}`,
    });
  });

  it("une offre Booking muette reçoit ce que le sous-titre de la tuile Abritel disait", () => {
    const muet = annonce({ id: "bk-1", source: "Booking", capacity: null, bedrooms: null });
    const abr = annonce({
      id: "abr-9",
      source: "Abritel",
      capacity: 10,
      capacitySource: "text_regex",
      bedrooms: 4,
      bedroomsSource: "text_regex",
      proven: cozy("Abritel"),
    });
    assert.deepEqual(recopierSoeurs([muet, abr]).get("bk-1"), {
      capacity: 10,
      capacitySource: "text_regex",
      bedrooms: 4,
      bedroomsSource: "text_regex",
      proven: `${muet.proven} · ${MARQUE_SOEUR}`,
    });
  });

  it("même titre à plus de 150 m : deux logements, rien ne passe", () => {
    const a = annonce({ id: "abnb-1", source: "Airbnb", capacity: null, bedrooms: null });
    const b = annonce({ id: "abr-9", source: "Abritel", capacity: 6, lat: 46.18, proven: cozy("Abritel") });
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
      capacity: null,
      proven: cozy("Booking"),
    });
    const abr = annonce({
      id: "abr-1156975",
      source: "Abritel",
      title: "Résidence Joséphine",
      capacity: 6,
      bedrooms: 3,
      proven: cozy("Abritel"),
    });
    assert.equal(memeLogement(bk, abr), false);
    assert.equal(recopierSoeurs([bk, abr]).size, 0);
  });

  it("un titre porté deux fois par une plateforme est un type de logement : rien ne passe", () => {
    const a1 = annonce({ id: "abr-1", source: "Abritel", capacity: 4, proven: cozy("Abritel") });
    const a2 = annonce({ id: "abr-2", source: "Abritel", capacity: 6, proven: cozy("Abritel") });
    const b = annonce({ id: "abnb-3", source: "Airbnb", capacity: null, bedrooms: null });
    assert.equal(recopierSoeurs([a1, a2, b]).size, 0);
  });

  it("de sœur en sœur : A et B par le titre et le point, B et C par Cozy", () => {
    const a = annonce({ id: "cen-1", source: "Centrale", capacity: null, bedrooms: null });
    const b = annonce({ id: "abr-5", source: "Abritel", capacity: null, bedrooms: null, proven: cozy("Abritel") });
    const c = annonce({
      id: "bk-5",
      source: "Booking",
      capacity: 5,
      bedrooms: 2,
      lat: null,
      lon: null,
      proven: cozy("Booking"),
    });
    const r = recopierSoeurs([a, b, c]);
    assert.equal(r.get("cen-1")?.capacity, 5);
    assert.equal(r.get("abr-5")?.bedrooms, 2);
    assert.equal(r.get("bk-5")?.lat, 46.1773);
  });

  it("un groupe formé de proche en proche qui réunit deux capacités différentes : rien ne passe", () => {
    // Trois offres du même titre à moins de 5 m. `regrouper` unit A et B, puis
    // B et C, mais A (4 personnes) et C (6 personnes) sont deux logements.
    const titre = "Appartement Les Chalets du Soleil vue pistes";
    const a = annonce({ id: "abr-1", source: "Abritel", title: titre, capacity: 4, bedrooms: null, proven: cozy("Abritel") });
    const b = annonce({ id: "abnb-2", source: "Airbnb", title: titre, capacity: null, bedrooms: null, lat: 46.17732 });
    const c = annonce({
      id: "bk-3",
      source: "Booking",
      title: titre,
      capacity: 6,
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
    const bk = annonce({ id: "bk-88", source: "Booking", capacity: 4, bedrooms: 1, lat: null, lon: null, proven: cozy("Booking") });
    const abr = annonce({ id: "abr-88", source: "Abritel", capacity: 6, bedrooms: 3, proven: cozy("Abritel") });
    assert.equal(memeLogement(bk, abr), false);
  });

  it("une offre seule ne reçoit rien", () => {
    assert.equal(recopierSoeurs([annonce({ id: "abnb-1", source: "Airbnb", capacity: null })]).size, 0);
  });
});

describe("Airbnb : la page seule donne capacité et chambres, le jumelage ne donne qu'un point", () => {
  const abritel = () =>
    annonce({ id: "abr-77", source: "Abritel", capacity: 6, bedrooms: 2, proven: cozy("Abritel") });

  it("ni capacité ni chambres d'une sœur : seule la page du logement les donne", () => {
    const airbnb = annonce({ id: "abnb-1", source: "Airbnb", capacity: null, bedrooms: null });
    const r = recopierSoeurs([airbnb, abritel()]);
    assert.equal(r.get("abnb-1"), undefined);
  });

  it("page lue sans point : celui de la sœur, de provenance « jumelage »", () => {
    // Page lue : ni point, ni capacité, ni chambres publiés.
    const airbnb = annonce({
      id: "abnb-77",
      source: "Airbnb",
      capacity: null,
      bedrooms: null,
      lat: null,
      lon: null,
      pdpLue: true,
      proven: cozy("Airbnb"),
    });
    assert.deepEqual(recopierSoeurs([airbnb, abritel()]).get("abnb-77"), {
      lat: 46.1773,
      lon: 6.7076,
      gpsSource: "jumelage",
      proven: `${airbnb.proven} · ${MARQUE_SOEUR}`,
    });
    assert.deepEqual(jumelageGpsAirbnb([airbnb, abritel()]).get("abnb-77"), { lat: 46.1773, lon: 6.7076 });
  });

  it("page pas encore lue, ou refusée : pas de jumelage, elle se relira", () => {
    const airbnb = annonce({
      id: "abnb-77",
      source: "Airbnb",
      capacity: null,
      bedrooms: null,
      lat: null,
      lon: null,
      proven: cozy("Airbnb"),
    });
    assert.equal(recopierSoeurs([airbnb, abritel()]).get("abnb-77"), undefined);
    assert.equal(jumelageGpsAirbnb([airbnb, abritel()]).size, 0);
  });

  it("un point pdp déjà là n'est pas écrasé par le jumelage", () => {
    const airbnb = annonce({
      id: "abnb-77",
      source: "Airbnb",
      lat: 46.1774,
      lon: 6.7077,
      gpsSource: "pdp",
      pdpLue: true,
      proven: cozy("Airbnb"),
    });
    const soeur = annonce({ id: "abr-77", source: "Abritel", capacity: 4, bedrooms: 1, proven: cozy("Abritel") });
    assert.equal(recopierSoeurs([airbnb, soeur]).get("abnb-77"), undefined);
    assert.equal(jumelageGpsAirbnb([airbnb, soeur]).size, 0);
  });

  it("les autres sources reçoivent comme avant ce que publie une annonce Airbnb", () => {
    const airbnb = annonce({ id: "abnb-1", source: "Airbnb", capacity: 4, bedrooms: 1 });
    const bk = annonce({ id: "bk-1", source: "Booking", capacity: null, bedrooms: null });
    assert.deepEqual(recopierSoeurs([airbnb, bk]).get("bk-1"), {
      capacity: 4,
      capacitySource: "structured",
      bedrooms: 1,
      bedroomsSource: "structured",
      proven: `${bk.proven} · ${MARQUE_SOEUR}`,
    });
  });
});
