/**
 * Les fiches Booking lues en tâche de fond (`fichesBooking.server.ts`), hors
 * ligne : la page établissement est la fixture du dépôt
 * (`scrape/fixtures/booking-etablissement-reduit.html`), lue par le lecteur du
 * relevé (`ficheDepuisPageBooking`) ; le navigateur, la minuterie et l'heure
 * sont simulés. Les mémoires sont celles d'un dossier temporaire.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Listing } from "../listings.ts";
import { ficheDepuisPageBooking } from "../scrape/bookingFiche.ts";
import { dejaGardee, reposerGardees } from "./contenuFiches.server.ts";
import { aEquipement, equipementsDe } from "./ficheEnrichie.ts";
import {
  ECHECS_DE_SUITE_MAX,
  FICHES_MAX,
  PAUSE_FICHE_MS,
  VIDES_DE_SUITE_MAX,
  fichesALire,
  lireFichesBookingLentes,
  noterPageTentee,
  oublierPagesTentees,
  pageTentee,
  type PageBooking,
  type PorteFichesBooking,
} from "./fichesBooking.server.ts";
import { memoireFiches } from "./memoireFiches.server.ts";
import { cleListing } from "./poserReleve.ts";
import { aRelire, ficheBookingAPoser } from "./relecture.ts";

// Les mémoires du processus (`memoireFiches`, `contenuFiches`) : jamais celles de l'application.
process.env.SKITRACK_CONFIG_DIR = mkdtempSync(join(tmpdir(), "skitrack-fiches-booking-"));

const HTML = readFileSync(
  new URL("../scrape/fixtures/booking-etablissement-reduit.html", import.meta.url),
  "utf8",
);

/** Une annonce Booking telle que Cozy la rend : le point publié, aucune fiche. */
function annonce(n: number, extra: Partial<Listing> = {}): Listing {
  return {
    id: `bk-${n}`,
    stationId: "les-2-alpes",
    title: `Résidence ${n}`,
    source: "Booking",
    total: 900 + n,
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
    proven: `CozyCozy Booking live 2027-02-06→2027-02-13`,
    ...extra,
  };
}

/** La page établissement, comme `hotelPageUrl` la tire de l'annonce : sans requête. */
const page = (l: Listing): string | null => (l.url ? l.url.replace(/\?.*$/, "") : null);

type Essai = {
  porte: PorteFichesBooking;
  ouvertes: string[];
  pauses: number[];
};

/**
 * Un relevé simulé : `statut(url, i)` dit ce que Booking répond à la i-ème
 * page ouverte ; une page en 200 rend la fixture, lue par le lecteur du relevé.
 */
function essai(
  statut: (url: string, i: number) => number | null | PageBooking = () => 200,
  opts: { stop?: () => boolean; fermee?: () => string | null; html?: string } = {},
): Essai {
  const ouvertes: string[] = [];
  const pauses: number[] = [];
  let t = Date.parse("2026-10-15T12:00:00Z");
  return {
    ouvertes,
    pauses,
    porte: {
      page,
      lire: async (row, url) => {
        const s = statut(url, ouvertes.length);
        if (s != null && typeof s === "object") {
          if (!s.interdit && !s.attente) ouvertes.push(url);
          return s;
        }
        ouvertes.push(url);
        const fiche = ficheDepuisPageBooking(row, s === 200 ? (opts.html ?? HTML) : null, s);
        return { statut: s, ...(fiche ? { fiche } : {}) };
      },
      stop: opts.stop ?? (() => false),
      fermee: opts.fermee ?? (() => null),
      dormir: async (ms) => {
        pauses.push(ms);
        t += ms;
      },
      maintenant: () => t,
    },
  };
}

