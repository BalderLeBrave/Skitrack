import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dedoublonner,
  interditToutSansGroupe,
  lireSitemap,
  preferFrancais,
  scoreTarifs,
  sitemapDedie,
  sitemapsDeRobots,
  sitemapUtile,
  urlDuProfil,
} from "./sitemap.ts";

describe("sitemaps", () => {
  it("lit les lignes Sitemap de robots.txt, écritures relevées comprises", () => {
    const txt = [
      "User-agent: *",
      "Disallow: /wp-admin/",
      "Sitemap : https://www.haut-giffre.fr/sitemap_index.xml",
      "Sitemap:http://sites.valdabondance.com/sitemap.xml",
      "sitemap: /plan.xml # relatif",
      "Sitemap: https://www.haut-giffre.fr/sitemap_index.xml",
    ].join("\r\n");
    assert.deepEqual(sitemapsDeRobots(txt, "https://www.haut-giffre.fr"), [
      "https://www.haut-giffre.fr/sitemap_index.xml",
      "http://sites.valdabondance.com/sitemap.xml",
      "https://www.haut-giffre.fr/plan.xml",
    ]);
    assert.deepEqual(sitemapsDeRobots(null, "https://x.fr"), []);
  });

  it("lit un index et une liste, CDATA et entités compris", () => {
    const index = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc><![CDATA[https://www.valleesdegavarnie.com/tourinsoft-sitemap.xml]]></loc><lastmod>2026-10-10</lastmod></sitemap>
      <sitemap><loc>https://www.valleesdegavarnie.com/page-sitemap.xml</loc></sitemap></sitemapindex>`;
    const i = lireSitemap(index);
    assert.equal(i.type, "index");
    assert.deepEqual(i.entrees.map((e) => e.loc), [
      "https://www.valleesdegavarnie.com/tourinsoft-sitemap.xml",
      "https://www.valleesdegavarnie.com/page-sitemap.xml",
    ]);
    assert.equal(i.entrees[0].lastmod, "2026-10-10");
    const liste = lireSitemap(`<urlset><url><loc>https://x.fr/a?b=1&amp;c=2</loc></url><url><loc>pas une url</loc></url></urlset>`);
    assert.equal(liste.type, "urlset");
    assert.deepEqual(liste.entrees.map((e) => e.loc), ["https://x.fr/a?b=1&c=2"]);
  });

  it("une page d'erreur servie en 200 est illisible, pas vide", () => {
    assert.equal(lireSitemap("<html><h1>403 Forbidden</h1></html>").type, "illisible");
  });

  it("trie les fiches d'hébergement", () => {
    assert.ok(urlDuProfil("https://www.sancy.com/fr/fiche/hebergement-locatif/residence-le-poete-8b-mont-dore_TFO5960531/", "hebergement"));
    assert.ok(urlDuProfil("https://font-romeu.fr/hebergements/chalet-angora/", "hebergement"));
    assert.ok(!urlDuProfil("https://www.sancy.com/fr/fiche/restauration/le-laurent-1er-mont-dore_TFO4654088/", "hebergement"));
    assert.ok(!urlDuProfil("https://www.sancy.com/fr/fiche/activite/team-sensations-mushing-compains_TFO6738057/", "hebergement"));
    assert.ok(!urlDuProfil("https://x.fr/blog/5-chalets-de-reve/", "hebergement"));
  });

  it("ouvre d'abord les sitemaps dédiés, saute les hors-sujet", () => {
    assert.ok(sitemapDedie("https://font-romeu.fr/hebergements-sitemap.xml", "hebergement"));
    assert.ok(sitemapDedie("https://www.sancy.com/uploads/sitemaps/sitemap-diffusio-fr.xml", "hebergement"));
    assert.ok(!sitemapDedie("https://font-romeu.fr/post-sitemap.xml", "hebergement"));
    assert.ok(!sitemapUtile("https://x.fr/post_tag-sitemap.xml", "hebergement"));
    assert.ok(!sitemapUtile("https://x.fr/hebergements-sitemap.xml", "tarifs"));
    assert.ok(sitemapUtile("https://x.fr/sitemap2.xml", "tarifs"));
  });

  it("classe les pages tarifs : la grille d'hiver en français d'abord", () => {
    const urls = [
      "https://www.tignes.net/ski/forfaits-ski/forfaits-pietons",
      "https://www.les2alpes.com/winter/discover/skiing/buy-your-skipass/",
      "https://www.tignes.net/ski/forfaits-ski",
      "https://www.stationsnicecotedazur.com/fr/grand-prix-de-france/",
    ];
    const tri = [...urls].sort((a, b) => scoreTarifs(b) - scoreTarifs(a));
    assert.equal(tri[0], "https://www.tignes.net/ski/forfaits-ski");
    assert.ok(scoreTarifs("https://www.stationsnicecotedazur.com/fr/grand-prix-de-france/") <= 0);
    assert.ok(scoreTarifs("https://www.tignes.net/ski/forfaits-ski/forfaits-pietons") < scoreTarifs(tri[0]));
  });

  it("garde la langue du site", () => {
    assert.deepEqual(
      preferFrancais([
        "https://font-romeu.fr/ca/hebergements/le-grand-tetras/",
        "https://font-romeu.fr/es/alojamientos/le-grand-tetras/",
        "https://font-romeu.fr/hebergements/le-grand-tetras/",
        "https://www.sancy.com/fr/fiche/hebergement-locatif/x/",
      ]),
      ["https://font-romeu.fr/hebergements/le-grand-tetras/", "https://www.sancy.com/fr/fiche/hebergement-locatif/x/"],
    );
    assert.deepEqual(preferFrancais(["https://x.com/en/a"]), ["https://x.com/en/a"]);
  });

  it("Disallow: / hors groupe interdit tout ; dans un groupe, la norme décide", () => {
    assert.equal(interditToutSansGroupe("Disallow:/\n"), true);
    assert.equal(interditToutSansGroupe("User-agent: *\nDisallow: /"), false);
    assert.equal(interditToutSansGroupe("Disallow: /prive"), false);
    assert.equal(interditToutSansGroupe(null), false);
  });

  it("dédoublonne sans fragment", () => {
    assert.deepEqual(dedoublonner(["https://x.fr/a#b", "https://x.fr/a", "https://x.fr/c"]), ["https://x.fr/a", "https://x.fr/c"]);
  });
});
