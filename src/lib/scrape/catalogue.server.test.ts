import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { oublierFiles } from "./politesse.ts";
import { extraireCatalogue } from "./catalogue.server.ts";
import { normaliserFiche } from "./catalogue.ts";

describe("extraction d'une centrale sans connecteur", () => {
  it("reprend sans requête une fiche que le sitemap dit inchangée", async () => {
    const o = "https://reprise.test";
    const a = `${o}/hebergements/chalet-a/`;
    const b = `${o}/hebergements/chalet-b/`;
    const site: Record<string, string> = {
      [`${o}/robots.txt`]: "User-agent: *\nDisallow:",
      [`${o}/sitemap.xml`]: `<urlset><url><loc>${a}</loc><lastmod>2026-09-01</lastmod></url><url><loc>${b}</loc><lastmod>2026-10-05</lastmod></url></urlset>`,
      [b]: "<h1>Chalet B 8 personnes</h1>",
    };
    const demandes: string[] = [];
    const vrai = globalThis.fetch;
    globalThis.fetch = (async (u: string | URL | Request) => {
      const url = String(u instanceof Request ? u.url : u);
      demandes.push(url);
      const corps = site[url];
      return corps == null ? new Response("absent", { status: 404 }) : new Response(corps, { status: 200 });
    }) as typeof fetch;
    try {
      oublierFiles();
      const avant = [
        normaliserFiche({ titre: "Chalet A", capacite_personnes: 6 }, a, "lecture", "2026-10-01T00:00:00.000Z"),
        normaliserFiche({ titre: "Chalet B", capacite_personnes: 4 }, b, "lecture", "2026-10-01T00:00:00.000Z"),
      ];
      const r = await extraireCatalogue(
        { host: "reprise.test", nom: "Reprise", moteur: "aucun", stations: [] },
        { lecteur: "lecture", precedent: { fiches: avant, decor: { photos: [], finsTitre: [] } } },
      );
      assert.equal(r.reprises, 1);
      assert.ok(!demandes.includes(a), "la fiche inchangée n'est pas redemandée");
      assert.ok(demandes.includes(b), "la fiche modifiée après le relevé est relue");
      assert.deepEqual(
        r.fiches.map((f) => [f.url, f.capacite]),
        [
          [a, 6],
          [b, 8],
        ],
      );
    } finally {
      globalThis.fetch = vrai;
      oublierFiles();
    }
  });
});
