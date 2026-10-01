import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { agencesDe, lieuxDe } from "./couverture.ts";
import { createHash } from "node:crypto";
import {
  cleGroupe,
  corpsRecherche,
  groupesWiyp,
  lieuTravelski,
  lienOffre,
  lireFiche,
  lireNomLogement,
  lirePosition,
  lireRecherche,
  lireWiyp,
  offresRetenues,
  prixOffre,
  reponseWiyp,
  requeteWiyp,
  travelskiListings,
  typeGarde,
  urlFiche,
  urlRecherche,
} from "./travelski.ts";
import type { LiveSearchInput } from "../types.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const fx = (f: string) => readFileSync(join(dir, "fixtures", f), "utf8");

/**
 * Réponses réelles du 26 septembre 2026, réduites à ce que le module lit :
 * la recherche d'Avoriaz, 6→13/02/2027 (Atria-Crozats et ses trois formules,
 * TILIA en hébergement seul, et l'Hôtel des Dromonts à écarter) ; la fiche
 * d'Atria-Crozats, réduite à sa ligne `window.lihe`.
 */
const RECHERCHE = lireRecherche(JSON.parse(fx("travelski-recherche-avoriaz.json")));
const FICHE = lireFiche(fx("travelski-fiche-atria-crozats-8493.html"));

const AVORIAZ: LiveSearchInput = {
  stationId: "avoriaz",
  stationName: "Avoriaz",
  lat: 46.1914,
  lon: 6.7728,
  checkIn: "2027-02-06",
  checkOut: "2027-02-13",
  guests: 2,
  bedrooms: 0,
};
const atria = () => RECHERCHE.residences.find((r) => r.liheId === "8493")!;

describe("Travelski : requêtes", () => {
  it("le corps de la recherche : moteur, dates, lieu, capacités acceptées, les trois formules", () => {
    assert.deepEqual(corpsRecherche(AVORIAZ, lieuTravelski("station:36")), {
      engineId: 1,
      beginDate: "2027-02-06",
      endDate: "2027-02-13",
      station: [36],
      capacity: Array.from({ length: 19 }, (_, i) => i + 2),
      packages: ["HS", "PF", "PFP"],
      criteria: [],
    });
    const parent = corpsRecherche({ ...AVORIAZ, guests: 6 }, lieuTravelski("parentStation:4"));
    assert.deepEqual(parent.parentStation, [4]);
    assert.equal(parent.capacity[0], 6);
    assert.equal(urlRecherche(1), "https://api.travelski.com/se/search/product?size=100&start=1&agg=lihePack");
  });

  it("des dates ou un lieu illisibles ne partent pas", () => {
    assert.throws(() => corpsRecherche({ ...AVORIAZ, checkIn: "06/02/2027" }, lieuTravelski("station:36")));
    assert.throws(() => lieuTravelski("station:36&x"));
    assert.deepEqual(lieuTravelski("station:96,27,336"), { cle: "station", ids: [96, 27, 336] });
  });

  it("l'adresse de la fiche, et rien d'autre", () => {
    assert.equal(urlFiche("/appartement/location/appartements-tilia-136708"), "https://www.travelski.com/appartement/location/appartements-tilia-136708");
    assert.equal(urlFiche("//exemple.org/x"), null);
    assert.equal(urlFiche(null), null);
  });
});

describe("Travelski : lecture", () => {
  it("la recherche : résidences, offres, compte du site", () => {
    assert.deepEqual([RECHERCHE.total, RECHERCHE.pages, RECHERCHE.recues], [102, 2, 3]);
    const r = atria();
    assert.deepEqual([r.nom, r.station, r.typeCode, r.note, r.avis], ["Pierre & Vacances Résidence Atria-Crozats", "Avoriaz", "19", 4.6, 3]);
    assert.equal(r.offres.length, 12);
    const hs = r.offres.find((o) => o.id === "80136" && o.formule === "HS")!;
    assert.deepEqual([hs.prixLogement, hs.capacite, hs.debut, hs.fin, hs.nuits, hs.joursForfait], [3087, 4, "2027-02-06", "2027-02-13", 7, 0]);
  });

  it("la fiche : la position de la résidence, et par logement chambres, pièces, capacité", () => {
    assert.ok(FICHE);
    assert.deepEqual([FICHE.liheId, FICHE.lat, FICHE.lon], ["8493", 46.193199, 6.77615]);
    assert.deepEqual(FICHE.logements.get("80143"), { id: "80143", chambres: 2, pieces: 3, capacite: 6 });
    assert.equal(lireFiche("<html>sans lihe</html>"), null);
  });

  it("une position illisible ou nulle n'est pas une position", () => {
    assert.deepEqual(lirePosition("46.188055, 6.775888"), { lat: 46.188055, lon: 6.775888 });
    assert.equal(lirePosition("0, 0"), null);
    assert.equal(lirePosition("Avoriaz"), null);
  });
});

