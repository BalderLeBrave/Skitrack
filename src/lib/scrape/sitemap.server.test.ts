import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { oublierFiles } from "./politesse.ts";
import { decouvrirParSitemap } from "./sitemap.server.ts";

function urlset(locs: Array<[string, string?]>): string {
  return `<urlset>${locs.map(([l, m]) => `<url><loc>${l}</loc>${m ? `<lastmod>${m}</lastmod>` : ""}</url>`).join("")}</urlset>`;
}

describe("découverte par sitemap", () => {
  it("n'ouvre pas les sitemaps génériques une fois les fiches trouvées, et garde lastmod", async () => {
    const o = "https://decor.test";
    const site: Record<string, string> = {
      [`${o}/robots.txt`]: `User-agent: *\nDisallow: /prive/\nSitemap: ${o}/sitemap.xml`,
      [`${o}/sitemap.xml`]: `<sitemapindex>${["hebergements-sitemap.xml", "post-sitemap.xml", "page-sitemap.xml", "type_hebergements-sitemap.xml", "restaurations-sitemap.xml"]
        .map((n) => `<sitemap><loc>${o}/${n}</loc></sitemap>`)
        .join("")}</sitemapindex>`,
      [`${o}/hebergements-sitemap.xml`]: urlset([
        [`${o}/hebergements/chalet-a/`, "2026-09-01"],
        [`${o}/hebergements/chalet-b/`],
        [`${o}/prive/hebergements/c/`],
        [`${o}/en/hebergements/chalet-a/`],
      ]),
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
      const d = await decouvrirParSitemap(o, "hebergement");
      assert.deepEqual(d.urls, [`${o}/hebergements/chalet-a/`, `${o}/hebergements/chalet-b/`]);
      assert.deepEqual(d.lastmod, { [`${o}/hebergements/chalet-a/`]: "2026-09-01" });
      assert.equal(d.interditsRobots, 1);
      assert.equal(d.sautes, 2, "post- et page- ne sont pas ouverts");
      assert.ok(!demandes.some((u) => /post-|page-|type_|restaurations-/.test(u)), demandes.join(", "));
    } finally {
      globalThis.fetch = vrai;
      oublierFiles();
    }
  });
});
