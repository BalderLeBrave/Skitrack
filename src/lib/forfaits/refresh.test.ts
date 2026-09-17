/**
 * Le coût d'un relevé général, qui était la plainte : « Mettre à jour les
 * forfaits ne fonctionne pas ou est excessivement lent ».
 *
 * Mesuré avant correction, sur les cent soixante-neuf domaines français du
 * catalogue : quatorze secondes par domaine dès que la page tarifs n'est pas
 * au premier chemin — huit voies, deux secondes de politesse entre deux — et
 * les domaines enchaînés un par un, soit environ quarante minutes.
 *
 * Deux causes, deux vérifications ici : la marche des chemins ne continue pas
 * quand c'est l'hôte qui ne répond pas, et les domaines d'hôtes différents
 * avancent de front sans jamais faire se chevaucher deux appels au même site.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FORFAIT_CATALOG, refreshMany } from "./refresh.server.ts";
import { oublierFiles } from "../scrape/politesse.ts";

const PAGE = "<html><body>Forfait 6 jours adulte : 359 € — 1 jour : 68 €</body></html>";

function hote(site: string): string {
  return new URL(site.startsWith("http") ? site : `https://${site}`).host;
}

/** Des domaines du catalogue, un par hôte, pour ne pas se marcher dessus. */
function slugsDistincts(n: number, saut = 0): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const d of FORFAIT_CATALOG) {
    if (d.country !== "FR" || !d.website) continue;
    let h: string;
    try {
      h = hote(d.website);
    } catch {
      continue;
    }
    if (vus.has(h)) continue;
    vus.add(h);
    if (vus.size <= saut) continue;
    out.push(d.slug);
    if (out.length === n) break;
  }
  return out;
}

type Faux = { pages: string[]; robots: string[] };

/** Remplace `fetch` et rend le journal des appels. `reponse` décide du sort
 *  d'une page ; `null` fait échouer la requête comme un hôte injoignable. */
function fauxReseau(reponse: (url: string) => Response | null): Faux {
  const j: Faux = { pages: [], robots: [] };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/robots.txt")) {
      j.robots.push(url);
      return new Response("", { status: 404 });
    }
    j.pages.push(url);
    const r = reponse(url);
    if (!r) throw new Error("ECONNREFUSED");
    return r;
  }) as typeof fetch;
  return j;
}

describe("relevé d'un lot de domaines", () => {
  it("n'essaie pas huit chemins quand c'est l'hôte qui ne répond pas", async () => {
    oublierFiles();
    const slugs = slugsDistincts(3);
    const j = fauxReseau(() => null);
    const t0 = Date.now();
    const res = await refreshMany(slugs, true);
    const ms = Date.now() - t0;
    assert.equal(res.length, 3);
    // Une page par domaine, pas huit : les sept autres chemins sont du même
    // hôte, qui vient de dire qu'il ne répond pas.
    assert.equal(j.pages.length, 3, `${j.pages.length} pages appelées au lieu de 3`);
    // Sept voies inutiles coûtaient quatorze secondes de politesse chacune.
    assert.ok(ms < 2_000, `${ms} ms : l'hôte muet coûte encore une attente`);
    for (const r of res) assert.equal(r.issue, "echec");
  });

  it("rend les résultats dans l'ordre demandé, pas dans celui des arrivées", async () => {
    oublierFiles();
    const slugs = slugsDistincts(6, 3);
    // Le premier demandé est le plus lent : s'il arrive en tête, c'est bien
    // l'ordre d'appel qui est rendu, pas celui des réponses.
    const lent = hote(FORFAIT_CATALOG.find((d) => d.slug === slugs[0])!.website!);
    fauxReseau((url) => {
      if (new URL(url).host === lent) return null;
      return new Response(PAGE, { status: 200 });
    });
    const res = await refreshMany(slugs, true);
    assert.deepEqual(
      res.map((r) => r.row.slug),
      slugs,
    );
  });

  it("ne fait jamais se chevaucher deux appels au même hôte", async () => {
    oublierFiles();
    // Deux domaines qui partagent un hôte, s'il en existe dans le catalogue.
    const parHote = new Map<string, string[]>();
    for (const d of FORFAIT_CATALOG) {
      if (d.country !== "FR" || !d.website) continue;
      let h: string;
      try {
        h = hote(d.website);
      } catch {
        continue;
      }
      const f = parHote.get(h);
      if (f) f.push(d.slug);
      else parHote.set(h, [d.slug]);
    }
    const paire = [...parHote.values()].find((f) => f.length > 1);
    if (!paire) return; // rien à prouver si le catalogue n'a pas de doublon d'hôte

    let encours = 0;
    let chevauche = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      encours += 1;
      if (encours > 1) chevauche = true;
      await new Promise((r) => setTimeout(r, 20));
      encours -= 1;
      return new Response(PAGE, { status: 200 });
    }) as typeof fetch;

    const res = await refreshMany(paire.slice(0, 2), true);
    assert.equal(res.length, 2);
    assert.equal(chevauche, false, "deux appels simultanés vers le même hôte");
  });
});
