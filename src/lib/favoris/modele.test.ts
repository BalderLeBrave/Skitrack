import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../listings.ts";
import {
  contenu,
  couverture,
  creerDossier,
  dossiersDe,
  enregistrer,
  ETAT_VIDE,
  etatLu,
  nombreFavoris,
  nomDossier,
  rafraichir,
  renommerDossier,
  retirer,
  supprimerDossier,
} from "./modele.ts";
import { nomStationPropre, sourceEtLieu } from "../rattachement.ts";

const T1 = "2026-10-03T10:00:00.000Z";
const T2 = "2026-10-03T11:00:00.000Z";
const T3 = "2026-10-03T12:00:00.000Z";
const SEJOUR = { checkIn: "2027-02-06", checkOut: "2027-02-13", trav: 6 };

function annonce(id: string, p: Partial<Listing> = {}): Listing {
  return {
    id,
    stationId: "la-plagne",
    title: `Logement ${id}`,
    source: "Abritel",
    total: 1500,
    currency: "EUR",
    capacity: 6,
    bedrooms: 2,
    available: true,
    photo: `https://x/${id}.jpg`,
    url: null,
    lat: 45.5,
    lon: 6.67,
    proven: "relevé",
    ...p,
  };
}

const deuxDossiers = () => creerDossier(creerDossier(ETAT_VIDE, "a", " Courchevel   février ", T1), "b", "Plagne", T1);

describe("favoris : dossiers", () => {
  it("un nom propre et borné ; un nom vide ne crée rien", () => {
    const e = deuxDossiers();
    assert.deepEqual(e.dossiers.map((d) => d.nom), ["Courchevel février", "Plagne"]);
    assert.equal(creerDossier(e, "c", "   ", T1), e);
    assert.equal(nomDossier("x".repeat(80))?.length, 60);
  });

  it("renommer, et supprimer un dossier avec son contenu, pas les autres", () => {
    let e = deuxDossiers();
    e = enregistrer(e, annonce("1"), "a", SEJOUR, T2);
    e = enregistrer(e, annonce("1"), "b", SEJOUR, T2);
    e = renommerDossier(e, "b", "La Plagne");
    assert.equal(e.dossiers[1].nom, "La Plagne");
    e = supprimerDossier(e, "a");
    assert.deepEqual(e.dossiers.map((d) => d.id), ["b"]);
    assert.deepEqual(dossiersDe(e, "1").map((d) => d.id), ["b"]);
  });
});

describe("favoris : enregistrer et retirer", () => {
  it("une fois par dossier, l'annonce entière gardée avec son séjour, le dossier daté", () => {
    let e = deuxDossiers();
    e = enregistrer(e, annonce("1"), "a", SEJOUR, T2);
    e = enregistrer(e, annonce("1", { total: 1400 }), "a", null, T3);
    assert.equal(contenu(e, "a").length, 1);
    assert.equal(contenu(e, "a")[0].annonce.total, 1400);
    assert.deepEqual(contenu(e, "a")[0].sejour, SEJOUR);
    assert.equal(e.dossiers[0].majLe, T3);
    assert.equal(enregistrer(e, annonce("2"), "inconnu", null, T3), e);
  });

  it("le dernier enregistré d'abord ; un logement compté une fois", () => {
    let e = deuxDossiers();
    e = enregistrer(e, annonce("1"), "a", null, T1);
    e = enregistrer(e, annonce("2"), "a", null, T2);
    e = enregistrer(e, annonce("2"), "b", null, T2);
    assert.deepEqual(contenu(e, "a").map((f) => f.annonceId), ["2", "1"]);
    assert.equal(nombreFavoris(e), 2);
    assert.deepEqual(couverture(e, "a"), ["https://x/2.jpg", "https://x/1.jpg"]);
  });

  it("retirer d'un dossier, ou de tous", () => {
    let e = deuxDossiers();
    e = enregistrer(e, annonce("1"), "a", null, T1);
    e = enregistrer(e, annonce("1"), "b", null, T1);
    e = retirer(e, "1", "a", T2);
    assert.deepEqual(dossiersDe(e, "1").map((d) => d.id), ["b"]);
    e = retirer(e, "1", null, T3);
    assert.equal(nombreFavoris(e), 0);
    assert.equal(retirer(e, "1", null, T3), e);
  });

  it("la galerie n'est gardée qu'en partie", () => {
    const photos = Array.from({ length: 20 }, (_, i) => `https://x/${i}.jpg`);
    const e = enregistrer(deuxDossiers(), annonce("1", { photos }), "a", null, T1);
    assert.equal(contenu(e, "a")[0].annonce.photos?.length, 6);
  });
});