describe("Booking : les fiches lues en tâche de fond", () => {
  it("le point déjà publié par Cozy n'empêche plus la fiche : une page à la fois, gardée, puis reposée sans réseau", async () => {
    oublierPagesTentees();
    const rows = [annonce(101), annonce(102), annonce(103)];
    assert.ok(rows.every((l) => equipementsDe(l) == null && !aEquipement(l, "wifi")));
    assert.ok(rows.every((l) => ficheBookingAPoser(l) && aRelire(l)));
    const e = essai();
    assert.equal(await lireFichesBookingLentes(rows, e.porte), "ok");
    assert.deepEqual(e.ouvertes, rows.map(page));
    // Une page à la fois, la pause entre deux, pas avant la première.
    assert.deepEqual(e.pauses, [PAUSE_FICHE_MS, PAUSE_FICHE_MS]);
    assert.ok(rows.every((l) => dejaGardee(cleListing(l))));
    // La recherche suivante : les annonces reviennent sans fiche, la mémoire
    // la pose, sans aucune page ouverte.
    const suivante = [annonce(101), annonce(102), annonce(103)];
    assert.equal(reposerGardees(suivante), 3);
    for (const l of suivante) {
      assert.equal(l.fiche?.sourceFiche, "booking");
      assert.ok(aEquipement(l, "wifi") && aEquipement(l, "parking") && aEquipement(l, "casier_skis"));
      assert.equal(ficheBookingAPoser(l), false);
    }
    const encore = essai();
    assert.equal(await lireFichesBookingLentes(suivante, encore.porte), "ok");
    assert.deepEqual(encore.ouvertes, [], "une page gardée ne se relit pas");
  });

  it("au premier défi (202), arrêt sans nouvel essai ; la page tentée ne repart pas", async () => {
    oublierPagesTentees();
    const rows = [annonce(201), annonce(202), annonce(203), annonce(204)];
    const e = essai((_, i) => (i === 1 ? 202 : 200));
    assert.equal(await lireFichesBookingLentes(rows, e.porte), "defi");
    assert.deepEqual(e.ouvertes, [page(rows[0]), page(rows[1])]);
    assert.equal(dejaGardee(cleListing(rows[1])), false, "un défi ne se garde pas");
    assert.ok(pageTentee(page(rows[1])));
    // La reprise ne relit ni la page gardée ni la page du défi.
    const reprise = essai();
    assert.equal(await lireFichesBookingLentes(rows, reprise.porte), "ok");
    assert.deepEqual(reprise.ouvertes, [page(rows[2]), page(rows[3])]);
  });

  it("403, 429, 503 : refus, arrêt à la première ; une pause de refus en cours : rien ne part", async () => {
    for (const s of [403, 429, 503]) {
      oublierPagesTentees();
      const rows = [annonce(3_000 + s), annonce(3_100 + s)];
      const e = essai(() => s);
      assert.equal(await lireFichesBookingLentes(rows, e.porte), "refus");
      assert.deepEqual(e.ouvertes, [page(rows[0])]);
    }
    oublierPagesTentees();
    const fermee = essai(() => 200, { fermee: () => "pause après un refus (encore 40 s)" });
    assert.equal(await lireFichesBookingLentes([annonce(320)], fermee.porte), "refus");
    assert.deepEqual(fermee.ouvertes, []);
  });

  it("robots.txt ne permet pas la page : rien ne part, rien ne se note", async () => {
    oublierPagesTentees();
    const rows = [annonce(401), annonce(402)];
    const e = essai(() => ({ statut: null, interdit: "Disallow: /hotel/" }));
    assert.equal(await lireFichesBookingLentes(rows, e.porte), "robots");
    assert.deepEqual(e.ouvertes, []);
    assert.equal(pageTentee(page(rows[0])), false);
    assert.equal(memoireFiches().lire(cleListing(rows[0])), null);
  });

  it("une recherche plus récente : on cède, sans ouvrir la page suivante", async () => {
    oublierPagesTentees();
    let nouvelle = false;
    const rows = [annonce(501), annonce(502), annonce(503)];
    const e = essai(
      (_, i) => {
        if (i === 0) nouvelle = true;
        return 200;
      },
      { stop: () => nouvelle },
    );
    assert.equal(await lireFichesBookingLentes(rows, e.porte), "laisse");
    assert.deepEqual(e.ouvertes, [page(rows[0])]);
    assert.ok(dejaGardee(cleListing(rows[0])), "la page lue avant de céder reste gardée");
  });

  it("le limiteur local tient le créneau : on attend, sans requête, puis la page part", async () => {
    oublierPagesTentees();
    let refusLocal = 1;
    const e = essai(() => (refusLocal-- > 0 ? { statut: null, attente: "limiteur local (3 s)" } : 200));
    assert.equal(await lireFichesBookingLentes([annonce(601)], e.porte), "ok");
    assert.equal(e.ouvertes.length, 1);
    assert.deepEqual(e.pauses, [8_000]);
  });

  it(`${ECHECS_DE_SUITE_MAX} pages de suite sans réponse : arrêt ; elles ne repartent pas dans le processus`, async () => {
    oublierPagesTentees();
    const rows = Array.from({ length: 5 }, (_, i) => annonce(650 + i));
    const e = essai(() => null);
    assert.equal(await lireFichesBookingLentes(rows, e.porte), "ok");
    assert.equal(e.ouvertes.length, ECHECS_DE_SUITE_MAX);
    assert.deepEqual(e.pauses, [PAUSE_FICHE_MS, PAUSE_FICHE_MS]);
    assert.deepEqual(
      fichesALire(rows, page).map((c) => c.row.id),
      ["bk-653", "bk-654"],
    );
  });

  it(`${VIDES_DE_SUITE_MAX} pages de suite sans fiche : arrêt, et elles ne se notent pas lues`, async () => {
    oublierPagesTentees();
    const rows = Array.from({ length: 6 }, (_, i) => annonce(700 + i));
    const e = essai(() => 200, { html: "<html><body>JavaScript is disabled</body></html>" });
    assert.equal(await lireFichesBookingLentes(rows, e.porte), "ok");
    assert.equal(e.ouvertes.length, VIDES_DE_SUITE_MAX);
    assert.ok(rows.every((l) => memoireFiches().lire(cleListing(l))?.lue !== true));
  });

  it("une page sans fiche suivie d'une fiche lisible : notée lue, elle ne se redemande plus", async () => {
    oublierPagesTentees();
    const vide = annonce(801);
    const pleine = annonce(802);
    const e = essai((url) => (url === page(vide) ? { statut: 200 } : 200));
    assert.equal(await lireFichesBookingLentes([vide, pleine], e.porte), "ok");
    assert.equal(memoireFiches().lire(cleListing(vide))?.lue, true);
    oublierPagesTentees();
    assert.deepEqual(fichesALire([vide, pleine], page), []);
  });

  it("ce qui se lit : logement entier sans fiche lue, une page une fois, jamais une page tentée, au plus FICHES_MAX", () => {
    oublierPagesTentees();
    const lue = ficheDepuisPageBooking({ lodgingType: "appartement", url: null }, HTML, 200)!;
    const defi = ficheDepuisPageBooking({ lodgingType: "appartement", url: null }, null, 202)!;
    const rows = [
      annonce(901, { lodgingType: "hotel" }),
      annonce(902, { lodgingType: "chambre" }),
      annonce(903, { fiche: lue }),
      annonce(904, { fiche: defi }),
      annonce(905),
      annonce(906, { url: annonce(905).url }),
      annonce(907, { url: null }),
      annonce(908, { url: "https://www.booking.com/searchresults.fr.html?ss=Les%20Deux%20Alpes" }),
      annonce(909, { source: "Abritel", url: "https://www.abritel.fr/location-vacances/p909" }),
      annonce(910),
    ];
    const pageHotel = (l: Listing) => (l.url && /\/hotel\/[a-z]{2}\//.test(l.url) ? page(l) : null);
    noterPageTentee(page(rows[9]));
    assert.deepEqual(
      fichesALire(rows, pageHotel).map((c) => c.row.id),
      ["bk-904", "bk-905"],
    );
    assert.deepEqual(
      rows.map(ficheBookingAPoser),
      [false, false, false, true, true, true, false, false, false, true],
    );
    const beaucoup = Array.from({ length: FICHES_MAX + 50 }, (_, i) => annonce(10_000 + i));
    assert.equal(fichesALire(beaucoup, page).length, FICHES_MAX);
  });
});
