/**
 * Les pages établissement Booking (`bookingGps.server.ts`), hors ligne : la
 * page est la fixture du dépôt, servie par un onglet simulé ; robots.txt
 * passe par un `fetch` simulé. Se lance avec le résolveur de l'application
 * (`--import ./scripts/echantillon/enregistrer.mjs`).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import type { Listing } from "../listings.ts";
import { dejaGardee, garderLectures } from "../stay/contenuFiches.server.ts";
import { pageTentee } from "../stay/fichesBooking.server.ts";
import { cleListing } from "../stay/poserReleve.ts";
import { ficheDepuisPageBooking } from "./bookingFiche.ts";
import { fillBookingGps, lireFicheBooking } from "./bookingGps.server.ts";
import { porteFermee } from "./gardeHote.ts";
import { oublierFiles } from "./politesse.ts";

const dossier = (nom: string) => mkdtempSync(join(tmpdir(), `skitrack-${nom}-`));
// Les mémoires et le journal de taux du processus : jamais ceux de l'application.
process.env.SKITRACK_CONFIG_DIR = dossier("booking-gps");
process.env.SKITRACK_TAUX = join(dossier("taux"), "taux.json");

const HTML = readFileSync(new URL("./fixtures/booking-etablissement-reduit.html", import.meta.url), "utf8");

function annonce(n: number, extra: Partial<Listing> = {}): Listing {
  return {
    id: `bk-${n}`,
    stationId: "les-2-alpes",
    title: `Résidence ${n}`,
    source: "Booking",
    total: 900,
    currency: "EUR",
    capacity: 4,
    bedrooms: 2,
    available: true,
    photo: null,
    url: `https://www.booking.com/hotel/fr/residence-${n}.fr.html?checkin=2027-02-06&checkout=2027-02-13`,
    lat: 45.0122,
    lon: 6.1255,
    platformId: String(n),
    lodgingType: "appartement",
    proven: "CozyCozy Booking live",
    ...extra,
  };
}

/**
 * Un onglet qui répond `statut` et la fixture ; il note chaque adresse
 * ouverte. `sansCarte` : attendre la carte est une erreur.
 */
function onglet(statut: number, ouvertes: string[], sansCarte = false): Page {
  const p = {
    goto: async (url: string) => {
      ouvertes.push(url);
      return url === "about:blank" ? null : { status: () => statut };
    },
    content: async () => HTML,
    locator: () => {
      if (sansCarte) throw new Error("la carte ne s'attend pas pour la fiche seule");
      return { first: () => ({ getAttribute: async () => null }) };
    },
    setDefaultTimeout: () => undefined,
    close: async () => undefined,
    context: () => ({ newPage: async () => p }),
  };
  return p as unknown as Page;
}