describe("Travelski : ce qui est gardé", () => {
  it("ni hôtel ni club ; chalets, résidences et appartements de particulier", () => {
    assert.deepEqual(["18", "19", "40", "43", "44", "45"].map(typeGarde), [true, true, true, true, true, true]);
    assert.deepEqual([typeGarde("22"), typeGarde("23"), typeGarde(null)], [false, false, false]);
    const hotel = RECHERCHE.residences.find((r) => r.liheId === "738")!;
    assert.equal(travelskiListings(hotel, null, AVORIAZ).length, 0);
  });

  it("pour chaque logement : l'hébergement seul, et le forfait PF avant PFP", () => {
    const retenues = offresRetenues(atria(), AVORIAZ);
    assert.equal(retenues.length, 4);
    const a = retenues.find((x) => x.id === "80136")!;
    assert.deepEqual([a.seule?.formule, a.forfait?.formule, a.forfait?.prixLogement], ["HS", "PF", 4144]);
  });

  it("chambres et pièces lues dans le nom, à défaut de fiche", () => {
    assert.deepEqual(lireNomLogement("Studio 4 personnes"), { chambres: 0, pieces: 1 });
    assert.deepEqual(lireNomLogement("Appartement 6 personnes - 2 chambres - Balcon"), { chambres: 2, pieces: null });
    assert.deepEqual(lireNomLogement("2 pièces 4 personnes"), { chambres: null, pieces: 2 });
  });
});

