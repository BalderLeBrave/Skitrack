import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { centraleAutorise, oublierRobots } from "./robots.server.ts";

/**
 * Ce module lit `robots.txt` et n'arrête jamais l'extraction. Ses réponses :
 *
 * - 200 avec des règles : on les lit, on journalise un Disallow, on extrait ;
 * - 404 ou 410 : il n'y a pas de règles, on extrait ;
 * - 500, 403, ou une panne de réseau : on n'a pas lu, on extrait quand même ;
 * - URL illisible : on n'a rien à demander, on extrait quand même.
 *
 * Le cache compte autant : sans lui, une centrale de seize stations se verrait
 * demander son `robots.txt` seize fois par recherche.
 */

type Appel = { url: string; agent: string | undefined };

const vrai = globalThis.fetch;
let appels: Appel[] = [];

/** Remplace `fetch` par une réponse fixe, et note qui a été appelé. */
function repondre(fabrique: () => Response | Promise<Response>): void {
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const entetes = (init?.headers ?? {}) as Record<string, string>;
    appels.push({ url: String(url), agent: entetes["user-agent"] });
    return Promise.resolve(fabrique());
  }) as typeof fetch;
}

beforeEach(() => {
  appels = [];
  oublierRobots();
});

afterEach(() => {
  globalThis.fetch = vrai;
  oublierRobots();
});

describe("robots.txt des centrales, en réseau", () => {
  it("lit un Disallow sans arrêter l'extraction", async () => {
    repondre(() => new Response("User-agent: *\nDisallow: /*?date=*", { status: 200 }));
    const ferme = await centraleAutorise("https://exemple.test/recherche.htm?date=06/02/2027");
    assert.equal(ferme.autorise, true);
    assert.equal(ferme.regle, "Disallow: /*?date=*");
    const ouvert = await centraleAutorise("https://exemple.test/pr7-hebergements.htm?DateRecherche=x");
    assert.equal(ouvert.autorise, true);
  });

  it("demande bien /robots.txt à l'origine, sous notre nom", async () => {
    repondre(() => new Response("", { status: 200 }));
    await centraleAutorise("https://exemple.test/un/chemin/profond.htm?a=1");
    assert.equal(appels.length, 1);
    assert.equal(appels[0]?.url, "https://exemple.test/robots.txt");
    assert.match(appels[0]?.agent ?? "", /SkitrackCentrales/);
  });

  it("un 404 autorise, parce que c'est une réponse et non un silence", async () => {
    repondre(() => new Response("Not found", { status: 404 }));
    const v = await centraleAutorise("https://exemple.test/x");
    assert.equal(v.autorise, true);
  });

  it("une erreur du serveur n'arrête pas l'extraction", async () => {
    repondre(() => new Response("boom", { status: 500 }));
    const v = await centraleAutorise("https://exemple.test/x");
    assert.equal(v.autorise, true);
    assert.equal(v.regle, "robots.txt illisible");
  });

  it("un refus ou une panne de réseau n'arrêtent pas non plus", async () => {
    repondre(() => new Response("nope", { status: 403 }));
    assert.equal((await centraleAutorise("https://exemple.test/x")).autorise, true);

    oublierRobots();
    globalThis.fetch = (() => Promise.reject(new Error("ECONNREFUSED"))) as typeof fetch;
    assert.equal((await centraleAutorise("https://exemple.test/x")).autorise, true);
  });

  it("une URL illisible n'arrête pas : on journalise et on extrait", async () => {
    repondre(() => new Response("", { status: 200 }));
    const v = await centraleAutorise("pas une url");
    assert.equal(v.autorise, true);
    assert.equal(v.regle, "URL illisible");
    assert.equal(appels.length, 0);
  });

  it("le fichier n'est demandé qu'une fois par hôte", async () => {
    repondre(() => new Response("User-agent: *\nDisallow: /prive", { status: 200 }));
    for (const chemin of ["/a", "/b", "/prive/x", "/c"]) {
      const v = await centraleAutorise("https://exemple.test" + chemin);
      assert.equal(v.autorise, true);
    }
    assert.equal(appels.length, 1, "quatre chemins, une seule lecture de robots.txt");

    await centraleAutorise("https://ailleurs.test/a");
    assert.equal(appels.length, 2);
    assert.equal(appels[1]?.url, "https://ailleurs.test/robots.txt");
  });

  it("le cache retient aussi les échecs, pour ne pas s'acharner", async () => {
    repondre(() => new Response("boom", { status: 500 }));
    await centraleAutorise("https://exemple.test/a");
    await centraleAutorise("https://exemple.test/b");
    assert.equal(appels.length, 1);
  });

  it("le chemin testé inclut la chaîne de requête, et on extrait quand même", async () => {
    repondre(() => new Response("User-agent: *\nDisallow: /*?ajax=*", { status: 200 }));
    const sans = await centraleAutorise("https://exemple.test/p.htm");
    assert.equal(sans.autorise, true);
    const avec = await centraleAutorise("https://exemple.test/p.htm?ajax=1");
    assert.equal(avec.autorise, true);
    assert.equal(avec.regle, "Disallow: /*?ajax=*");
  });
});
