import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CLASSEUR_REALIGNED, domaineNomme, UNNAMED_DOMAIN } from "./classeur.ts";
import { stationsVoisines } from "./domaineStations.ts";
import { photoCreditFor } from "./photoCredits.ts";
import { photoCoverage, resolveStationPhoto } from "./stationPhoto.ts";
import { stationFiche } from "./fiche.ts";
import { STATIONS } from "./stations.ts";

describe("fiche détaillée", () => {
  it("2 Alpes : 96 pistes, 19/49/18/15 %, 220 km, plus longue 16 km", () => {
    const s = STATIONS.find((x) => x.id === "les-2-alpes")!;
    const f = stationFiche(s);
    assert.equal(f.n, 96);
    assert.equal(f.km, 220);
    assert.equal(f.longestKm, 16);
    assert.deepEqual(
      f.mix.map((r) => [r.color, r.n, r.pct]),
      [
        ["green", 18, 19],
        ["blue", 47, 49],
        ["red", 17, 18],
        ["black", 14, 15],
      ],
    );
    assert.equal(
      f.mix.reduce((n, r) => n + r.n, 0),
      96,
    );
    assert.ok(f.skiinfoUrl?.includes("/les-2-alpes/plans-des-pistes"));
    assert.equal(f.grain, "station");
    assert.equal(f.glacier, true);
  });

  it("chaque station FR a une fiche : GPS toujours, IGN pour le dépôt", () => {
    // 313 jusqu'au 5 octobre 2026 ; depuis, une station est une fiche Skiinfo
    // (`villages.ts`) : 230 du dépôt, plus Sollières-Sardières, et Val d'Ese et
    // Haut Asco, gardées sans fiche par le propriétaire.
    assert.equal(STATIONS.length, 233);
    for (const s of STATIONS) {
      const f = stationFiche(s);
      assert.equal(f.id, s.id);
      assert.ok(f.lat && f.lon, s.id);
      // L’altitude IGN au pin n’existe que pour le référentiel du dépôt.
      if (s.origin === "depot") assert.ok(f.demM != null, s.id);
      else assert.equal(f.demM, null, s.id);
      if (f.hasMix) {
        assert.equal(
          f.mix.reduce((n, r) => n + r.n, 0),
          f.n,
          s.id,
        );
        assert.ok(f.n > 0, s.id);
      }
    }
  });

  it("Oz : mix Skiinfo 135 pistes / 250 km, pin Poutran pas Pic Blanc", () => {
    const f = stationFiche(STATIONS.find((x) => x.id === "oz-en-oisans")!);
    assert.equal(f.n, 135);
    assert.equal(f.km, 250);
    assert.equal(f.villageM, 1333);
    assert.equal(f.maxM, 3330);
  });
});

