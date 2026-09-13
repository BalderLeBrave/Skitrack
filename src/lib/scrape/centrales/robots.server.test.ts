import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { centraleAutorise, oublierRobots } from "./robots.server.ts";

/**
 * Ce module décide si une centrale est appelée. Ses quatre réponses possibles
 * n'ont pas le même poids, et deux d'entre elles se confondent facilement :
 *
 * - 200 avec des règles : on les applique ;
 * - 404 ou 410 : il n'y a pas de règles, donc tout est permis. C'est une
 *   réponse claire, pas une absence de réponse ;
 * - 500, 403, ou une panne de réseau : on ne sait pas. Une erreur ne vaut pas
 *   autorisation, et la traiter comme un 404 ferait interroger des hôtes qui
 *   nous interdisent peut-être. C'est l'erreur qu'il faut rendre impossible.
 *
 * Le cache compte autant : sans lui, une centrale de seize stations se verrait
 * demander son `robots.txt` seize fois par recherche, ce qui transforme une
 * politesse en nuisance.
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
  it("applique les règles quand le fichier existe", async () => {
    repondre(() => new Response("User-agent: *\nDisallow: /*?date=*", { status: 200 }));
    const ferme = await centraleAutorise("https://exemple.test/recherche.htm?date=06/02/2027");
    assert.equal(ferme.autorise, false);
    assert.equal(ferme.regle, "Disallow: /*?date=*");
    const ouvert = await centraleAutorise("https://exemple.test/pr7-hebergements.htm?DateRecherche=x");
    assert.equal(ouvert.autorise, true);
  });

  it("demande bien /robots.txt à l'origine, sous notre nom", async () => {
    repondre(() => new Response("", { status: 200 }));
    await centraleAutorise("https://exemple.test/un/chemin/profond.htm?a=1");
    assert.equal(appels.length, 1);
    assert.equal(appels[0]?.url, "https://exemple.test/robots.txt");
    // L'agent envoyé doit être celui sur lequel porte la vérification : demander
    // les règles sous un nom et appeler sous un autre serait se réclamer d'une
    // permission qu'on ne demande pas.
    assert.match(appels[0]?.agent ?? "", /SkitrackCentrales/);
  });

  it("un 404 autorise, parce que c'est une réponse et non un silence", async () => {
    repondre(() => new Response("Not found", { status: 404 }));
    const v = await centraleAutorise("https://exemple.test/x");
    assert.equal(v.autorise, true);
  });

  it("une erreur du serveur n'autorise pas", async () => {
    // C'est le cœur du module : 500 n'est pas 404. Si ces deux-là se
    // confondaient, une centrale en panne passerait pour une centrale ouverte.
    repondre(() => new Response("boom", { status: 500 }));
    const v = await centraleAutorise("https://exemple.test/x");
    assert.equal(v.autorise, null);
    assert.equal(v.regle, "robots.txt illisible");
  });

  it("un refus ou une panne de réseau n'autorisent pas non plus", async () => {
    repondre(() => new Response("nope", { status: 403 }));
    assert.equal((await centraleAutorise("https://exemple.test/x")).autorise, null);

    oublierRobots();
    globalThis.fetch = (() => Promise.reject(new Error("ECONNREFUSED"))) as typeof fetch;
    assert.equal((await centraleAutorise("https://exemple.test/x")).autorise, null);
  });

  it("une URL illisible est refusée sans rien demander à personne", async () => {
    repondre(() => new Response("", { status: 200 }));
    const v = await centraleAutorise("pas une url");
    assert.equal(v.autorise, false);
    assert.equal(v.regle, "URL illisible");
    assert.equal(appels.length, 0);
  });

  it("le fichier n'est demandé qu'une fois par hôte", async () => {
    repondre(() => new Response("User-agent: *\nDisallow: /prive", { status: 200 }));
    for (const chemin of ["/a", "/b", "/prive/x", "/c"]) {
      await centraleAutorise("https://exemple.test" + chemin);
    }
    assert.equal(appels.length, 1, "quatre chemins, une seule lecture de robots.txt");

    // Un autre hôte est un autre fichier.
    await centraleAutorise("https://ailleurs.test/a");
    assert.equal(appels.length, 2);
    assert.equal(appels[1]?.url, "https://ailleurs.test/robots.txt");
  });

  it("le cache retient aussi les échecs, pour ne pas s'acharner", async () => {
    // Un hôte en panne resterait sinon redemandé à chaque chemin, ce qui est
    // exactement ce qu'il faut éviter de faire à un serveur qui souffre.
    repondre(() => new Response("boom", { status: 500 }));
    await centraleAutorise("https://exemple.test/a");
    await centraleAutorise("https://exemple.test/b");
    assert.equal(appels.length, 1);
  });

  it("le chemin testé inclut la chaîne de requête", async () => {
    // C'est sur elle que portent la plupart des interdictions des centrales,
    // dont celles qui ferment les recherches datées.
    repondre(() => new Response("User-agent: *\nDisallow: /*?ajax=*", { status: 200 }));
    assert.equal((await centraleAutorise("https://exemple.test/p.htm")).autorise, true);
    assert.equal((await centraleAutorise("https://exemple.test/p.htm?ajax=1")).autorise, false);
  });
});
