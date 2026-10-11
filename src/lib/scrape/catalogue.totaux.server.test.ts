import { after, describe, it } from "node:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { oublierFiles } from "./politesse.ts";
import { normaliserFiche, type FicheCatalogue } from "./catalogue.ts";
import { totauxDates } from "./catalogue.totaux.server.ts";

// Un refus simulé pose une pause dans le journal de cadence partagé
// (`stay/taux.server.ts`) : il ne doit pas fermer ITEA pour la machine.
process.env.SKITRACK_TAUX = join(tmpdir(), `skitrack-taux-test-${process.pid}.json`);
after(() => rmSync(process.env.SKITRACK_TAUX!, { force: true }));

const QUAND = "2026-10-11T00:00:00.000Z";
const SEJOUR = { arrivee: "2027-02-13", depart: "2027-02-20", personnes: 4 };

function gite(code: string, capacite = 6): FicheCatalogue {
  return normaliserFiche(
    { titre: `Gîte ${code}`, capacite_personnes: capacite, reservation: { moteur: "", url: `https://widget-fngf.itea.fr/fiche-${code}.html` } },
    `https://www.sancy.com/fr/fiche/hebergement-locatif/${code}/`,
    "lecture",
    QUAND,
  );
}

type Appel = { url: string; methode: string; corps: string; cookie: string };

function simuler(robots: string, reponses: (a: Appel) => Response): { appels: Appel[]; rendre: () => void } {
  const appels: Appel[] = [];
  const vrai = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL | Request, init?: RequestInit) => {
    const url = String(u instanceof Request ? u.url : u);
    if (url.endsWith("/robots.txt")) return new Response(robots, { status: 200 });
    const h = (init?.headers ?? {}) as Record<string, string>;
    const a = { url, methode: init?.method ?? "GET", corps: String(init?.body ?? ""), cookie: h.cookie ?? "" };
    appels.push(a);
    return reponses(a);
  }) as typeof fetch;
  oublierFiles();
  return {
    appels,
    rendre: () => {
      globalThis.fetch = vrai;
      oublierFiles();
    },
  };
}

const WIDGET = `<div data-ident="63G1234.G" data-instance="FNGF" data-exercice="2026"></div>`;
const TABLEAU = `<span class="sp_montantLocation">1 180,00 €</span><span class="sp_montantTaxeSejour">30,80 €</span>
  <span class="sp_montantPrixTotal" data-prix="1210.80">1 210,80 €</span>`;

