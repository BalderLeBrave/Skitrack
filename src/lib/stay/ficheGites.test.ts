import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  alignerIdentiteGites,
  estFicheGitesIntrouvable,
  estPageGitesIntrouvable,
  marquerFicheIntrouvable,
  nomGitesPublie,
  poserFicheGites,
  slugGites,
  slugUrlGites,
  urlGitesDepuisNom,
} from "./ficheGites.ts";
import { lectureFiche } from "./lectureFiche.ts";
import { conserverDevisGites, estOffreGitesVerifiee } from "./tarif.ts";
import { fillDevis } from "./completerDevis.server.ts";
import { avisDe, equipementsDe, equipementsLus, equipementsTus } from "./ficheEnrichie.ts";
import {
  avisFromGitesHtml,
  descriptionFromGitesHtml,
  listingDeFiche,
  listingDeTuile,
  type Fiche,
  type Tile,
} from "../scrape/gites.server.ts";
import type { LiveSearchInput } from "../scrape/types.ts";

const DEAD =
  "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/copains-comme-cochons-38g253122";
const LIVE =
  "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/chalet-les-copains-38g253122";

const WIDGET = `<script type="application/ld+json">${JSON.stringify({
  "@context": "http://schema.org",
  "@type": "LodgingBusiness",
  name: "Chalet les Copains",
  url: "/location-vacances/Gite-Les-Deux-Alpes-38G253122.html",
  address: { addressLocality: "LES DEUX ALPES" },
  location: { geo: { latitude: "45.03657800", longitude: "6.13102100" } },
})}</script>`;

describe("fiche Gîtes : le nom publié, pas l'ancien slug", () => {
  it("un nom avec accent publié en entité a le même slug que l'URL Drupal", () => {
    assert.equal(slugGites("Chalet de Pré-Forent Mitoyen - 3***"), "chalet-de-pre-forent-mitoyen-3");
    assert.equal(slugGites("Chalet Centaurée (ou Chalet Sabot de Vénus)"), "chalet-centauree-ou-chalet-sabot-de-venus");
    assert.equal(
      slugUrlGites(
        "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/chalet-centauree-ou-chalet-sabot-de-venus-38g52734",
      ),
      "chalet-centauree-ou-chalet-sabot-de-venus",
    );
  });

  it("lit le slug d'une URL publique, sans le code", () => {
    assert.equal(slugUrlGites(DEAD), "copains-comme-cochons");
    assert.equal(slugUrlGites(LIVE), "chalet-les-copains");
  });

  it("recrée l'URL de Chalet les Copains à la place de Copains comme Cochons", () => {
    assert.equal(urlGitesDepuisNom(DEAD, "Chalet les Copains"), LIVE);
    assert.equal(urlGitesDepuisNom(LIVE, "Chalet les Copains"), null);
    assert.equal(
      urlGitesDepuisNom(
        "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/de-lours-brun-38g285102?adults=8",
        "de l'ours brun",
      ),
      null,
    );
  });

  it("un 404 est une absence ; un défi Cloudflare n'en est pas une", () => {
    assert.equal(estPageGitesIntrouvable("Page introuvable | Gîtes de France®", 404), true);
    assert.equal(estPageGitesIntrouvable("<h1>Page introuvable</h1><p>La page que vous cherchez n’existe plus.</p>"), true);
    assert.equal(estPageGitesIntrouvable("Attention Required! | Cloudflare", 403), false);
    assert.equal(estPageGitesIntrouvable("<title>Sorry, you have been blocked</title>", 403), false);
    assert.equal(estPageGitesIntrouvable("<h1>Chalet les Copains</h1>", 200), false);
  });

  it("lit le nom LodgingBusiness du widget ITEA", () => {
    assert.equal(nomGitesPublie(WIDGET), "Chalet les Copains");
    assert.equal(lectureFiche(WIDGET).title, "Chalet les Copains");
    assert.equal(lectureFiche(WIDGET).lat, 45.036578);
  });

  it("remplace le titre et l'URL figés par la fiche publiée", () => {
    const out = alignerIdentiteGites(
      {
        source: "Gîtes de France",
        title: "Gîte Copains comme Cochons",
        url: DEAD,
        proven: "dump",
      },
      WIDGET,
    );
    assert.equal(out.title, "Chalet les Copains");
    assert.equal(out.url, LIVE);
    assert.match(out.proven, /fiche/);
    assert.equal(estFicheGitesIntrouvable(out), false);
  });

  it("une fiche introuvable se dit, et se filtre", () => {
    const m = marquerFicheIntrouvable({ proven: "dump" });
    assert.equal(estFicheGitesIntrouvable({ source: "Gîtes de France", proven: m.proven }), true);
    assert.equal(estFicheGitesIntrouvable({ source: "Airbnb", proven: m.proven }), false);
  });
});