describe("favoris : la copie rafraîchie par un nouveau relevé", () => {
  it("le nouveau prix remplace l'ancien ; ce que la nouvelle tait garde l'ancienne valeur", () => {
    let e = enregistrer(deuxDossiers(), annonce("1", { total: 1500, priceLabel: "1 500 €" }), "a", null, T1);
    e = rafraichir(e, [annonce("1", { total: 1350, photo: null, capacity: null })]);
    const a = contenu(e, "a")[0].annonce;
    assert.deepEqual([a.total, a.photo, a.capacity], [1350, "https://x/1.jpg", 6]);
  });

  it("un prix nul ne remplace pas un prix relevé ; rien de neuf, le même état", () => {
    let e = enregistrer(deuxDossiers(), annonce("1", { total: 1500, priceLabel: "1 500 €" }), "a", null, T1);
    const avant = rafraichir(e, [annonce("1", { total: 0, priceLabel: null })]);
    assert.equal(contenu(avant, "a")[0].annonce.total, 1500);
    assert.equal(contenu(avant, "a")[0].annonce.priceLabel, "1 500 €");
    e = avant;
    assert.equal(rafraichir(e, [contenu(e, "a")[0].annonce]), e);
    assert.equal(rafraichir(e, [annonce("autre")]), e);
  });
});

describe("favoris : un prix relevé pour un autre séjour", () => {
  it("ne remplace pas celui du favori ; la photo, si", () => {
    let e = enregistrer(deuxDossiers(), annonce("1", { total: 1500, photo: null }), "a", SEJOUR, T1);
    e = rafraichir(e, [annonce("1", { total: 900, photo: "https://x/neuve.jpg" })], { ...SEJOUR, trav: 2 });
    assert.deepEqual([contenu(e, "a")[0].annonce.total, contenu(e, "a")[0].annonce.photo], [1500, "https://x/neuve.jpg"]);
    e = rafraichir(e, [annonce("1", { total: 1450 })], SEJOUR);
    assert.equal(contenu(e, "a")[0].annonce.total, 1450);
  });
});

describe("favoris : un état gardé illisible", () => {
  it("écarte les dossiers sans nom et les favoris orphelins", () => {
    const e = etatLu({
      dossiers: [{ id: "a", nom: "A", creeLe: T1, majLe: T1 }, { id: 3 }],
      favoris: [
        { annonceId: "1", dossierId: "a", ajouteLe: T1, annonce: annonce("1"), sejour: null },
        { annonceId: "2", dossierId: "zz", ajouteLe: T1, annonce: annonce("2"), sejour: null },
        { annonceId: "3", dossierId: "a" },
      ],
    });
    assert.deepEqual([e.dossiers.length, e.favoris.length], [1, 1]);
    assert.deepEqual(etatLu(null), ETAT_VIDE);
  });
});

describe("la station d'un favori", () => {
  // DP7 La Coulée Douce, Lanslevillard : relevée par la centrale de Haute
  // Maurienne en cherchant Aussois, l'étiquette disait « Centrale · Aussois ».
  it("est celle du logement, pas celle de la recherche", () => {
    const l = annonce("c1", { stationId: "aussois", source: "Centrale", lat: 45.291929, lon: 6.913571 });
    assert.equal(nomStationPropre(l), "Val-Cenis");
  });

  it("ne suppose pas la station cherchée quand rien ne situe le logement", () => {
    const l = annonce("c2", { stationId: "aussois", title: "Studio", lat: null, lon: null });
    assert.equal(nomStationPropre(l), null);
    assert.equal(sourceEtLieu(l), "Abritel");
  });

  it("nomme la localité d'un logement loin de toute station", () => {
    // Booking relevé en cherchant Châtel, à 12 km de tout repère, en Suisse.
    const l = annonce("c3", { stationId: "chatel", source: "Booking", lat: 46.360607, lon: 6.931287, locality: "Monthey" });
    assert.equal(sourceEtLieu(l), "Booking · Monthey");
  });
});
