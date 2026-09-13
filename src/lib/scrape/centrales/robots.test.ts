import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupePour, motifEnRegex, parserRobots, robotsAutorise } from "./robots.ts";

/** Le robots.txt réel d'Ingénie, réduit à ce qui compte pour nous. */
const INGENIE = `User-agent: *
Disallow: /stats
Disallow: /*?liste=*
Disallow: /*?date=*
Disallow: /*?ajax=*
Disallow: /*search?*
Disallow: /*booking?*
Noindex: /*?date=*
Sitemap: https://reservation.les2alpes.com/sitemap.xml`;

const OPEN_SYSTEM = `User-Agent: *
Allow: /
Sitemap: https://reservation.haute-maurienne-vanoise.com/sitemap.xml`;

describe("robots des centrales : un motif n'est pas un préfixe", () => {
  it("« /*?date=* » n'interdit que ce qu'il vise, pas tout le site", () => {
    // C'est l'erreur qui coûterait le parc entier : réduire le motif à son
    // préfixe donnerait « / » et fermerait tout.
    assert.equal(robotsAutorise(INGENIE, "/location-appartement-2-alpes.html").autorise, true);
    assert.equal(robotsAutorise(INGENIE, "/pr7-hebergements.htm").autorise, true);
  });

  it("mais il interdit bien la recherche datée", () => {
    const v = robotsAutorise(INGENIE, "/recherche.htm?date=06/02/2027");
    assert.equal(v.autorise, false);
    assert.equal(v.regle, "Disallow: /*?date=*");
    assert.equal(robotsAutorise(INGENIE, "/x/search?q=1").autorise, false);
    assert.equal(robotsAutorise(INGENIE, "/booking?a=1").autorise, false);
    assert.equal(robotsAutorise(INGENIE, "/p.htm?ajax=1").autorise, false);
  });

  it("« Allow: / » autorise, y compris avec des paramètres", () => {
    const v = robotsAutorise(OPEN_SYSTEM, "/pr7-tous-nos-hebergements.htm?datearrivee=06/02/2027");
    assert.equal(v.autorise, true);
    assert.equal(v.regle, "Allow: /");
  });

  it("la règle au plus long motif gagne, et Allow gagne à longueur égale", () => {
    const txt = `User-agent: *
Disallow: /a/
Allow: /a/b/
Disallow: /c
Allow: /c`;
    assert.equal(robotsAutorise(txt, "/a/x").autorise, false);
    assert.equal(robotsAutorise(txt, "/a/b/x").autorise, true);
    // Même longueur : Allow l'emporte.
    assert.equal(robotsAutorise(txt, "/c").autorise, true);
  });

  it("le groupe qui nous nomme l'emporte sur l'étoile", () => {
    const txt = `User-agent: *
Disallow: /

User-agent: SkitrackCentrales
Allow: /`;
    assert.equal(robotsAutorise(txt, "/x").autorise, true);
    assert.equal(robotsAutorise(txt, "/x", "AutreAgent").autorise, false);
    const g = groupePour(parserRobots(txt), "SkitrackCentrales");
    assert.deepEqual(g?.agents, ["skitrackcentrales"]);
  });

  it("deux User-agent de suite forment un seul groupe", () => {
    const g = parserRobots(`User-agent: a
User-agent: b
Disallow: /x`);
    assert.equal(g.length, 1);
    assert.deepEqual(g[0]?.agents, ["a", "b"]);
    assert.equal(g[0]?.regles.length, 1);
  });

  it("« $ » ancre la fin", () => {
    assert.ok(motifEnRegex("/*.php$").test("/a/b.php"));
    assert.ok(!motifEnRegex("/*.php$").test("/a/b.php?x=1"));
  });

  it("un fichier illisible ne dit ni oui ni non", () => {
    const v = robotsAutorise(null, "/x");
    assert.equal(v.autorise, null);
    assert.equal(v.regle, "robots.txt illisible");
  });

  it("un fichier sans règle autorise", () => {
    assert.equal(robotsAutorise("Sitemap: https://x/y.xml", "/x").autorise, true);
    assert.equal(robotsAutorise("", "/x").autorise, true);
  });

  it("les commentaires ne comptent pas", () => {
    const txt = `# User-agent: *
# Disallow: /
User-agent: *
Disallow: /prive # secret`;
    assert.equal(robotsAutorise(txt, "/prive/x").autorise, false);
    assert.equal(robotsAutorise(txt, "/public").autorise, true);
  });
});
