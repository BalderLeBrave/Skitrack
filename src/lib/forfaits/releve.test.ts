import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lireGrille } from "./lecteurGrille.ts";
import {
  fusionnerAvecPrecedent,
  grillePrecedente,
  grillesDepuisLecture,
  perimetresDeSource,
  releverGrilles,
  saisonDeLaPage,
  type Acces,
} from "./releve.ts";
import type { SourceTarifs } from "./sourcesTarifs.ts";
import type { GrilleTarifaire } from "./tarifsPeriode.ts";
import { lignesDepuisMarkdown } from "./texteStructure.ts";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "tarifs");
const S = "2026-27";
const stationsDe = (p: { catalogue?: string[]; stations?: string[] }) => [
  ...(p.catalogue ?? []),
  ...(p.stations ?? []),
];

const TIGNES: SourceTarifs = {
  id: "tignes",
  pages: [{ url: "https://www.tignes.net/ski/forfaits-ski", lecteur: "html" }],
  perimetres: [
    {
      type: "domaine",
      nom: "Tignes - Val d'Isère",
      motif: "val d'?isere",
      catalogue: ["tignes-val-d-isere"],
    },
    { type: "station", nom: "Tignes", motif: "tignes", stations: ["tignes"] },
  ],
};

const HTML_TIGNES = `<h2>Hiver 2026-2027</h2><p>Du 12 décembre 2026 au 23 avril 2027</p>
  <h3>Domaine Tignes – Val d'Isère</h3>
  <table><tr><th>Durée</th><th>Adulte 19 – 64 ans</th></tr>
  <tr><td>1 jour</td><td>78,00 €</td></tr><tr><td>6 jours</td><td>468,00 €</td></tr></table>`;

function acces(
  pages: Record<string, { status?: number; html?: string; pages?: string[]; blocage?: string }>,
  interdites: string[] = [],
): Acces {
  const r = (url: string) => pages[url] ?? { status: 404, html: "" };
  return {
    async robots(url) {
      return interdites.includes(url)
        ? { autorise: false, regle: "Disallow: /", delaiMs: 2000 }
        : { autorise: true, regle: "", delaiMs: 2000 };
    },
    async html(url) {
      const p = r(url);
      return { status: p.status ?? 200, html: p.html ?? "" };
    },
    async navigateur(url) {
      const p = r(url);
      return { status: p.status ?? 200, html: p.html ?? "", blocage: p.blocage ?? null };
    },
    async pdf(url) {
      const p = r(url);
      return { status: p.status ?? 200, pages: p.pages ?? [] };
    },
  };
}

