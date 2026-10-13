import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dedoublonner,
  interditToutSansGroupe,
  langueUrl,
  lireSitemap,
  preferFrancais,
  scoreTarifs,
  sitemapDedie,
  sitemapIndexProbable,
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

  it("n'ouvre ni les taxonomies ni les rubriques au pluriel (font-romeu.fr, haut-giffre.fr)", () => {
    for (const sm of [
      "https://font-romeu.fr/type_hebergements-sitemap.xml",
      "https://font-romeu.fr/categories_patrimoines-sitemap.xml",
      "https://font-romeu.fr/theme_loisirs-sitemap.xml",
      "https://font-romeu.fr/restaurations-sitemap.xml",
      "https://font-romeu.fr/evenements-sitemap.xml",
      "https://font-romeu.fr/commerces_services-sitemap.xml",
      "https://www.haut-giffre.fr/webcam-sitemap.xml",
      "https://www.haut-giffre.fr/producteurs-sitemap.xml",
    ]) {
      assert.ok(!sitemapUtile(sm, "hebergement"), sm);
    }
    assert.ok(!sitemapDedie("https://font-romeu.fr/type_hebergements-sitemap.xml", "hebergement"));
    assert.ok(sitemapUtile("https://www.haut-giffre.fr/hebergements-locatif-sitemap.xml", "hebergement"));
    assert.ok(sitemapUtile("https://x.fr/forfaits-saison-sitemap.xml", "tarifs"));
    assert.ok(sitemapUtile("https://www.haut-giffre.fr/domaines-skiables-sitemap.xml", "tarifs"));
  });

  it("reconnaît un index probable", () => {
    assert.ok(sitemapIndexProbable("https://x.fr/sitemap.xml"));
    assert.ok(sitemapIndexProbable("https://x.fr/sitemap_index.xml"));
    assert.ok(sitemapIndexProbable("https://x.fr/wp-sitemap.xml"));
    assert.ok(!sitemapIndexProbable("https://x.fr/post-sitemap.xml"));
  });

  it("lit la langue en chemin comme en sous-domaine", () => {
    assert.equal(langueUrl("https://nl.la-plagne.com/ontdekken/"), "nl");
    assert.equal(langueUrl("http://it.chamonix.com/activites/hiver/ski/forfaits-de-ski"), "it");
    assert.equal(langueUrl("https://www.sancy.com/fr/fiche/x/"), "fr");
    assert.equal(langueUrl("https://sites.valdabondance.com/a"), null);
    assert.equal(langueUrl("https://en.chamrousse.com/alpine-ski-pass-prices.html"), "en");
    assert.deepEqual(
      preferFrancais([
        "http://it.chamonix.com/activites/hiver/ski/forfaits-de-ski",
        "http://de.chamonix.com/activites/hiver/ski/forfaits-de-ski",
        "http://www.chamonix.com/activites/hiver/ski/forfaits-de-ski",
      ]),
      ["http://www.chamonix.com/activites/hiver/ski/forfaits-de-ski"],
    );
  });

  it("écarte des pages tarifs ce que le relevé du 11 octobre 2026 retenait à tort", () => {
    const quand = new Date("2026-10-11T00:00:00Z");
    for (const u of [
      "https://www.la-plagne.com/decouvrir-la-plagne/pratique/points-de-vente-de-forfaits-hiver",
      "https://nl.la-plagne.com/ontdekken/praktisch/winkels-en-diensten/verkoopspunt-van-skipassen-forfaits-montchavin",
      "https://courchevel.com/fr/a/point-de-vente-forfaits-de-ski-moriond-7124132/",
      "https://www.avoriaz.com/fiche/caisse-vente-de-forfaits-centre-station/",
      "https://www.prazdelys-sommand.com/commerce-et-service/borne-automatique-de-forfaits-les-molliettes/",
      "https://www.alpedhuez.com/fr/video_webtv/fah2016-remise-du-prix-michel-galabru-prix-interpretation/",
      "https://www.lesarcs.com/fr/que-faire-aux-arcs/tous-les-evenements/prix-roman-jeunesse-la-vache-qui-lit-2026",
      "https://www.chamberymontagnes.com/agenda/tout-agenda/remise-du-prix-litteraire-paysages-ecrits-chambery-fr-5793684/",
      "https://www.lesrousses.com/activites-station-des-rousses/commando-games/commando-games-tarifs-et-horaires/",
      "https://www.gap-bayard.com/tarifs-golf",
      "https://beuil.fr/tarif-exceptionnel-au-tennis-des-launes/",
      "https://www.lescontamines.com/hiver/ouverture-des-preventes-des-forfaits-de-ski-hiver-2024-2025",
      "https://www.montclar.fr/deliberations-conseil-municipal/i/84987139/deliberation-tarifs-secours-sur-piste",
      "https://www.lesarcs.com/fr/seminaires-incentives-evenements-dentreprise/forfaits-de-groupes",
    ]) {
      assert.ok(scoreTarifs(u, quand) <= 0, `${u} : ${scoreTarifs(u, quand)}`);
    }
    for (const u of [
      "https://www.avoriaz.com/decouvrir/les-incontournables/tarifs-des-forfaits-hiver/",
      "https://www.chioula.fr/tarifs.html",
      "https://www.lelioran.com/hiver/les-tarifs/",
      "https://www.lescontamines.com/hiver/preventes-des-forfaits-de-ski-hiver-2026-2027-c-est-en-ligne",
      "http://www.chamonix.com/activites/hiver/ski/forfaits-de-ski",
    ]) {
      assert.ok(scoreTarifs(u, quand) > 0, `${u} : ${scoreTarifs(u, quand)}`);
    }
    assert.ok(
      scoreTarifs("http://www.chamonix.com/activites/hiver/ski/forfaits-de-ski", quand) >
        scoreTarifs("http://it.chamonix.com/activites/hiver/ski/forfaits-de-ski", quand),
    );
  });
});