describe("Travelski : annonces", () => {
  it("hébergement seul : total exact, frais de service compris, position de la fiche", () => {
    const ls = travelskiListings(atria(), FICHE, AVORIAZ);
    const l = ls.find((x) => x.id === "tsk-80136")!;
    assert.equal(l.source, "Travelski");
    assert.equal(l.title, "Pierre & Vacances Résidence Atria-Crozats — Appartement 4 personnes - 1 chambre - Balcon");
    assert.equal(l.total, 3111, "3 087 € + 24 € de frais de service");
    assert.equal(l.priceLabel, "Hébergement, 7 nuits, frais de service inclus");
    assert.deepEqual([l.capacity, l.bedrooms, l.rooms, l.propertyType], [4, 1, 2, "Résidence de Tourisme"]);
    assert.deepEqual([l.lat, l.lon], [46.193199, 6.77615]);
    assert.equal(l.skiPassIncluded, false);
    assert.equal(l.platformId, "80136");
    assert.equal(
      l.url,
      "https://www.travelski.com/residence/location/residence-pierre-vacances-atria-crozats-4-8493#packCode=HS&season=H&prest_id_source=80136&BeginDate=06/02/2027&EndDate=13/02/2027&dated=1",
    );
    assert.equal(l.proven, "Travelski live 2027-02-06→2027-02-13");
  });

  it("forfait compris : une seconde annonce du même logement ; pas de total si le groupe ne remplit pas le logement", () => {
    const ls = travelskiListings(atria(), FICHE, AVORIAZ);
    const f = ls.find((x) => x.id === "tsk-80136-forfait")!;
    assert.deepEqual([f.total, f.priceIndicative, f.skiPassIncluded], [0, null, true]);
    assert.equal(
      f.priceLabel,
      "Hébergement + Skipass : forfait 6 jours du plus petit domaine pour 4 personnes, 4 144 € hors frais de service (prix pour 2 personnes non publié)",
    );
  });

  it("forfait compris, groupe qui remplit le logement : le total est publié", () => {
    const pf = atria().offres.find((o) => o.id === "80136" && o.formule === "PF")!;
    assert.deepEqual(prixOffre(pf, { ...AVORIAZ, guests: 4 }), {
      total: 4168,
      priceLabel: "Hébergement + Skipass : forfait 6 jours du plus petit domaine pour 4 personnes, frais de service inclus",
    });
  });

  it("sans fiche, pas de position ; chambres du nom", () => {
    const tilia = RECHERCHE.residences.find((r) => r.liheId === "136708")!;
    const [l] = travelskiListings(tilia, null, AVORIAZ);
    assert.deepEqual([l.id, l.total, l.lat, l.lon, l.rooms, l.bedrooms, l.propertyType], ["tsk-922064", 2130, null, null, 2, 1, "Appartement de particulier"]);
    assert.equal(l.bedroomsSource, "derived_from_type", "« 2 pièces » dans le nom : 1 chambre tirée du type");
    assert.equal(travelskiListings(atria(), { ...FICHE!, liheId: "1" }, AVORIAZ)[0].lat, null, "la fiche d'une autre résidence ne sert pas");
  });

  it("d'autres dates, ou un logement trop petit, ne donnent rien", () => {
    assert.equal(travelskiListings(atria(), FICHE, { ...AVORIAZ, checkIn: "2027-02-13", checkOut: "2027-02-20" }).length, 0);
    assert.deepEqual(
      [...new Set(travelskiListings(atria(), FICHE, { ...AVORIAZ, guests: 6 }).map((l) => l.platformId))].sort(),
      ["229983", "80143"],
    );
  });

  it("le lien porte la formule et les dates en fragment", () => {
    const pf = atria().offres.find((o) => o.formule === "PF")!;
    assert.match(lienOffre(atria(), pf) ?? "", /#packCode=PF&season=H&prest_id_source=80136&BeginDate=06\/02\/2027&EndDate=13\/02\/2027&dated=1$/);
  });
});

describe("Travelski : couverture", () => {
  it("une station, un ensemble, ou plusieurs stations du site", () => {
    assert.deepEqual(lieuxDe("Travelski", "avoriaz"), ["station:36"]);
    assert.deepEqual(lieuxDe("Travelski", "la-plagne"), ["parentStation:4"]);
    assert.deepEqual(lieuxDe("Travelski", "les-arcs-bourg-st-maurice"), ["station:96,27,336,97,350"]);
    assert.ok(agencesDe("avoriaz").includes("Travelski"));
  });
});

describe("Travelski, prix du groupe (/wiyp/price)", () => {
  const md5 = (s: string) => createHash("md5").update(s).digest("hex");
  const atria = RECHERCHE.residences.find((r) => r.liheId === "8493")!;
  const deux = { ...AVORIAZ, guests: 2 };

  it("lit le paquet de chaque formule", () => {
    const pf = atria.offres.find((o) => o.id === "80136" && o.formule === "PF")!;
    assert.equal(pf.paquet, "83307");
  });

  it("groupe les forfaits à demander : une requête par formule et par paquet, sauf si le groupe remplit le logement", () => {
    const g2 = groupesWiyp(atria, deux);
    assert.equal(g2.length, 1);
    assert.deepEqual(g2[0]!.map((o) => o.id).sort(), ["229982", "229983", "80136", "80143"]);
    // À 4, les logements de 4 places sont au prix de la recherche : seuls ceux de 6 restent à demander.
    const g4 = groupesWiyp(atria, { ...AVORIAZ, guests: 4 });
    assert.deepEqual(g4[0]!.map((o) => o.id).sort(), ["229983", "80143"]);
  });

  it("construit la requête du site : paramètres triés, chemin = MD5 de leur JSON", () => {
    const offres = groupesWiyp(atria, deux)[0]!;
    const url = requeteWiyp(atria, offres, deux, md5)!;
    const u = new URL(url);
    assert.equal(u.origin + u.pathname.replace(/[0-9a-f]{32}$/, ""), "https://api.travelski.com/wiyp/price/");
    assert.equal(u.searchParams.get("packageId"), "83307");
    assert.equal(u.searchParams.get("prestIds"), "80136-80143-229982-229983");
    assert.equal(u.searchParams.get("familyComposition"), "18-18");
    const params = Object.fromEntries(u.searchParams);
    assert.deepEqual(Object.keys(params), [...Object.keys(params)].sort());
    assert.equal(u.pathname.split("/").pop(), md5(JSON.stringify(params)));
  });

  it("lit la réponse, et pose le prix du groupe sur l'offre forfait compris", () => {
    const prix = lireWiyp(JSON.parse(fx("travelski-wiyp-8493-pf-2ad.json")));
    assert.equal(prix.get("80136")?.vente, 3639);
    assert.equal(prix.get("80136")?.logement, 3087);
    const pf = atria.offres.find((o) => o.id === "80136" && o.formule === "PF")!;
    const groupe = new Map([[cleGroupe(pf), reponseWiyp([pf], JSON.parse(fx("travelski-wiyp-8493-pf-2ad.json")))]]);
    const avant = prixOffre(pf, deux);
    assert.equal(avant.total, 0);
    const apres = prixOffre(pf, deux, groupe);
    assert.equal(apres.total, 3639);
    assert.match(apres.priceLabel ?? "", /pour 2 personnes, frais de service inclus/);
  });

  it("un logement demandé et absent de la réponse n'est plus vendable au groupe", () => {
    const offres = groupesWiyp(atria, deux)[0]!;
    const groupe = new Map([[cleGroupe(offres[0]!), reponseWiyp(offres, JSON.parse(fx("travelski-wiyp-8493-pf-2ad.json")))]]);
    const retenues = offresRetenues(atria, deux, groupe);
    const avecForfait = retenues.filter((x) => x.forfait).map((x) => x.id);
    assert.deepEqual(avecForfait, ["80136"]);
    // L'hébergement seul des autres reste en vente.
    assert.ok(retenues.some((x) => x.id === "80143" && x.seule));
  });
});