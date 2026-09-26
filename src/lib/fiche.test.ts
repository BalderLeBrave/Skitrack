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
    assert.equal(STATIONS.length, 315);
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
    assert.ok(byDomain.size > 140, `${byDomain.size} domaines nommés`);
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
    // Trois domaines distincts qu'OpenSkiMap ne nomme pas portent ce libellé.
    // Leurs mesures diffèrent légitimement : 1,4 / 0,4 / 0,2 km.
    const rows = STATIONS.filter((s) => s.domain === UNNAMED_DOMAIN);
    assert.equal(rows.length, 3);
    assert.equal(new Set(rows.map((s) => s.pistesKm)).size, 3);
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
    // Gérardmer et Lispach ne sont plus voisines de domaine.
    assert.deepEqual(stationsVoisines("gerardmer", gerardmer.domain), []);
    assert.deepEqual(stationsVoisines("la-bresse-lispach", lispach.domain), []);
    // La Bourboule n'a plus de domaine, ni donc de voisines.
    const bourboule = STATIONS.find((s) => s.id === "la-bourboule")!;
    assert.equal(bourboule.domain, null);
    assert.equal(bourboule.pistesKm, null);
    assert.equal(bourboule.lifts, null);
    assert.deepEqual(stationsVoisines("la-bourboule", bourboule.domain), []);
    const mont = STATIONS.find((s) => s.id === "le-mont-dore")!;
    assert.ok(!stationsVoisines("le-mont-dore", mont.domain).some((s) => s.id === "la-bourboule"));
  });

  it("l'altitude du village reste propre à la station", () => {
    const trois = STATIONS.filter((s) => s.domain === "Les Trois Vallées");
    assert.ok(trois.length >= 14);
    // Même domaine, altitudes de village distinctes : c'est l'autre moitié de
    // la règle d'échelle.
    assert.ok(new Set(trois.map((s) => s.villageM)).size > 5);
  });
});

describe("photo de station : la sienne, celle de son domaine, ou rien", () => {
  it("229 photos propres, 66 empruntées au domaine, 20 sans photo", () => {
    // Jusqu'au 26 septembre 2026 : 72 empruntées et 19 sans photo, sur 320.
    // Quatre doublons écartés empruntaient la photo de leur station (Sainte-Foy
    // Station, Saint-Pancrace, « Praloup » celle du Sauze, Espace Aubrac) ;
    // Lus-la-Croix-Haute, sans photo, est devenue Lus la Jarjatte, qui a la
    // sienne. Névache et La Bourboule n'empruntent plus : l'une n'a pas de
    // domaine nommé, l'autre plus de domaine du tout. Aucune image n'a changé.
    const c = photoCoverage();
    assert.equal(c.total, 315);
    assert.equal(c.propres, 229);
    assert.equal(c.empruntees, 66);
    assert.equal(c.absentes.length, 20);
    assert.ok(c.absentes.includes("nevache"));
    assert.ok(c.absentes.includes("la-bourboule"));
  });

  it("aucun chemin distant : que des fichiers locaux", () => {
    for (const s of STATIONS) {
      const p = resolveStationPhoto(s.id);
      if (!p) continue;
      assert.ok(p.src.startsWith("/stations/"), `${s.id} : ${p.src}`);
      assert.ok(!p.src.includes("http"), `${s.id} : ${p.src}`);
    }
  });

  it("Aime 2000 emprunte La Plagne, son domaine, et le crédit le dit", () => {
    const p = resolveStationPhoto("aime-2000")!;
    assert.equal(p.src, "/stations/la-plagne.jpg");
    assert.equal(p.fromId, "la-plagne");
    assert.equal(p.domain, "Paradiski (Les Arcs – La Plagne)");
    assert.match(photoCreditFor("aime-2000")!.label, /La Plagne, même domaine/);
  });

  it("une station qui a sa photo ne l'emprunte pas, et son crédit ne mentionne rien", () => {
    const p = resolveStationPhoto("val-thorens")!;
    assert.equal(p.src, "/stations/val-thorens.jpg");
    assert.equal(p.fromId, null);
    assert.equal(photoCreditFor("val-thorens")!.borrowedFrom, null);
  });

  it("le libellé sans nom ne prête pas de photo : Névache n'est pas Saint-Colomban", () => {
    // Névache (Hautes-Alpes) empruntait la photo de Saint-Colomban-des-Villards
    // (Savoie, 44 km), « même domaine » : les deux portent seulement le libellé
    // qu'OpenSkiMap donne aux zones sans nom.
    assert.equal(STATIONS.find((s) => s.id === "nevache")!.domain, UNNAMED_DOMAIN);
    assert.equal(resolveStationPhoto("nevache"), null);
    assert.equal(photoCreditFor("nevache"), null);
    // Saint-Colomban garde la sienne.
    assert.equal(resolveStationPhoto("saint-colomban-villards")!.fromId, null);
  });

  it("le libellé sans nom ne fait pas de voisines", () => {
    assert.equal(domaineNomme(UNNAMED_DOMAIN), false);
    assert.equal(domaineNomme(null), false);
    assert.equal(domaineNomme(""), false);
    assert.equal(domaineNomme("Les Trois Vallées"), true);
    // Beille, Névache et Saint-Colomban se proposaient l'une l'autre dans le
    // menu « Plus », de 44 à 471 km.
    for (const id of ["plateau-de-beille", "nevache", "saint-colomban-villards"]) {
      assert.deepEqual(stationsVoisines(id, UNNAMED_DOMAIN), [], id);
    }
    // Un vrai domaine en garde.
    const vt = STATIONS.find((s) => s.id === "val-thorens")!;
    assert.ok(stationsVoisines("val-thorens", vt.domain).some((s) => s.id === "courchevel"));
  });

  it("sans domaine donneur, rien n'est affiché ni crédité", () => {
    // Larche et Le Chazelet ont une URL distante qui ne répond plus, et aucun
    // domaine : elles restent sans photo, ce que l'écran énonce.
    assert.equal(resolveStationPhoto("larche"), null);
    assert.equal(photoCreditFor("larche"), null);
  });
});
