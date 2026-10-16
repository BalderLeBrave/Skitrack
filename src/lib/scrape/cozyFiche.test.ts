import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ficheCozy, galerieCozy, hebergementCozy, refsCozy } from "./cozyFiche.ts";

const FX = JSON.parse(
  readFileSync(new URL("./fixtures/cozy-fiche-2alpes-2026-10-16.json", import.meta.url), "utf8"),
) as Record<"abritel" | "booking", { uid: string; getDetails: unknown; getPhotos: unknown; getReviews: unknown }>;

const LISTE = JSON.parse(
  readFileSync(new URL("./fixtures/cozy-getresultlist-laplagne-2026-10-26.json", import.meta.url), "utf8"),
) as { entries: unknown[] };

describe("refsCozy", () => {
  it("lit uid, searchId et nombre de photos de chaque entrée de la liste", () => {
    const refs = refsCozy([{ ...LISTE, searchId: "Sid123", fournisseur: "airbnb" }]);
    assert.ok(refs.length >= 9);
    const r = refs.find((x) => x.accommodationId === "45915695");
    assert.ok(r);
    assert.equal(r.uid, "45915695-684");
    assert.equal(r.searchId, "Sid123");
    assert.equal(typeof r.photos, "number");
  });

  it("une page sans searchId ne donne rien : la fiche ne se demanderait pas", () => {
    assert.deepEqual(refsCozy([LISTE]), []);
    assert.deepEqual(refsCozy([null, "x", { searchId: "s" }]), []);
  });
});

describe("hebergementCozy", () => {
  it("l'accommodationId des annonces que rend cozyListings, rien pour les autres", () => {
    const cozy = (id: string) => ({ id, proven: "CozyCozy Abritel live 2026-12-19→2026-12-26" });
    assert.equal(hebergementCozy(cozy("abr-100293015")), "100293015");
    assert.equal(hebergementCozy(cozy("bk-52576209")), "52576209");
    assert.equal(hebergementCozy(cozy("abnb-23718517")), "23718517");
    assert.equal(hebergementCozy(cozy("airbnb-38234308")), null);
    assert.equal(hebergementCozy(cozy("bk-slug-hotel")), null);
  });

  it("le relevé direct numérote aussi abnb- et bk- : sans provenance Cozy, rien", () => {
    assert.equal(hebergementCozy({ id: "abnb-23718517", proven: "Airbnb live 2026-12-19→2026-12-26" }), null);
    assert.equal(hebergementCozy({ id: "bk-4521", proven: "Booking direct" }), null);
    // Fusionnée avec le direct, l'annonce Cozy garde sa provenance.
    assert.equal(
      hebergementCozy({ id: "bk-52576209", proven: "CozyCozy Booking live · complété par le relevé direct" }),
      "52576209",
    );
  });
});

describe("ficheCozy, sur les réponses réelles des 2 Alpes", () => {
  it("Abritel : description, équipements, conditions, note sur 100, galerie entière", () => {
    const a = FX.abritel;
    const { fiche, photos } = ficheCozy({ details: a.getDetails, photos: a.getPhotos, avis: a.getReviews });
    assert.ok(fiche);
    assert.equal(fiche.sourceFiche, "cozy");
    assert.match(fiche.description ?? "", /^Situé à 300 mètres du domaine skiable/);
    const ids = fiche.equipements.map((e) => e.id);
    for (const id of ["ascenseur", "lave_vaisselle", "balcon", "television"]) assert.ok(ids.includes(id), id);
    assert.ok(fiche.equipements.every((e) => e.present));
    assert.deepEqual(fiche.conditions, { arrivee: "15:00", depart: "10:00", animaux: "non", fumeurs: "non", fetes: "oui" });
    assert.equal(fiche.avis?.noteSur5, 4.8);
    assert.equal(fiche.avis?.nombre, 82);
    assert.deepEqual(fiche.avis?.extraits, []);
    assert.equal(photos.length, 9);
    assert.match(photos[0], /impolicy=ccrop&w=1000/);
    // space.bathRoomCount
    assert.equal(ficheCozy({ details: a.getDetails }).baths, 1);
  });

  it("Booking : les avis en extraits, notés sur 5, datés, au prénom", () => {
    const b = FX.booking;
    const { fiche, photos } = ficheCozy(
      { details: b.getDetails, photos: b.getPhotos, avis: b.getReviews },
      { url: "https://www.booking.com/hotel/fr/base-camp-lodge-les-2-alpes.html" },
    );
    assert.ok(fiche?.avis);
    assert.equal(fiche.avis.noteSur5, 4.4);
    assert.equal(fiche.avis.nombre, 875);
    assert.equal(fiche.avis.extraits.length, 2);
    const [premier] = fiche.avis.extraits;
    assert.equal(premier.auteur, "JONATHAN");
    assert.equal(premier.date, "2026-08-19");
    assert.equal(premier.noteSur5, 4);
    assert.equal(
      premier.texte,
      "Bon accueil bel hôtel. Service de chambre à améliorer. Points forts : L’emplacement idéal et la modernité des installations. Points faibles : Les chambres sont faites trop tard.",
    );
    const ids = fiche.equipements.map((e) => e.id);
    for (const id of ["animaux", "wifi", "parking", "sauna", "spa"]) assert.ok(ids.includes(id), id);
    assert.equal(fiche.conditions?.animaux, "oui");
    assert.equal(photos.length, 4);
    assert.match(photos[0], /max1440/);
  });

  it("une recherche expirée chez Cozy (réponse vide) ne donne rien", () => {
    assert.deepEqual(ficheCozy({ details: {} }), { fiche: null, photos: [], baths: null });
    assert.deepEqual(ficheCozy({ details: null, photos: "x", avis: 3 }), { fiche: null, photos: [], baths: null });
  });
});

describe("galerieCozy", () => {
  it("les grands formats, à défaut les vignettes, sans doublon ni adresse non sûre", () => {
    assert.deepEqual(
      galerieCozy([
        { url: "https://a/1.jpg", thumbnailUrl: "https://a/1s.jpg" },
        { thumbnailUrl: "//a/2s.jpg" },
        { url: "https://a/1.jpg" },
        { url: "http://a/3.jpg" },
        null,
      ]),
      ["https://a/1.jpg", "https://a/2s.jpg"],
    );
  });
});
