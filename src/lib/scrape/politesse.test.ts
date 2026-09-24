import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { crawlDelayMs, demander, INTERVALLE_MS, oublierFiles, UA_AGENT, UA_RELEVE } from "./politesse.ts";
import { UA_NAVIGATEUR } from "./navigateur.ts";

describe("politesse du relevé tarifaire", () => {
  it("l'en-tête est celui d'un navigateur, et le nom d'agent n'y figure pas", () => {
    assert.equal(UA_RELEVE, UA_NAVIGATEUR);
    assert.match(UA_RELEVE, /^Mozilla\/5\.0 .*Chrome\/\d+/);
    assert.ok(!UA_RELEVE.includes(UA_AGENT), "« Skitrack » ne part pas dans les requêtes");
  });

  it("lit le Crawl-delay du groupe applicable", () => {
    const txt = ["User-agent: *", "Crawl-delay: 5", "Disallow: /prive"].join("\n");
    assert.equal(crawlDelayMs(txt), 5000);
  });

  it("préfère la valeur publiée pour notre agent", () => {
    const txt = [
      "User-agent: *",
      "Crawl-delay: 1",
      "",
      `User-agent: ${UA_AGENT}`,
      "Crawl-delay: 10",
    ].join("\n");
    assert.equal(crawlDelayMs(txt), 10_000);
  });

  it("ignore un Crawl-delay destiné à un autre robot", () => {
    const txt = ["User-agent: GoogleBot", "Crawl-delay: 30"].join("\n");
    assert.equal(crawlDelayMs(txt), null);
  });

  it("rend null quand le fichier est illisible ou muet", () => {
    assert.equal(crawlDelayMs(null), null);
    assert.equal(crawlDelayMs(""), null);
    assert.equal(crawlDelayMs("User-agent: *\nDisallow:"), null);
  });

  it("l'intervalle minimal par défaut reste au moins deux secondes", () => {
    assert.ok(INTERVALLE_MS >= 2000);
  });

  it("la cadence publiée par le site est tenue, pas seulement calculée", async () => {
    // `verdictPoli` rendait `delaiMs`, et la file gardait ses deux secondes :
    // le Crawl-delay était calculé puis jeté.
    const vrai = globalThis.fetch;
    const heures: number[] = [];
    globalThis.fetch = (async () => {
      heures.push(Date.now());
      return new Response("ok", { status: 200 });
    }) as typeof fetch;
    try {
      oublierFiles();
      const DELAI = INTERVALLE_MS + 400;
      await demander("https://exemple.test/a", undefined, DELAI);
      await demander("https://exemple.test/b", undefined, DELAI);
      assert.equal(heures.length, 2);
      const ecart = heures[1]! - heures[0]!;
      assert.ok(ecart >= DELAI - 40, `écart ${ecart} ms, attendu ≥ ${DELAI}`);
    } finally {
      globalThis.fetch = vrai;
      oublierFiles();
    }
  });

  it("une cadence plus courte que la nôtre ne raccourcit pas l'attente", async () => {
    const vrai = globalThis.fetch;
    const heures: number[] = [];
    globalThis.fetch = (async () => {
      heures.push(Date.now());
      return new Response("ok", { status: 200 });
    }) as typeof fetch;
    try {
      oublierFiles();
      // 10 ms annoncés : c'est notre plancher qui vaut, pas le leur.
      await demander("https://lent.test/a", undefined, 10);
      await demander("https://lent.test/b", undefined, 10);
      const ecart = heures[1]! - heures[0]!;
      assert.ok(ecart >= INTERVALLE_MS - 40, `écart ${ecart} ms : le plancher n'a pas tenu`);
    } finally {
      globalThis.fetch = vrai;
      oublierFiles();
    }
  });
});