describe("conserverDevisGites : l'URL live, le devis déjà posé", () => {
  it("garde le devis live et l'URL publique, écarte un gîte sans total publié", () => {
    const dump = [
      {
        source: "Gîtes de France" as const,
        id: "38G253122",
        title: "Gîte Copains comme Cochons",
        url: DEAD,
        total: 4261.52,
        proven: "Devis ITEA 2026-09-03, dates 2027-02-06/13, 8 pers.",
      },
    ];
    const live = [
      {
        source: "Gîtes de France" as const,
        id: "38G253122",
        title: "Chalet les Copains",
        url: LIVE,
        total: 0,
        proven: "Fiche ITEA live — aucun prix publié à ces dates.",
      },
      {
        source: "Gîtes de France" as const,
        id: "38G40102",
        title: "La Citriere",
        url: "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/la-citriere-38g40102",
        total: 727.44,
        proven: "Devis ITEA live 2027-02-06→2027-02-13, 8 pers.",
      },
    ];
    const out = conserverDevisGites(dump, live);
    assert.equal(out.some((l) => l.id === "38G253122"), false);
    const cit = out.find((l) => l.id === "38G40102");
    assert.equal(cit?.total, 727.44);
    assert.match(cit?.url ?? "", /la-citriere-38g40102/);
  });
});

