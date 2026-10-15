import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Listing } from "../listings.ts";
import {
  ContenuFiches,
  contenuFiches,
  contenuLu,
  dejaGardee,
  garderLectures,
  poserContenu,
  reposerGardees,
} from "./contenuFiches.server.ts";
import { equipements } from "./equipements.ts";
import { ficheDepuisBrut } from "./ficheEnrichie.ts";
import { memoireFiches } from "./memoireFiches.server.ts";

const dossier = () => mkdtempSync(join(tmpdir(), "skitrack-contenu-"));
// Les mémoires du processus (`memoireFiches`, `contenuFiches`) : jamais celles de l'application.
process.env.SKITRACK_CONFIG_DIR = dossier();
const CONTENU = {
  description: "Entre 52 et 62m². Avec balcon.",
  photos: ["https://d1wek41qnoimq7.cloudfront.net/product/8493/910555/O/a.jpg"],
  amenities: equipements({ balcon: "oui" }),
};

describe("ContenuFiches", () => {
  it("garde et relit le contenu d'une fiche", () => {
    const f = join(dossier(), "fiches-contenu.json");
    new ContenuFiches(f).noter([{ cle: "Travelski:910555", contenu: CONTENU }], 1000);
    const lu = new ContenuFiches(f).lire("Travelski:910555", 2000);
    assert.deepEqual(lu, CONTENU);
  });
  it("oublie au bout de la durée", () => {
    const f = join(dossier(), "fiches-contenu.json");
    const m = new ContenuFiches(f, 10_000);
    m.noter([{ cle: "k", contenu: CONTENU }], 1000);
    assert.equal(m.lire("k", 20_000), null);
  });
  it("une entrée vide n'efface rien, une clé absente ne s'écrit pas", () => {
    const f = join(dossier(), "fiches-contenu.json");
    const m = new ContenuFiches(f);
    m.noter([{ cle: "k", contenu: CONTENU }], 1000);
    m.noter([{ cle: "k", contenu: { description: null, photos: null, amenities: null } }, { cle: null, contenu: CONTENU }], 2000);
    assert.deepEqual(m.lire("k", 3000), CONTENU);
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(f, "utf8")).contenus), ["k"]);
  });
  it("un fichier illisible repart de rien", () => {
    const f = join(dossier(), "fiches-contenu.json");
    writeFileSync(f, "{pas du json");
    assert.equal(new ContenuFiches(f).lire("k"), null);
  });
});

describe("contenuLu", () => {
  it("ne garde que des adresses https et des équipements de la liste", () => {
    const c = contenuLu({
      description: "x",
      photos: ["http://non.jpg", "https://oui.jpg", 3],
      amenities: [{ cle: "inventee", libelle: "?", valeur: "oui" }, ...equipements({ wifi: "oui" })!],
    });
    assert.deepEqual(c?.photos, ["https://oui.jpg"]);
    assert.equal(c?.amenities?.length, 12);
  });
  it("rien de vide", () => {
    assert.equal(contenuLu({ description: " ", photos: [], amenities: [] }), null);
  });
});

/* ---------- Ce que les collecteurs en font ---------- */

const FICHE = ficheDepuisBrut(
  {
    description: "Studio au pied des pistes.",
    equipements: [{ libelle: "Wifi", present: true }],
    avis: { noteSource: 8.6, echelleSource: 10, nombre: 41, extraits: [] },
  },
  "booking",
)!;

function annonce(source: Listing["source"], id: string, over: Partial<Listing> = {}): Listing {
  return {
    id,
    stationId: "les-2-alpes",
    title: "Studio",
    source,
    total: 700,
    currency: "EUR",
    capacity: null,
    bedrooms: null,
    available: true,
    photo: "https://exemple.fr/tuile.jpg",
    url: `https://www.exemple.fr/${id}`,
    lat: null,
    lon: null,
    proven: "live",
    ...over,
  };
}

/** Compte les écritures d'une mémoire du processus. */
function compter(m: { noter: (...a: never[]) => unknown }): () => number {
  const noter = m.noter.bind(m) as (...a: never[]) => unknown;
  let n = 0;
  m.noter = (...a: never[]) => {
    n += 1;
    return noter(...a);
  };
  return () => n;
}

