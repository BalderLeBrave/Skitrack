import { test } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "@/lib/listings";
import { cleCozy, clesTitre, ecartAvecPrincipale, regrouper, sourcesLbl, titreNormalise } from "./regroupement.ts";

/**
 * Les annonces ci-dessous reprennent la forme de celles du relevé d'Avoriaz du
 * 23 septembre 2026 (« Les Sermes M304 » : Airbnb 1 107 €, Abritel 1 121 €,
 * Booking 1 169 €, même point), réduites aux champs que le regroupement lit.
 */
function annonce(p: Partial<Listing> & Pick<Listing, "id" | "source">): Listing {
  return {
    stationId: "avoriaz",
    title: "Les Sermes M304",
    total: 0,
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

test("l'identifiant de logement Cozy, et seulement sur une annonce Cozy", () => {
  assert.equal(cleCozy({ id: "abr-1156975", proven: cozy("Abritel") }), "1156975");
  assert.equal(cleCozy({ id: "abnb-32854505", proven: "pyairbnb live" }), null);
  assert.equal(titreNormalise("Studio « Les Sermes » — M304 !"), "studio les sermes m304");
});

test("un logement vendu sur trois plateformes : un seul logement, le moins cher en tête", () => {
  const g = regrouper([
    annonce({ id: "abr-9", source: "Abritel", total: 1121, proven: cozy("Abritel") }),
    annonce({ id: "bk-9", source: "Booking", total: 1169, proven: cozy("Booking") }),
    annonce({ id: "abnb-555", source: "Airbnb", total: 1107 }),
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].principale.source, "Airbnb");
  assert.deepEqual(
    g[0].offres.map((o) => o.source),
    ["Airbnb", "Abritel", "Booking"],
  );
  assert.equal(sourcesLbl(g[0]), "Airbnb + 2");
  assert.equal(ecartAvecPrincipale(g[0].offres[2], g[0].principale), 62);
});

test("Cozy ne suffit pas quand la capacité dit deux biens différents", () => {
  const g = regrouper([
    annonce({ id: "bk-1156975", source: "Booking", title: "Résidence Joséphine", total: 1596, proven: cozy("Booking") }),
    annonce({
      id: "abr-1156975",
      source: "Abritel",
      title: "Résidence Joséphine",
      total: 76336,
      guests: 6,
      bedrooms: 3,
      proven: cozy("Abritel"),
    }),
  ]);
  assert.equal(g.length, 2);
});

test("même titre sur deux plateformes : regroupé tout près, pas à 400 m", () => {
  const pres = regrouper([
    annonce({ id: "abnb-1", source: "Airbnb", total: 1357 }),
    annonce({ id: "abr-2", source: "Abritel", total: 1360, lat: 46.17731, proven: cozy("Abritel") }),
  ]);
  assert.equal(pres.length, 1);
  const loin = regrouper([
    annonce({ id: "abnb-1", source: "Airbnb", total: 1357 }),
    annonce({ id: "abr-2", source: "Abritel", total: 1360, lat: 46.1809, proven: cozy("Abritel") }),
  ]);
  assert.equal(loin.length, 2);
});

test("un studio : 0 chambre chez Airbnb, 1 chez Abritel, c'est le même", () => {
  const g = regrouper([
    annonce({ id: "abnb-1", source: "Airbnb", title: "Studio central à Morzine, 4 pers", bedrooms: 0 }),
    annonce({ id: "abr-2", source: "Abritel", title: "Studio central à Morzine, 4 pers", bedrooms: 1, proven: cozy("Abritel") }),
  ]);
  assert.equal(g.length, 1);
});

test("un titre qu'une plateforme porte deux fois désigne un type, pas un bien", () => {
  const t = "Studio 2 Personnes Confort - La Pointe de Vorlaz";
  const g = regrouper([
    annonce({ id: "abnb-1", source: "Airbnb", title: t }),
    annonce({ id: "abr-2", source: "Abritel", title: t, proven: cozy("Abritel") }),
    annonce({ id: "abr-3", source: "Abritel", title: t, proven: cozy("Abritel") }),
  ]);
  assert.equal(g.length, 3);
});

test("jamais deux offres d'une même plateforme dans un logement", () => {
  // Cozy relie Abritel et Booking sous « 7 ». L'Airbnb direct rejoint
  // Abritel par le titre ; l'Airbnb de Cozy rejoindrait Booking par le sien,
  // mais le logement a déjà son Airbnb : la garde refuse cette union.
  const g = regrouper([
    annonce({ id: "abr-7", source: "Abritel", title: "Chalet Alpha Beta", proven: cozy("Abritel") }),
    annonce({ id: "bk-7", source: "Booking", title: "Chalet Gamma Delta", proven: cozy("Booking") }),
    annonce({ id: "abnb-1", source: "Airbnb", title: "Chalet Alpha Beta" }),
    annonce({ id: "abnb-8", source: "Airbnb", title: "Chalet Gamma Delta", proven: cozy("Airbnb") }),
  ]);
  assert.deepEqual(
    g.map((l) => l.offres.map((o) => o.id).sort().join("+")),
    ["abnb-1+abr-7+bk-7", "abnb-8"],
  );
  for (const l of g) assert.equal(new Set(l.offres.map((o) => o.source)).size, l.offres.length);
});

test("la référence que Booking ajoute au titre ne sépare pas un même logement", () => {
  assert.deepEqual(clesTitre("Studio au centre de Morzine - Fr-1-524-12"), [
    "studio au centre de morzine fr 1 524 12",
    "studio au centre de morzine",
  ]);
  const g = regrouper([
    annonce({ id: "abnb-1", source: "Airbnb", title: "Studio au centre de Morzine avec balcon", total: 1433 }),
    annonce({
      id: "bk-2",
      source: "Booking",
      title: "Studio Au Centre De Morzine Avec Balcon - Fr-1-524-12",
      total: 1364,
      proven: cozy("Booking"),
    }),
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].principale.source, "Booking");
});

test("deux références Booking d'un même titre : deux lots, jamais réunis", () => {
  const g = regrouper([
    annonce({ id: "bk-1", source: "Booking", title: "Studio Les Crêtes - Fr-1-111-11", proven: cozy("Booking") }),
    annonce({ id: "bk-2", source: "Booking", title: "Studio Les Crêtes - Fr-1-111-12", proven: cozy("Booking") }),
    annonce({ id: "abnb-3", source: "Airbnb", title: "Studio Les Crêtes" }),
  ]);
  assert.equal(g.length, 3);
});

test("un titre trop court ne prouve rien", () => {
  const g = regrouper([
    annonce({ id: "abnb-1", source: "Airbnb", title: "Studio" }),
    annonce({ id: "abr-2", source: "Abritel", title: "Studio", proven: cozy("Abritel") }),
  ]);
  assert.equal(g.length, 2);
});

test("un prix non publié ne passe jamais devant, ni ne donne d'écart", () => {
  const g = regrouper([
    annonce({ id: "abr-9", source: "Abritel", total: 0, proven: cozy("Abritel") }),
    annonce({ id: "bk-9", source: "Booking", total: 1300, proven: cozy("Booking") }),
  ]);
  assert.equal(g[0].principale.source, "Booking");
  assert.equal(ecartAvecPrincipale(g[0].offres[1], g[0].principale), null);
});

test("deux devises ne se soustraient pas", () => {
  const a = annonce({ id: "a", source: "Airbnb", total: 1000 });
  const b = annonce({ id: "b", source: "Booking", total: 1100, currency: "CHF" });
  assert.equal(ecartAvecPrincipale(b, a), null);
});

test("l'ordre d'entrée est gardé : un tri fait avant reste valable", () => {
  const g = regrouper([
    annonce({ id: "x", source: "Airbnb", title: "Chalet des Ardoisières", total: 900, lat: 46.2 }),
    annonce({ id: "abr-9", source: "Abritel", total: 1121, proven: cozy("Abritel") }),
    annonce({ id: "bk-9", source: "Booking", total: 1169, proven: cozy("Booking") }),
  ]);
  assert.deepEqual(
    g.map((l) => l.principale.id),
    ["x", "abr-9"],
  );
  assert.equal(sourcesLbl(g[0]), "Airbnb");
});