describe("échelle des chiffres : un domaine, un jeu de chiffres", () => {
  it("toutes les stations d'un domaine nommé portent les mêmes km, remontées et tronçons", () => {
    const byDomain = new Map<string, typeof STATIONS>();
    for (const s of STATIONS) {
      if (!s.domain || s.domain === UNNAMED_DOMAIN) continue;
      const rows = byDomain.get(s.domain) ?? [];
      rows.push(s);
      byDomain.set(s.domain, rows);
    }
    // Les villages rattachés et les lignes sans fiche ne sont plus des
    // stations : 140 domaines nommés restent.
    assert.ok(byDomain.size >= 140, `${byDomain.size} domaines nommés`);
    const divergents: string[] = [];
    for (const [domain, rows] of byDomain) {
      const signatures = new Set(
        rows.map((s) => [s.pistesKm, s.lifts, s.segments, JSON.stringify(s.colorShare)].join("|")),
      );
      if (signatures.size > 1)
        divergents.push(`${domain} (${rows.length} stations, ${signatures.size} jeux)`);
    }
    assert.deepEqual(divergents, []);
  });

  it("le libellé sans nom est la seule exemption, et ce n'est pas un domaine partagé", () => {
    // Deux domaines distincts qu'OpenSkiMap ne nomme pas portent ce libellé
    // (trois avant que Névache, sans fiche Skiinfo, ne sorte le 5 octobre
    // 2026). Leurs mesures diffèrent légitimement : 1,4 / 0,2 km.
    const rows = STATIONS.filter((s) => s.domain === UNNAMED_DOMAIN);
    assert.equal(rows.length, 2);
    assert.equal(new Set(rows.map((s) => s.pistesKm)).size, 2);
  });

  it("les six rattachements corrigés ont emporté leurs chiffres", () => {
    // Trois par `DOMAIN_FIXES`, trois par `DOMAINES_CORRIGES` depuis le
    // 26 septembre 2026 : La Bourboule détachée, Lispach et Xonrupt rendues à
    // leur zone OpenSkiMap.
    assert.deepEqual(CLASSEUR_REALIGNED, [
      "Auris en Oisans : Les Deux Alpes → Alpe d'Huez Grand Domaine",
      "Orelle : Galibier-Thabor → Les Trois Vallées",
      "Samoens : Portes du Soleil (versant français) → Le Grand Massif",
      "La Bourboule : Super Besse → sans domaine",
      "Lispach - La Bresse : Gérardmer → La Bresse - Lispach",
      "Xonrupt Longemer : La Bresse - Lispach → Xonrupt-Longemer",
    ]);
    const orelle = STATIONS.find((s) => s.id === "orelle")!;
    const valtho = STATIONS.find((s) => s.id === "val-thorens")!;
    assert.equal(orelle.domain, "Les Trois Vallées");
    assert.equal(orelle.pistesKm, valtho.pistesKm);
    assert.equal(orelle.lifts, valtho.lifts);
    // Samoëns portait les 493,7 km des Portes du Soleil sous l'étiquette
    // Grand Massif : il porte maintenant les 385 km du Grand Massif.
    const samoens = STATIONS.find((s) => s.id === "samoens")!;
    const flaine = STATIONS.find((s) => s.id === "flaine")!;
    assert.equal(samoens.pistesKm, flaine.pistesKm);
    assert.equal(samoens.lifts, flaine.lifts);
    // Lispach affichait les 22,8 km et 18 remontées de Gérardmer, Xonrupt les
    // 3,3 km de Lispach.
    const lispach = STATIONS.find((s) => s.id === "la-bresse-lispach")!;
    const xonrupt = STATIONS.find((s) => s.id === "xonrupt-le-poli")!;
    const gerardmer = STATIONS.find((s) => s.id === "gerardmer")!;
    assert.equal(lispach.domain, "La Bresse - Lispach");
    assert.equal(lispach.pistesKm, 3.3);
    assert.equal(lispach.lifts, 5);
    assert.equal(xonrupt.domain, "Xonrupt-Longemer");
    assert.equal(xonrupt.pistesKm, 1.5);
    assert.equal(xonrupt.lifts, 2);
    assert.equal(gerardmer.domain, "Gérardmer");
    assert.equal(gerardmer.pistesKm, 22.8);
    // Gérardmer et Lispach ne sont pas voisines.
    assert.deepEqual(stationsVoisines("gerardmer"), []);
    assert.deepEqual(stationsVoisines("la-bresse-lispach"), []);
    // La Bourboule, sans fiche Skiinfo, est sortie du référentiel le
    // 5 octobre 2026 ; Le Mont-Dore a pour seule voisine Super Besse.
    assert.equal(
      STATIONS.find((s) => s.id === "la-bourboule"),
      undefined,
    );
    assert.deepEqual(
      stationsVoisines("le-mont-dore").map((s) => s.id),
      ["besse-super-besse"],
    );
  });

  it("l'altitude du village reste propre à la station", () => {
    // Huit stations à fiche Skiinfo depuis le 5 octobre 2026 : les villages
    // (Courchevel 1650, Méribel-Mottaret…) sont rattachés à la leur.
    const trois = STATIONS.filter((s) => s.domain === "Les Trois Vallées");
    assert.equal(trois.length, 8);
    // Même domaine, altitudes de village distinctes : c'est l'autre moitié de
    // la règle d'échelle.
    assert.ok(new Set(trois.map((s) => s.villageM)).size > 5);
  });
});