describe("relevé : des tarifs lus aux grilles", () => {
  it("une grille par périmètre, périodes datées, confiance haute", () => {
    const lecture = lireGrille(lignesDepuisMarkdown(readFileSync(join(dir, "tignes.md"), "utf8")), {
      saison: S,
      perimetres: perimetresDeSource(TIGNES, stationsDe).map((p) => p.repere!),
    });
    const { grilles } = grillesDepuisLecture(lecture, {
      source: TIGNES,
      url: TIGNES.pages[0].url,
      saison: S,
      perimetres: perimetresDeSource(TIGNES, stationsDe),
      maintenant: "2026-09-30T20:00:00.000Z",
    });
    assert.deepEqual(
      grilles.map((g) => [
        g.id,
        g.confiance,
        g.stationIds.join(","),
        g.periodes.map((p) => p.libelle).join(" / "),
      ]),
      [
        [
          "officiel:tignes:tignes:2026-27",
          "haute",
          "tignes",
          "Opening et première semaine / Avant-première / Hiver 2026-2027 / Closing dernière semaine",
        ],
        [
          "officiel:tignes:tignes-val-d-isere:2026-27",
          "haute",
          "tignes-val-d-isere",
          "Avant-première / Hiver 2026-2027 / Closing dernière semaine",
        ],
      ],
    );
    const domaine = grilles[1];
    assert.equal(domaine.perimetre.type, "domaine");
    assert.equal(domaine.source.url, "https://www.tignes.net/ski/forfaits-ski");
    assert.equal(domaine.scrapeLe, "2026-09-30T20:00:00.000Z");
  });

  it("une page sans période : saison entière, confiance moyenne, saison de la page", () => {
    const source: SourceTarifs = {
      id: "npy",
      pages: [],
      perimetres: [{ type: "domaine", nom: "Grand Tourmalet" }],
    };
    const lecture = lireGrille(
      lignesDepuisMarkdown(readFileSync(join(dir, "npy-tourmalet.md"), "utf8")),
      { saison: S },
    );
    const { grilles } = grillesDepuisLecture(lecture, {
      source,
      url: "https://www.n-py.com/fr/grand-tourmalet/forfaits-ski",
      saison: S,
      perimetres: perimetresDeSource(source, stationsDe),
      maintenant: "2026-09-30",
    });
    assert.equal(grilles.length, 1);
    assert.equal(grilles[0].confiance, "moyenne");
    assert.equal(grilles[0].periodes[0].saisonEntiere, true);
    assert.equal(grilles[0].periodes[0].debut, "2026-08-01");
  });

  it("une période nommée sans date : ses tarifs sont écartés et c'est dit", () => {
    const source: SourceTarifs = {
      id: "x",
      pages: [],
      perimetres: [{ type: "station", nom: "X" }],
    };
    const lecture = lireGrille(
      ["| | HAUTE SAISON | BASSE SAISON |", "| | Adulte | Adulte |", "| 1 jour | 50 € | 40 € |"],
      { saison: S },
    );
    const { grilles, problemes } = grillesDepuisLecture(lecture, {
      source,
      url: "https://x.test",
      saison: S,
      perimetres: perimetresDeSource(source, stationsDe),
      maintenant: "2026-09-30",
    });
    assert.equal(grilles.length, 0);
    assert.ok(problemes.some((p) => p.includes("« HAUTE SAISON » sans dates")));
  });

  it("la saison d'une page non datée", () => {
    const l = (saisons: string[]) => ({ tarifs: [], problemes: [], saisons });
    assert.deepEqual(saisonDeLaPage(l(["2025-26", "2026-27"]), S), { saison: S, ecrite: true });
    assert.deepEqual(saisonDeLaPage(l(["2025-26"]), S), { saison: "2025-26", ecrite: true });
    assert.deepEqual(saisonDeLaPage(l([]), S), { saison: S, ecrite: false });
  });
});