describe("garderLectures, reposerGardees, dejaGardee : l'API des collecteurs", () => {
  const ecrituresFiches = compter(memoireFiches());
  const ecrituresContenus = compter(contenuFiches());

  it("note fiches et contenus d'un lot en une écriture par mémoire ; rien d'illisible", () => {
    const avant = [ecrituresFiches(), ecrituresContenus()];
    const n = garderLectures([
      { cle: "Booking:b-1", fiche: FICHE, contenu: CONTENU },
      { cle: "Booking:b-2", contenu: { description: "Vue sur les pistes." } },
      { cle: "Booking:b-3", fiche: FICHE },
      // Sans clé, indisponible, d'une source inconnue, vide : rien.
      { cle: null, fiche: FICHE, contenu: CONTENU },
      { cle: "Booking:b-4", fiche: { ...FICHE, indisponible: true } },
      { cle: "Booking:b-5", fiche: { ...FICHE, sourceFiche: "inconnue" as never } },
      { cle: "Booking:b-6", contenu: { description: " ", photos: [], amenities: [] } },
    ]);
    assert.equal(n, 3);
    assert.deepEqual([ecrituresFiches() - avant[0], ecrituresContenus() - avant[1]], [1, 1]);
    assert.deepEqual(
      ["Booking:b-1", "Booking:b-2", "Booking:b-3", "Booking:b-4", "Booking:b-5", "Booking:b-6", null].map((c) => dejaGardee(c)),
      [true, true, true, false, false, false, false],
    );
  });

  it("hors Airbnb, la fiche et le contenu gardés se posent, jamais capacité, chambres ni point", () => {
    memoireFiches().noter([
      { cle: "Booking:b-10", capacity: 4, capacitySource: "structured", bedrooms: 1, bedroomsSource: "structured", lat: 45.0, lon: 6.1 },
    ]);
    garderLectures([{ cle: "Booking:b-10", fiche: FICHE, contenu: CONTENU }]);
    const row = annonce("Booking", "b-10");
    assert.equal(reposerGardees([row]), 1);
    assert.equal(row.fiche?.description, "Studio au pied des pistes.");
    assert.equal(row.fiche?.sourceFiche, "booking");
    assert.equal(row.description, CONTENU.description);
    assert.equal(row.amenities?.find((e) => e.cle === "balcon")?.valeur, "oui");
    assert.deepEqual(row.photos, ["https://exemple.fr/tuile.jpg", ...CONTENU.photos]);
    assert.equal(row.photo, "https://exemple.fr/tuile.jpg");
    // L'annonce reste trouée : sa page s'ouvre encore (taxe de séjour d'une centrale).
    assert.deepEqual([row.capacity, row.bedrooms, row.lat, row.lon], [null, null, null, null]);
  });

  it("ne remplace rien de ce que l'annonce publie ; une fiche indisponible ou des équipements muets, si", () => {
    garderLectures([{ cle: "Booking:b-20", fiche: FICHE, contenu: CONTENU }]);
    const sienne = { ...FICHE, description: "La sienne." };
    const lue = annonce("Booking", "b-20", {
      fiche: sienne,
      description: "Sa description.",
      amenities: equipements({ wifi: "oui" }),
      photos: ["https://exemple.fr/tuile.jpg", "https://exemple.fr/2.jpg"],
    });
    assert.equal(reposerGardees([lue]), 0);
    assert.deepEqual([lue.fiche, lue.description, lue.amenities?.find((e) => e.cle === "balcon")?.valeur], [sienne, "Sa description.", "inconnu"]);
    assert.deepEqual(lue.photos, ["https://exemple.fr/tuile.jpg", "https://exemple.fr/2.jpg"]);
    const muette = annonce("Booking", "b-20", { fiche: { ...FICHE, indisponible: true }, amenities: equipements({}) });
    reposerGardees([muette]);
    assert.equal(muette.fiche?.indisponible, undefined);
    assert.equal(muette.amenities?.find((e) => e.cle === "balcon")?.valeur, "oui");
  });

  it("Airbnb : le contenu seul ; sa fiche passe par poserMemoire", () => {
    memoireFiches().noter([{ cle: "Airbnb:5550123", capacity: 4, capacitySource: "structured", lue: true, fiche: FICHE }]);
    garderLectures([{ cle: "Airbnb:5550123", contenu: { description: "Contenu gardé." } }]);
    const row = annonce("Airbnb", "abnb-5550123", { url: "https://www.airbnb.fr/rooms/5550123" });
    reposerGardees([row]);
    assert.deepEqual([row.fiche ?? null, row.description, row.capacity], [null, "Contenu gardé.", null]);
  });
});

describe("poserContenu", () => {
  it("la galerie seulement à une annonce qui n'a que sa photo principale", () => {
    const seule = { photo: "https://a.jpg", photos: ["https://a.jpg"] };
    assert.equal(poserContenu(seule, { photos: ["https://a.jpg", "https://b.jpg"] }), true);
    assert.deepEqual([seule.photo, seule.photos], ["https://a.jpg", ["https://a.jpg", "https://b.jpg"]]);
    const sans = { photo: null, photos: null };
    poserContenu(sans, { photos: ["https://b.jpg"] });
    assert.deepEqual([sans.photo, sans.photos], ["https://b.jpg", ["https://b.jpg"]]);
    const galerie = { photo: "https://a.jpg", photos: ["https://a.jpg", "https://c.jpg"] };
    assert.equal(poserContenu(galerie, { photos: ["https://b.jpg"] }), false);
    assert.deepEqual(galerie.photos, ["https://a.jpg", "https://c.jpg"]);
  });

  it("des équipements tout « inconnu » d'une fiche ne remplacent pas une liste ; ils comblent un vide", () => {
    const lue = { amenities: equipements({ wifi: "oui" }) };
    assert.equal(poserContenu(lue, { amenities: equipements({}) }), false);
    const vide: { amenities?: ReturnType<typeof equipements> } = {};
    assert.equal(poserContenu(vide, { amenities: equipements({}) }), true);
  });
});
