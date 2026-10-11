import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { oublierFiles } from "./politesse.ts";
import { normaliserFiche, type FicheCatalogue } from "./catalogue.ts";
import { totauxDates } from "./catalogue.totaux.server.ts";

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

type Appel = { url: string; methode: string; corps: string };

function simuler(robots: string, reponses: (a: Appel) => Response): { appels: Appel[]; rendre: () => void } {
  const appels: Appel[] = [];
  const vrai = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL | Request, init?: RequestInit) => {
    const url = String(u instanceof Request ? u.url : u);
    if (url.endsWith("/robots.txt")) return new Response(robots, { status: 200 });
    const a = { url, methode: init?.method ?? "GET", corps: String(init?.body ?? "") };
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
});
