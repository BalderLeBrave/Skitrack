import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  alignerIdentiteGites,
  estFicheGitesIntrouvable,
  estPageGitesIntrouvable,
  marquerFicheIntrouvable,
  nomGitesPublie,
  slugGites,
  slugUrlGites,
  urlGitesDepuisNom,
} from "./ficheGites.ts";
import { lectureFiche } from "./lectureFiche.ts";
import { conserverDevisGites } from "./tarif.ts";

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