describe("fiche Gîtes : la page ITEA lue pour le devis pose aussi sa fiche", () => {
  // Fiche ITEA réelle du 6 octobre 2026 : Chalet les Copains, Les Deux Alpes.
  const html = readFileSync(new URL("../scrape/fixtures/itea-fiche-38G253122.html", import.meta.url), "utf8");
  const INPUT: LiveSearchInput = {
    stationId: "les-2-alpes",
    stationName: "Les 2 Alpes",
    lat: 45.0106,
    lon: 6.1226,
    checkIn: "2027-02-06",
    checkOut: "2027-02-13",
    guests: 8,
    bedrooms: 4,
  };
  const TUILE: Tile = {
    title: "Chalet les Copains",
    url: LIVE,
    typeLabel: "Gîte",
    capacite: "14 personnes",
    photo: null,
    lat: null,
    lon: null,
  };
  const lue = () => ({ description: descriptionFromGitesHtml(html), avis: avisFromGitesHtml(html) });
  /** Ce que pose le collecteur quand il lit lui-même la fiche (`listingDeFiche`). */
  const parCollecteur = () => {
    const fiche: Fiche = {
      total: 0,
      currency: null,
      priceLabel: null,
      occupancy: { capacity: null, bedrooms: null, rooms: null },
      lieu: { lat: null, lon: null, locality: null },
      platformId: null,
      ...lue(),
    };
    return listingDeFiche(TUILE, fiche, "38G253122", INPUT);
  };
  /**
   * Le tableau de prix ITEA de La Citrière (`tarif.test.ts`) : aucun tableau
   * des Copains n'est enregistré, et seul le devis compte ici.
   */
  const TAB = `<div class="blocResa_choixFormule"><div class="div_prixLocation"><span class="sp_lblAvantMontantLocation">7 nuits</span><span class="sp_montantLocation">672&euro;</span></div><div class="div_prixLocation"><span class="sp_lblAvantTaxeSejour">Taxe de séjour</span><span class="sp_montantTaxeSejour">55,44&euro;</span></div><div class="div_prixLocation div_prixLocationTotal" style="display:none;"><span class="sp_lblAvantPrixTotal">Total</span><span class="sp_montantPrixTotal" data-prix="727.44">727,44 &euro;</span></div></div>`;

  it("pose sur la tuile la fiche que le collecteur aurait posée : description, avis, équipements nommés", () => {
    const tuile = listingDeTuile(TUILE, "38G253122", INPUT);
    assert.equal(tuile.fiche, undefined);
    assert.equal(equipementsLus(tuile), false, "avant : « Équipements non lus »");
    assert.equal(poserFicheGites(tuile, lue()), true);
    const ref = parCollecteur();
    assert.deepEqual(tuile.fiche, ref.fiche);
    assert.equal(tuile.description, ref.description);
    assert.deepEqual(tuile.amenities, ref.amenities);
    assert.equal(tuile.fiche!.sourceFiche, "gites");
    assert.equal(avisDe(tuile)?.nombre, 2);
    assert.equal(avisDe(tuile)?.noteSur5, null, "pas de note sans échelle");
    // La page ne publie pas de liste : la fiche décide seule, sans rien tirer du texte.
    assert.deepEqual(tuile.fiche!.equipements, []);
    assert.equal(equipementsDe(tuile), null);
    assert.equal(equipementsLus(tuile), true, "après : « Équipements non publiés par Gîtes de France »");
    assert.deepEqual(equipementsTus(tuile), []);
  });

  it("ne remplace rien : une fiche déjà lue, une description déjà posée, une autre source", () => {
    const deja = parCollecteur();
    const fiche = deja.fiche;
    assert.equal(poserFicheGites(deja, { description: "Autre texte", avis: null }), false);
    assert.equal(deja.fiche, fiche);
    const decrite = { ...listingDeTuile(TUILE, "38G253122", INPUT), description: "Texte du relevé" };
    assert.equal(poserFicheGites(decrite, lue()), true);
    assert.equal(decrite.description, "Texte du relevé");
    assert.equal(decrite.fiche!.description, lue().description);
    const autre = { ...listingDeTuile(TUILE, "38G253122", INPUT), source: "Centrale" as const };
    assert.equal(poserFicheGites(autre, lue()), false);
    assert.equal(autre.fiche, undefined);
    assert.equal(poserFicheGites(listingDeTuile(TUILE, "38G253122", INPUT), { description: null, avis: null }), false);
  });

  it("le devis d'une tuile pose sa fiche depuis la même page, sans requête de plus", async () => {
    const appels: string[] = [];
    const vrai = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const corps = init?.body ? String(init.body) : "";
      const type = /type=(\w+)/.exec(corps)?.[1];
      appels.push([init?.method ?? "GET", url.split("?")[0], ...(type ? [type] : [])].join(" "));
      if (/fiche-38G253122\.html/.test(url)) return new Response(html, { status: 200 });
      if (type === "getExerciceByDateFin") return new Response("{}", { status: 200 });
      if (type === "getHTMLTabPrixFormulesSejour") return new Response(TAB, { status: 200 });
      return new Response("", { status: 404 });
    }) as typeof fetch;
    const tuile = listingDeTuile(TUILE, "38G253122", INPUT);
    try {
      const sejour = { checkIn: INPUT.checkIn, checkOut: INPUT.checkOut, guests: INPUT.guests };
      assert.equal(await fillDevis([tuile], sejour, 10_000), 1);
    } finally {
      globalThis.fetch = vrai;
    }
    // Les trois appels du devis, comme avant : la page, l'exercice, le tableau.
    assert.deepEqual(appels, [
      "GET https://widget-fngf.itea.fr/fiche-38G253122.html",
      "POST https://widget-fngf.itea.fr/lib_2/ajax/gereResa.php getExerciceByDateFin",
      "POST https://widget-fngf.itea.fr/lib_2/ajax/gereResa.php getHTMLTabPrixFormulesSejour",
    ]);
    assert.equal(tuile.total, 727.44);
    assert.equal(estOffreGitesVerifiee(tuile), true, "le gîte s'affiche");
    const ref = parCollecteur();
    assert.deepEqual(tuile.fiche, ref.fiche);
    assert.equal(tuile.description, ref.description);
    assert.deepEqual(tuile.amenities, ref.amenities);
    assert.equal(equipementsLus(tuile), true);
    assert.equal(equipementsDe(tuile), null);
  });
});
