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
import { equipements, type EquipementPublie } from "./equipements.ts";
import { aEquipement, equipementsDe, ficheDepuisBrut } from "./ficheEnrichie.ts";
import { memoireFiches } from "./memoireFiches.server.ts";

const dossier = () => mkdtempSync(join(tmpdir(), "skitrack-contenu-"));
// Les mémoires du processus (`memoireFiches`, `contenuFiches`) : jamais celles de l'application.
process.env.SKITRACK_CONFIG_DIR = dossier();
const CONTENU = {
  description: "Entre 52 et 62m². Avec balcon.",
  photos: ["https://d1wek41qnoimq7.cloudfront.net/product/8493/910555/O/a.jpg"],
  amenities: equipements({ balcon: "oui" }),
};

/** Les pictos du détail Arkiane (Pralognan), tels que la centrale les publie : leur `alt`. */
const PICTOS_ARKIANE: EquipementPublie[] = [
  .../Equipements\s*:\s*<\/div>([\s\S]*?)<\/div>/
    .exec(
      readFileSync(
        new URL("../scrape/centrales/moteurs/fixtures/arkiane-pralognan-detail-colliouroe.html", import.meta.url),
        "utf8",
      ),
    )![1]
    .matchAll(/<img[^>]+class="picto[^"]*"[^>]+alt="([^"]+)"/g),
].map((m) => ({ libelle: m[1] }));
const PUBLIE = { ...CONTENU, equipementsPublies: PICTOS_ARKIANE };

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
  it("garde et relit les libellés publiés ; sans eux, l'entrée reste ce qu'elle était", () => {
    const f = join(dossier(), "fiches-contenu.json");
    assert.ok(PICTOS_ARKIANE.some((p) => p.libelle === "Télévision"));
    new ContenuFiches(f).noter([{ cle: "Centrale:colliouroe", contenu: PUBLIE }, { cle: "k", contenu: CONTENU }], 1000);
    assert.deepEqual(new ContenuFiches(f).lire("Centrale:colliouroe", 2000), PUBLIE);
    assert.equal("equipementsPublies" in new ContenuFiches(f).lire("k", 2000)!, false);
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
    assert.equal(contenuLu({ description: null, equipementsPublies: [{ libelle: " " }, null, "TV"] }), null);
  });
  it("des libellés publiés non vides, `present` booléen, `groupe` texte ; une liste seule se garde", () => {
    const c = contenuLu({
      equipementsPublies: [
        { libelle: " Télévision ", present: "oui", groupe: 3 },
        { libelle: "Animaux refusés", present: false, groupe: "Règles" },
        { libelle: 12 },
        { present: true },
      ],
    });
    assert.deepEqual(c, {
      description: null,
      photos: null,
      amenities: null,
      equipementsPublies: [{ libelle: "Télévision" }, { libelle: "Animaux refusés", present: false, groupe: "Règles" }],
    });
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
    // Rien de la mémoire (capacité 4, 1 chambre, point) : l'annonce reste
    // trouée, sa page s'ouvre encore (taxe de séjour d'une centrale). Seuls
    // les mots de la fiche posée se lisent : « Studio », 0 chambre.
    assert.deepEqual([row.capacity, row.lat, row.lon], [null, null, null]);
    assert.deepEqual([row.bedrooms, row.bedroomsSource], [0, "derived_from_type"]);
  });

  it("une description reposée dit ses chambres : l'annonce se requalifie (fiche Booking, descriptif Ingénie)", () => {
    // Booking range la description dans sa fiche : « Il comprend 2 chambres » se lit.
    garderLectures([{ cle: "Booking:b-40", fiche: { ...FICHE, description: "Cet appartement dispose d'un balcon. Il comprend 2 chambres et une cuisine équipée." } }]);
    const booking = annonce("Booking", "b-40");
    assert.equal(reposerGardees([booking]), 1);
    assert.deepEqual([booking.bedrooms, booking.bedroomsSource], [2, "text_regex"]);
    // Le descriptif Ingénie gardé (`contenuIngenie`) : « 3 chambres » remplace les chambres déduites des pièces.
    garderLectures([{ cle: "Centrale:ing-41", contenu: { description: "Maison indépendante. Rez-de-chaussée : séjour-cuisine, 3 chambres, 2 salles d'eau." } }]);
    const ingenie = annonce("Centrale", "ing-41", { platformId: "ing-41", rooms: 5, bedrooms: 4, bedroomsSource: "derived_from_type" });
    assert.equal(reposerGardees([ingenie]), 1);
    assert.deepEqual([ingenie.bedrooms, ingenie.bedroomsSource], [3, "text_regex"]);
    // Des chambres structurées restent les siennes.
    garderLectures([{ cle: "Centrale:ing-42", contenu: { description: "2 chambres." } }]);
    const structuree = annonce("Centrale", "ing-42", { platformId: "ing-42", bedrooms: 3, bedroomsSource: "structured" });
    reposerGardees([structuree]);
    assert.deepEqual([structuree.bedrooms, structuree.bedroomsSource], [3, "structured"]);
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

  it("les libellés publiés gardés se posent sans réseau, et arrivent à l'écran avec les douze clés", () => {
    garderLectures([{ cle: "Centrale:c-30", contenu: { amenities: equipements({ wifi: "oui" }), equipementsPublies: PICTOS_ARKIANE } }]);
    const row = annonce("Centrale", "c-30", { platformId: "c-30" });
    assert.equal(reposerGardees([row]), 1);
    assert.deepEqual(row.equipementsPublies, PICTOS_ARKIANE);
    assert.equal(aEquipement(row, "television"), true);
    assert.equal(equipementsDe(row)!.find((e) => e.id === "wifi")?.libelle, "Connexion WIFI");
    // Ceux que l'annonce porte déjà restent les siens.
    const sienne = annonce("Centrale", "c-30", { platformId: "c-30", equipementsPublies: [{ libelle: "Sauna" }] });
    reposerGardees([sienne]);
    assert.deepEqual(sienne.equipementsPublies, [{ libelle: "Sauna" }]);
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

  it("les libellés publiés comblent une annonce qui n'en porte aucun, sans toucher à ses douze clés", () => {
    const row: Parameters<typeof poserContenu>[0] = { amenities: equipements({ balcon: "oui" }), equipementsPublies: [] };
    assert.equal(poserContenu(row, { amenities: equipements({ wifi: "oui" }), equipementsPublies: PICTOS_ARKIANE }), true);
    assert.deepEqual(row.equipementsPublies, PICTOS_ARKIANE);
    assert.equal(row.amenities?.find((e) => e.cle === "wifi")?.valeur, "inconnu", "ses douze clés restent les siennes");
    assert.equal(poserContenu(row, { equipementsPublies: [{ libelle: "Sauna" }] }), false);
    assert.deepEqual(row.equipementsPublies, PICTOS_ARKIANE);
  });

  it("des équipements tout « inconnu » d'une fiche ne remplacent pas une liste ; ils comblent un vide", () => {
    const lue = { amenities: equipements({ wifi: "oui" }) };
    assert.equal(poserContenu(lue, { amenities: equipements({}) }), false);
    const vide: { amenities?: ReturnType<typeof equipements> } = {};
    assert.equal(poserContenu(vide, { amenities: equipements({}) }), true);
  });
});
