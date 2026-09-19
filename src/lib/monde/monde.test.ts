/**
 * Ce que le référentiel mondial doit tenir.
 *
 * Trois familles de contrôles, et une intention derrière chacune :
 *
 * 1. **L'index ne ment pas.** Il est importé statiquement par des écrans qui
 *    n'ouvriront jamais le fichier du pays : s'il annonce 381 domaines pour
 *    l'Autriche, le fichier autrichien en a 381.
 * 2. **Le seuil a tenu.** Chaque domaine écrit est mesuré. Un référentiel qui
 *    laisserait passer un domaine sans relevé ferait mentir tous les seuils des
 *    écrans, puisqu'une absence y serait comptée comme un zéro.
 * 3. **Les domaines frontaliers sortent des deux côtés**, sans être écrits deux
 *    fois. C'est le seul endroit où une même station appartient à deux pays, et
 *    la seule façon de s'en assurer est de la demander depuis les deux.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { cadreValide, CONTINENTS, type Cadre, type ContinentId } from "../geo/continents.ts";
import { PAYS, paysByCode } from "../geo/pays.ts";
import {
  cadrePays,
  domainesPays,
  domainesPaysMulti,
  DOMAINES_MONDE,
  indexPays,
  PAYS_AVEC_DOMAINES,
  paysSansFiche,
  RELEVE_MONDE,
  SANS_PAYS,
  type DomaineMonde,
} from "./monde.ts";
import INDEX from "./data/index.json" with { type: "json" };

const DOSSIER = new URL("./data/", import.meta.url);

function fichiersPays(): string[] {
  return readdirSync(DOSSIER)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => f.slice(0, -5))
    .sort();
}

function brut(cc: string): Record<string, unknown>[] {
  return JSON.parse(readFileSync(new URL(`${cc}.json`, DOSSIER), "utf8"));
}

test("l'index couvre exactement les fichiers présents", () => {
  assert.deepEqual(PAYS_AVEC_DOMAINES, fichiersPays());
});

test("l'index compte juste, pays par pays et au total", () => {
  let total = 0;
  for (const cc of PAYS_AVEC_DOMAINES) {
    const attendu = indexPays(cc)?.domaines;
    assert.equal(brut(cc).length, attendu, `${cc} : l'index annonce ${attendu}`);
    total += attendu ?? 0;
  }
  assert.equal(total, DOMAINES_MONDE);
  assert.equal(total, 5720);
});

test("le relevé est daté, et le seuil écrit", () => {
  assert.match(RELEVE_MONDE, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(INDEX.seuil, "en exploitation, et mesuré");
  // Trois domaines qu'OpenSkiMap ne rattache à aucun pays : écartés, et comptés
  // pour que l'absence se voie plutôt qu'elle ne se devine.
  assert.equal(SANS_PAYS, 3);
});

test("chaque identifiant est unique, et porte son pays hôte", () => {
  const vus = new Map<string, string>();
  for (const cc of PAYS_AVEC_DOMAINES) {
    for (const d of brut(cc)) {
      const id = d.id as string;
      const ailleurs = vus.get(id);
      assert.equal(ailleurs, undefined, `${id} est écrit deux fois : ${ailleurs} et ${cc}`);
      vus.set(id, cc);
      assert.ok(id.startsWith(`${cc.toLowerCase()}-`), `${id} n'est pas préfixé par ${cc}`);
    }
  }
  assert.equal(vus.size, DOMAINES_MONDE);
});

test("tout domaine écrit est mesuré : le seuil a tenu", async () => {
  for (const cc of PAYS_AVEC_DOMAINES) {
    for (const d of await domainesPays(cc)) {
      if (!d.pays.includes(cc)) continue;
      assert.equal(typeof d.km, "number", `${d.id} : km non relevé`);
      assert.equal(typeof d.n, "number", `${d.id} : tronçons non relevés`);
      assert.equal(typeof d.lifts, "number", `${d.id} : remontées non relevées`);
      assert.ok(Number.isFinite(d.lat) && Number.isFinite(d.lon), `${d.id} : sans position`);
    }
  }
});

test("une clé absente se lit `null`, jamais `undefined` ni zéro", async () => {
  const at = await domainesPays("AT");
  // L'Autriche porte 101 localités sur 420 domaines : le cas « absent » y est
  // abondant, ce qui en fait le bon échantillon.
  const sans = at.filter((d) => d.localite === null);
  assert.ok(sans.length > 0);
  for (const d of at) {
    for (const k of ["region", "localite", "wikidata", "minM", "maxM"] as const) {
      assert.notEqual(d[k], undefined, `${d.id} : ${k} vaut undefined`);
    }
    assert.ok(Array.isArray(d.sites));
    assert.ok(Array.isArray(d.sources));
  }
});

test("un domaine frontalier sort des deux pays, sans être écrit deux fois", async () => {
  for (const p of INDEX.partages) {
    assert.ok(p.pays.length > 1, `${p.id} est rangé dans les partages sans second pays`);
    for (const cc of p.pays) {
      const ids = (await domainesPays(cc)).map((d) => d.id);
      assert.ok(ids.includes(p.id), `${p.id} manque à ${cc}`);
    }
  }
  assert.equal(INDEX.partages.length, 68);
});

test("Les Portes du Soleil sortent sous France comme sous Suisse", async () => {
  const fr = await domainesPays("FR");
  const ch = await domainesPays("CH");
  const id = "fr-les-portes-du-soleil";
  assert.ok(fr.some((d) => d.id === id));
  assert.ok(ch.some((d) => d.id === id));
  // Écrit une seule fois : c'est le fichier français qui le porte.
  assert.equal(brut("CH").some((d) => d.id === id), false);
});

test("plusieurs pays d'un coup ne rendent jamais deux fois le même domaine", async () => {
  const lot = await domainesPaysMulti(["FR", "CH", "IT", "FR"]);
  const ids = lot.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  const fr = await domainesPays("FR");
  assert.ok(lot.length >= fr.length);
});

test("un code inconnu rend un tableau vide, et non une erreur", async () => {
  assert.deepEqual(await domainesPays("ZZ"), []);
  assert.deepEqual(await domainesPays("xx"), []);
});

test("l'Antarctique est dans le référentiel, et hors du choix par continent", async () => {
  // `Kiwi Ski Hill`, un téléski en exploitation près de McMurdo, passe le seuil
  // comme n'importe quel domaine mesuré : le référentiel ne l'écarte pas, parce
  // qu'il est là. Mais `continents.ts` a délibérément posé six continents sans
  // l'Antarctique, et aucun onglet n'y mène donc.
  //
  // Les deux décisions sont justes et se contredisent. Le test les tient
  // ensemble plutôt que d'en cacher une : le jour où un écran listera « tous
  // les pays », il devra dire ce qu'il fait de celui-là.
  const aq = await domainesPays("AQ");
  assert.equal(aq.length, 1);
  assert.equal(aq[0].id, "aq-kiwi-ski-hill");
  assert.equal(CONTINENTS.some((c) => c.id === ("antarctique" as ContinentId)), false);
  assert.ok(paysSansFiche().includes("AQ"));
});

test("le cadrage d'un pays contient ses stations", async () => {
  for (const cc of PAYS_AVEC_DOMAINES) {
    const cadre = cadrePays(cc) as Cadre;
    assert.ok(cadre, `${cc} : pas de cadrage`);
    assert.ok(cadreValide(cadre), `${cc} : cadrage invalide ${JSON.stringify(cadre)}`);
    const [ouest, sud, est, nord] = cadre;
    for (const d of await domainesPays(cc)) {
      if (!d.pays.includes(cc) || d.pays[0] !== cc) continue;
      assert.ok(
        d.lon >= ouest && d.lon <= est && d.lat >= sud && d.lat <= nord,
        `${d.id} tombe hors du cadrage de ${cc}`,
      );
    }
  }
});

test("le cadrage des stations l'emporte sur celui des frontières", () => {
  // `geo/pays.ts` le dit de lui-même : cadrer l'Australie sur ses frontières
  // montre Perth pour atteindre trois stations de Nouvelle-Galles du Sud.
  const frontiere = paysByCode("AU")?.cadre as Cadre;
  const stations = cadrePays("AU") as Cadre;
  assert.notDeepEqual(stations, frontiere);
  assert.ok(stations[2] - stations[0] < frontiere[2] - frontiere[0]);
});

test("aucun pays décrit par geo/pays.ts n'est vide", () => {
  // La liste de `pays.ts` se disait provisoire, à confronter au référentiel.
  // Ce sens-là est net : les 44 pays décrits portent tous des domaines retenus.
  const vides = PAYS.filter((p) => !indexPays(p.code));
  assert.deepEqual(vides.map((p) => p.code), []);
});

test("les pays que geo/pays.ts ignore sont comptés, et ne se multiplient pas", () => {
  // L'autre sens ne l'est pas : 29 pays du référentiel n'ont encore ni devise,
  // ni fuseau, ni continent. Le nombre est écrit ici pour qu'il descende, et
  // pour qu'aucun relevé ne le fasse monter en silence.
  const manquants = paysSansFiche();
  assert.ok(manquants.length <= 29, `${manquants.length} pays sans fiche : ${manquants.join(" ")}`);
  for (const cc of manquants) assert.equal(paysByCode(cc), undefined);
});

test("les identifiants tiennent d'un relevé au suivant", () => {
  // La clé est construite : pays, puis nom replié. Elle ne reprend jamais l'`id`
  // d'OpenSkiMap, qui est un condensé du contenu et change dès qu'une piste
  // bouge. Deux domaines connus servent de témoins.
  const it = brut("IT").map((d) => d.id as string);
  assert.ok(it.includes("it-cortina-d-ampezzo"), "Cortina d'Ampezzo a changé de clé");
  const jp = brut("JP").map((d) => d.id as string);
  assert.ok(jp.some((id: string) => id.startsWith("jp-")));
});

test("les sources de chaque domaine sont celles que le schéma admet", async () => {
  const vus = new Set<string>();
  for (const cc of ["FR", "US", "JP", "AT"]) {
    for (const d of await domainesPays(cc)) {
      for (const s of d.sources) {
        assert.ok(
          s.type === "openstreetmap" || s.type === "skimap.org",
          `${d.id} : source « ${s.type} » hors schéma`,
        );
        vus.add(s.type);
      }
    }
  }
  assert.deepEqual([...vus].sort(), ["openstreetmap", "skimap.org"]);
});

test("aucun domaine n'est rangé sous un pays qu'il ne porte pas", async () => {
  const echantillon: DomaineMonde[] = await domainesPays("CH");
  for (const d of echantillon) assert.ok(d.pays.includes("CH"));
});