describe("totaux datés des fiches du catalogue", () => {
  it("pose le total du devis Gîtes de France, dates et provenance comprises", async () => {
    const s = simuler("User-agent: *\nDisallow:", (a) => {
      if (a.methode === "GET") return new Response(WIDGET, { status: 200 });
      if (/getExerciceByDateFin/.test(a.corps)) return new Response('{"exercice":"2027"}', { status: 200 });
      return new Response(TABLEAU, { status: 200 });
    });
    try {
      const fiches = [gite("63G1234", 2), normaliserFiche({ titre: "Sans lien", capacite_personnes: 4 }, "https://x.fr/a", "lecture", QUAND)];
      const b = await totauxDates(fiches, SEJOUR);
      assert.equal(b.eligibles, 1);
      assert.equal(b.obtenus, 1);
      assert.deepEqual(fiches[0].totalSejour, {
        montant: 1210.8,
        arrivee: "2027-02-13",
        depart: "2027-02-20",
        nuits: 7,
        source: "Gîtes de France (ITEA), loyer et taxe de séjour, 2 pers.",
      });
      assert.equal(fiches[1].totalSejour, null);
      const tab = s.appels.find((a) => /getHTMLTabPrixFormulesSejour/.test(a.corps));
      assert.ok(tab, "la grille des dates est demandée");
      assert.match(tab.corps, /nbAdultes=2/, "un gîte de deux ne se devise pas pour quatre");
      assert.match(tab.corps, /exercice=2027/);
      // Relancé pour les mêmes dates : repris, sans requête.
      const avant = s.appels.length;
      const b2 = await totauxDates(fiches, SEJOUR);
      assert.equal(b2.repris, 1);
      assert.equal(s.appels.length, avant);
    } finally {
      s.rendre();
    }
  });

  it("respecte robots.txt : un Disallow sur le devis arrête la fiche, sans requête", async () => {
    const s = simuler("User-agent: *\nDisallow: /lib_2/", () => new Response(WIDGET, { status: 200 }));
    try {
      const fiches = [gite("63G2000")];
      const b = await totauxDates(fiches, SEJOUR);
      assert.equal(b.interditsRobots, 1);
      assert.equal(b.obtenus, 0);
      assert.ok(!s.appels.some((a) => a.methode === "POST"), "aucun POST vers un chemin interdit");
      assert.equal(fiches[0].totalSejour, null);
    } finally {
      s.rendre();
    }
  });

  it("un refus arrête les devis suivants ; un devis sans total n'invente rien", async () => {
    const s = simuler("User-agent: *\nDisallow:", () => new Response("", { status: 429 }));
    try {
      const fiches = [gite("63G3001"), gite("63G3002")];
      const b = await totauxDates(fiches, SEJOUR);
      assert.equal(b.refus, 429);
      assert.equal(b.demandes, 1, "le second devis n'est pas demandé");
      assert.equal(s.appels.length, 1);
      assert.ok(fiches.every((f) => f.totalSejour == null));
    } finally {
      s.rendre();
    }
  });

  it("Ingénie : une session par centrale, puis le total du panier de chaque logement", async () => {
    const o = "https://reservation.lescontamines.com";
    const s = simuler("User-agent: *\nDisallow: /admin/", (a) => {
      const u = new URL(a.url);
      const action = u.searchParams.get("action");
      if (action === "result") {
        return new Response(`<html>${"x".repeat(500)}</html>`, { status: 200, headers: { "set-cookie": "PHPSESSID=abc; Path=/" } });
      }
      if (action === "detailTarifsPrestationAjax") {
        return new Response(`<form><input type="hidden" name="prestation" value="${u.searchParams.get("prestation")}"><input type="hidden" name="dateDebut" value="13/02/2027">${" ".repeat(200)}</form>`, { status: 200 });
      }
      if (action === "calculerTotalPrestationAjax") return new Response('{"success":1,"data":{"total":1450.5}}', { status: 200 });
      return new Response("", { status: 404 });
    });
    try {
      const fiche = (p: string) =>
        normaliserFiche(
          { titre: p, capacite_personnes: 6, reservation: { moteur: "", url: `${o}/fiche/PRESTATION-G-${p}?cid=7` } },
          `https://x.fr/h/${p}/`,
          "lecture",
          QUAND,
        );
      const fiches = [fiche("101-1"), fiche("102-1")].map((f) => ({ ...f, reservation: { ...f.reservation!, moteur: "Ingénie" } }));
      const b = await totauxDates(fiches, SEJOUR);
      assert.equal(b.obtenus, 2);
      assert.deepEqual(fiches[0].totalSejour, {
        montant: 1450.5,
        arrivee: "2027-02-13",
        depart: "2027-02-20",
        nuits: 7,
        source: "Ingénie, total du panier, 4 pers.",
      });
      assert.equal(s.appels.filter((a) => /action=result/.test(a.url)).length, 1, "une seule recherche datée pour la centrale");
      const paniers = s.appels.filter((a) => /calculerTotalPrestationAjax/.test(a.url));
      assert.equal(paniers.length, 2);
      assert.ok(paniers.every((a) => /PHPSESSID=abc/.test(a.cookie)), "la session suit jusqu'au panier");
      assert.match(paniers[0].url, /prestation=G-101-1/);
    } finally {
      s.rendre();
    }
  });

  it("Ingénie : un Disallow sur la recherche datée arrête la fiche", async () => {
    const s = simuler("User-agent: *\nDisallow: /booking", () => new Response("", { status: 200 }));
    try {
      const f = normaliserFiche(
        { titre: "A", reservation: { moteur: "", url: "https://reservation.lescontamines.com/fiche/PRESTATION-G-1-1?cid=7" } },
        "https://x.fr/h/a/",
        "lecture",
        QUAND,
      );
      const fiches = [{ ...f, reservation: { ...f.reservation!, moteur: "Ingénie" } }];
      const b = await totauxDates(fiches, SEJOUR);
      assert.equal(b.interditsRobots, 1);
      assert.equal(s.appels.length, 0, "aucune requête vers /booking");
      assert.equal(fiches[0].totalSejour, null);
    } finally {
      s.rendre();
    }
  });
});