/** Le robots.txt que Booking publierait ; toute autre adresse est une requête inattendue. */
function robots(texte: string | null): () => void {
  const vrai = globalThis.fetch;
  oublierFiles();
  globalThis.fetch = (async (u: string | URL | Request) => {
    const url = String(u instanceof Request ? u.url : u);
    if (!url.endsWith("/robots.txt")) throw new Error(`requête inattendue : ${url}`);
    return texte == null ? new Response("", { status: 500 }) : new Response(texte, { status: 200 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = vrai;
  };
}

describe("Booking : la page établissement lue pour sa fiche", () => {
  it("robots.txt permet la page : la fiche est lue, sans attendre la carte, puis l'onglet quitte la page", async () => {
    const remettre = robots("User-agent: *\nDisallow: /searchresults\n");
    try {
      const row = annonce(1);
      const url = "https://www.booking.com/hotel/fr/residence-1.fr.html";
      const ouvertes: string[] = [];
      const lu = await lireFicheBooking(onglet(200, ouvertes, true), row, url);
      assert.equal(lu.statut, 200);
      assert.deepEqual(
        lu.fiche?.equipements.slice(0, 2).map((e) => e.id),
        ["wifi", "parking"],
      );
      assert.deepEqual(ouvertes, [url, "about:blank"]);
    } finally {
      remettre();
    }
  });

  it("robots.txt ne permet pas la page, ou ne se lit pas : rien ne part", async () => {
    for (const [texte, regle] of [
      ["User-agent: *\nDisallow: /hotel/\n", "Disallow: /hotel/"],
      [null, "robots.txt illisible"],
    ] as const) {
      const remettre = robots(texte);
      try {
        const ouvertes: string[] = [];
        const lu = await lireFicheBooking(onglet(200, ouvertes), annonce(2), "https://www.booking.com/hotel/fr/residence-2.fr.html");
        assert.deepEqual(lu, { statut: null, interdit: regle });
        assert.deepEqual(ouvertes, []);
      } finally {
        remettre();
      }
    }
  });

  it("un défi (202) : fiche indisponible, et Booking n'est pas fermé pour autant ; un 429, si", async () => {
    const remettre = robots("User-agent: *\nAllow: /\n");
    try {
      const url = "https://www.booking.com/hotel/fr/residence-3.fr.html";
      const defi = await lireFicheBooking(onglet(202, []), annonce(3), url);
      assert.equal(defi.statut, 202);
      assert.equal(defi.fiche?.indisponible, true);
      assert.equal(porteFermee(url), null);
      const refus = await lireFicheBooking(onglet(429, []), annonce(4), url);
      assert.equal(refus.statut, 429);
      assert.notEqual(porteFermee(url), null, "un 429 pose la pause partagée");
      // Pendant la pause, rien ne part : le créneau est tenu, sans requête.
      const ouvertes: string[] = [];
      const tenue = await lireFicheBooking(onglet(200, ouvertes), annonce(5), url);
      assert.equal(tenue.statut, null);
      assert.match(tenue.attente ?? "", /pause après un refus/);
      assert.deepEqual(ouvertes, ["about:blank"]);
    } finally {
      remettre();
      process.env.SKITRACK_TAUX = join(dossier("taux"), "taux.json");
    }
  });
});

describe("Booking : le GPS du relevé garde les fiches de ses pages", () => {
  it("une fiche lue pendant le GPS se garde trente jours ; la page est tentée", async () => {
    const remettre = robots("User-agent: *\nAllow: /\n");
    try {
      const row = annonce(10, { lat: null, lon: null });
      const bilan = await fillBookingGps(onglet(200, []), [row]);
      assert.deepEqual(bilan, { remplies: 0 });
      assert.equal(row.fiche?.sourceFiche, "booking");
      assert.ok(dejaGardee(cleListing(row)));
      assert.ok(pageTentee("https://www.booking.com/hotel/fr/residence-10.fr.html"));
    } finally {
      remettre();
    }
  });

  it("une fiche gardée revient sans requête ; un défi ne la remplace pas, et l'arrêt remonte", async () => {
    const remettre = robots("User-agent: *\nAllow: /\n");
    try {
      const gardee = ficheDepuisPageBooking({ lodgingType: "appartement", url: null }, HTML, 200)!;
      garderLectures([{ cle: cleListing(annonce(11)), fiche: gardee }]);
      const avecPoint = annonce(11);
      assert.deepEqual(await fillBookingGps(onglet(202, []), [avecPoint]), { remplies: 0 });
      assert.equal(avecPoint.fiche?.description, gardee.description, "posée sans page ouverte");
      const sansPoint = annonce(11, { lat: null, lon: null });
      const bilan = await fillBookingGps(onglet(202, []), [sansPoint]);
      assert.deepEqual(bilan, { remplies: 0, arret: "defi" });
      assert.notEqual(sansPoint.fiche?.indisponible, true);
      assert.equal(sansPoint.fiche?.description, gardee.description);
    } finally {
      remettre();
    }
  });
});
