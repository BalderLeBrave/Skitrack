import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CLASSEUR_REALIGNED, UNNAMED_DOMAIN } from "./classeur.ts";
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
    assert.equal(STATIONS.length, 320);
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

  it("les trois rattachements corrigés ont emporté leurs chiffres", () => {
    assert.equal(CLASSEUR_REALIGNED.length, 3);
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
  it("229 photos propres, 72 empruntées au domaine, 19 sans photo", () => {
    const c = photoCoverage();
    assert.equal(c.total, 320);
    assert.equal(c.propres, 229);
    assert.equal(c.empruntees, 72);
    assert.equal(c.absentes.length, 19);
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

  it("sans domaine donneur, rien n'est affiché ni crédité", () => {
    // Larche et Le Chazelet ont une URL distante qui ne répond plus, et aucun
    // domaine : elles restent sans photo, ce que l'écran énonce.
    assert.equal(resolveStationPhoto("larche"), null);
    assert.equal(photoCreditFor("larche"), null);
  });
});