describe("relevé : pages, refus et rapport", () => {
  it("robots.txt respecté, refus et défi anti-robot non contournés, image non lue", async () => {
    const source: SourceTarifs = {
      ...TIGNES,
      pages: [
        { url: "https://t.test/tarifs", lecteur: "html" },
        { url: "https://t.test/interdit", lecteur: "html" },
        { url: "https://t.test/refus", lecteur: "html" },
        { url: "https://t.test/boutique", lecteur: "navigateur" },
        { url: "https://t.test/grille.png", lecteur: "image" },
        { url: "https://t.test/vide", lecteur: "html" },
      ],
    };
    const { grilles, rapport } = await releverGrilles(
      [source],
      acces(
        {
          "https://t.test/tarifs": { html: HTML_TIGNES },
          "https://t.test/interdit": { html: HTML_TIGNES },
          "https://t.test/refus": { status: 403 },
          "https://t.test/boutique": {
            html: "<title>Just a moment...</title>",
            blocage: "défi anti-robot",
          },
          "https://t.test/vide": { html: "<p>Bienvenue</p>" },
        },
        ["https://t.test/interdit"],
      ),
      { saison: S, maintenant: "2026-09-30", stationsDe, precedentes: [] },
    );
    assert.equal(grilles.length, 1);
    assert.equal(rapport.pages, 6);
    assert.equal(rapport.pagesLues, 2);
    assert.deepEqual(Object.keys(rapport.echecs).sort(), [
      "grille-image",
      "refus",
      "robots",
      "sans-tarif",
    ]);
    assert.equal(rapport.echecs.refus?.length, 2);
    assert.equal(rapport.periodes, 1);
    assert.equal(rapport.stationsCouvertes, 1);
  });

  it("un même domaine publié par deux sources : la meilleure grille, les stations des deux", async () => {
    const a: SourceTarifs = {
      id: "a",
      pages: [{ url: "https://a.test", lecteur: "html" }],
      perimetres: [{ type: "domaine", nom: "Les 3 Vallées", catalogue: ["val-thorens"] }],
    };
    const b: SourceTarifs = {
      id: "b",
      pages: [{ url: "https://b.test", lecteur: "html" }],
      perimetres: [{ type: "domaine", nom: "Les Trois Vallées", catalogue: ["courchevel"] }],
    };
    const sansDate =
      "<table><tr><th>Durée</th><th>Adulte</th></tr><tr><td>1 jour</td><td>80 €</td></tr><tr><td>6 jours</td><td>400 €</td></tr></table>";
    const { grilles } = await releverGrilles(
      [a, b],
      acces({ "https://a.test": { html: sansDate }, "https://b.test": { html: HTML_TIGNES } }),
      {
        saison: S,
        maintenant: "2026-09-30",
        stationsDe,
        precedentes: [],
      },
    );
    assert.equal(grilles.length, 1);
    assert.equal(grilles[0].confiance, "haute");
    assert.equal(grilles[0].source.url, "https://b.test");
    assert.deepEqual(grilles[0].stationIds, ["courchevel", "val-thorens"]);
  });

  it("une grille rejetée par le contrôle est un échec consigné", async () => {
    const faux =
      "<table><tr><th>Durée</th><th>Adulte</th></tr><tr><td>1 jour</td><td>90 €</td></tr><tr><td>6 jours</td><td>60 €</td></tr></table>";
    const { grilles, rapport } = await releverGrilles(
      [{ ...TIGNES, pages: [{ url: "https://f.test", lecteur: "html" }] }],
      acces({ "https://f.test": { html: faux } }),
      {
        saison: S,
        maintenant: "2026-09-30",
        stationsDe,
        precedentes: [],
      },
    );
    assert.equal(grilles.length, 0);
    assert.equal(rapport.echecs.controle?.length, 1);
    assert.ok(rapport.rejets.length >= 1);
  });

  it("chaque grille retenue passe par le vérificateur ; ses écarts vont au rapport, la grille ne change pas", async () => {
    const vues: string[] = [];
    const { grilles, rapport } = await releverGrilles(
      [TIGNES],
      acces({ [TIGNES.pages[0].url]: { html: HTML_TIGNES } }),
      {
        saison: S,
        maintenant: "2026-09-30",
        stationsDe,
        precedentes: [],
        verifier: (g) => {
          vues.push(g.id);
          return [`${g.perimetre.nom} : écart de 40 % avec Skiinfo`];
        },
      },
    );
    assert.equal(grilles.length, 1);
    assert.deepEqual(vues, [grilles[0].id]);
    assert.deepEqual(rapport.verifications, ["Tignes - Val d'Isère : écart de 40 % avec Skiinfo"]);
    assert.equal(grilles[0].confiance, "haute");
  });
});

describe("relevé : ce qui est gardé", () => {
  const g = (cle: string, saison: string, id = `officiel:x:${cle}:${saison}`): GrilleTarifaire => ({
    id,
    saison,
    perimetre: { type: "domaine", cle, nom: cle },
    stationIds: ["s"],
    periodes: [],
    source: { origine: "officiel", url: null, libelle: "" },
    scrapeLe: null,
    confiance: "haute",
    notes: [],
  });

  it("un échec n'efface pas une grille déjà relevée", () => {
    const toutes = fusionnerAvecPrecedent(
      [g("domaine:a", S, "nouvelle")],
      [g("domaine:a", S, "ancienne"), g("domaine:b", S)],
    );
    assert.deepEqual(
      toutes.map((x) => x.id),
      ["nouvelle", "officiel:x:domaine:b:2026-27"],
    );
  });

  it("la grille précédente : même périmètre et saison, à défaut la plus récente", () => {
    const nouvelle = g("domaine:a", S);
    assert.equal(
      grillePrecedente(nouvelle, [
        g("domaine:a", "2025-26", "vieille"),
        g("domaine:a", S, "exacte"),
      ])?.id,
      "exacte",
    );
    assert.equal(
      grillePrecedente(nouvelle, [g("domaine:a", "2024-25", "v1"), g("domaine:a", "2025-26", "v2")])
        ?.id,
      "v2",
    );
    assert.equal(grillePrecedente(nouvelle, []), null);
  });
});