describe("photo de station : la sienne, celle de son domaine, ou rien", () => {
  it("230 photos propres, aucune empruntée, 3 sans photo", () => {
    // Jusqu'au 26 septembre 2026 : 72 empruntées et 19 sans photo, sur 320.
    // Quatre doublons écartés empruntaient la photo de leur station (Sainte-Foy
    // Station, Saint-Pancrace, « Praloup » celle du Sauze, Espace Aubrac) ;
    // Lus-la-Croix-Haute, sans photo, est devenue Lus la Jarjatte, qui a la
    // sienne. Névache et La Bourboule n'empruntent plus : l'une n'a pas de
    // domaine nommé, l'autre plus de domaine du tout. Aucune image n'a changé.
    // Le 30 septembre, Le Grand Puy, fermé, est sorti : sa photo propre
    // (`le-grand-puy`) et sa ligne sans photo (`seyne-les-alpes`) avec lui.
    // Le 5 octobre, une station devient une fiche Skiinfo (`villages.ts`) :
    // les 66 qui empruntaient étaient des villages ou des lignes sans fiche,
    // qui ne sont plus des stations. Restent sans photo Larche et Le Chazelet
    // (URL morte), et Sollières-Sardières, ajoutée sans photo. Val d'Ese et
    // Haut Asco, ajoutées le même jour, ont la photo que le propriétaire a
    // choisie (`STATIONS_AJOUTEES`).
    const c = photoCoverage();
    assert.equal(c.total, 233);
    assert.equal(c.propres, 230);
    assert.equal(c.empruntees, 0);
    assert.deepEqual(c.absentes, ["larche", "le-chazelet", "sollieres-sardieres"]);
  });

  it("aucun chemin distant : que des fichiers locaux", () => {
    for (const s of STATIONS) {
      const p = resolveStationPhoto(s.id);
      if (!p) continue;
      assert.ok(p.src.startsWith("/stations/"), `${s.id} : ${p.src}`);
      assert.ok(!p.src.includes("http"), `${s.id} : ${p.src}`);
    }
  });

  it("Aime 2000 est La Plagne : sa photo est celle de sa station, pas un emprunt", () => {
    // Aime 2000 empruntait la photo de La Plagne, « même domaine ». Depuis le
    // 5 octobre 2026 c'est un village de La Plagne (`villages.ts`) : son
    // identifiant ouvre La Plagne, avec sa photo à elle.
    const p = resolveStationPhoto("aime-2000")!;
    assert.equal(p.src, "/stations/la-plagne.jpg");
    assert.equal(p.fromId, null);
    assert.equal(photoCreditFor("aime-2000")!.borrowedFrom, null);
  });

  it("hors relevé Skiinfo, la photo choisie et le crédit de son hôte", () => {
    assert.equal(resolveStationPhoto("haut-asco")!.src, "/stations/haut-asco.jpg");
    assert.equal(photoCreditFor("haut-asco")!.label, "Photo France 3 Corse ViaStella");
    assert.equal(resolveStationPhoto("val-d-ese")!.src, "/stations/val-d-ese.jpg");
    assert.equal(photoCreditFor("val-d-ese")!.label, "Photo Ajaccio Tourisme");
  });

  it("une station qui a sa photo ne l'emprunte pas, et son crédit ne mentionne rien", () => {
    const p = resolveStationPhoto("val-thorens")!;
    assert.equal(p.src, "/stations/val-thorens.jpg");
    assert.equal(p.fromId, null);
    assert.equal(photoCreditFor("val-thorens")!.borrowedFrom, null);
  });

  it("le libellé sans nom ne prête pas de photo", () => {
    // Névache empruntait la photo de Saint-Colomban-des-Villards, « même
    // domaine » : les deux ne portaient que le libellé qu'OpenSkiMap donne aux
    // zones sans nom. Névache, sans fiche Skiinfo, est sortie le 5 octobre
    // 2026 ; Saint-Colomban garde la sienne.
    assert.equal(resolveStationPhoto("nevache"), null);
    assert.equal(resolveStationPhoto("saint-colomban-villards")!.fromId, null);
  });

  it("les voisines sont celles du grand domaine relié, pas du libellé", () => {
    assert.equal(domaineNomme(UNNAMED_DOMAIN), false);
    assert.equal(domaineNomme(null), false);
    assert.equal(domaineNomme(""), false);
    assert.equal(domaineNomme("Les Trois Vallées"), true);
    // Beille et Saint-Colomban se proposaient l'une l'autre dans le menu
    // « Plus », à 471 km, par le libellé sans nom. Depuis le 5 octobre 2026,
    // les voisines se lisent dans la table des grands domaines reliés
    // (`grandsDomaines.ts`) : Beille n'en a pas, Saint-Colomban a les Sybelles.
    assert.deepEqual(stationsVoisines("plateau-de-beille"), []);
    const sybelles = stationsVoisines("saint-colomban-villards").map((s) => s.id);
    assert.ok(sybelles.includes("la-toussuire"));
    assert.ok(!sybelles.includes("plateau-de-beille"));
    assert.ok(stationsVoisines("val-thorens").some((s) => s.id === "courchevel"));
    // Un village se lit sous sa station : Méribel-Mottaret a les voisines de
    // Méribel, et Méribel n'est pas sa propre voisine.
    const mottaret = stationsVoisines("meribel-mottaret").map((s) => s.id);
    assert.ok(mottaret.includes("courchevel"));
    assert.ok(!mottaret.includes("meribel"));
  });

  it("sans domaine donneur, rien n'est affiché ni crédité", () => {
    // Larche et Le Chazelet ont une URL distante qui ne répond plus, et aucun
    // domaine : elles restent sans photo, ce que l'écran énonce.
    assert.equal(resolveStationPhoto("larche"), null);
    assert.equal(photoCreditFor("larche"), null);
  });
});
