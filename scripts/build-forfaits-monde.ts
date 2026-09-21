/**
 * Le rattachement des domaines européens à leur prix de forfait.
 *
 *     node --experimental-strip-types scripts/build-forfaits-monde.ts
 *
 * Écrit `src/lib/monde/data/forfaitsDomaines.json`.
 *
 * ## La même jointure que pour les couleurs et les photos
 *
 * `forfaits.json` range les prix par slug skiresort, le référentiel range les
 * domaines par le sien. Aucune clé commune, aucun nom comparable : reste la
 * position. La fiche la plus proche à cinq kilomètres au plus, la distance
 * écrite à côté, la fiche nommée — et un **appariement glouton**, pour qu'une
 * fiche ne serve qu'un domaine. Deux stations voisines n'ont pas le même
 * forfait, et leur en prêter un serait inventer un prix.
 *
 * ## Ce qui n'est pas recopié
 *
 * La conversion en euros que le site publie sous « env. ». Elle est dans
 * `forfaits.json`, elle y reste, et elle n'entre pas dans le rattachement :
 * un écran qui lit ce fichier doit afficher le prix dans sa devise, et
 * `devises.ts` sait le faire pour les quinze qui sortent du relevé.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");
const RAYON_KM = 5;

type Point = { lat: number; lon: number };

function km(a: Point, b: Point): number {
  const r = Math.PI / 180;
  const p1 = a.lat * r;
  const p2 = b.lat * r;
  const dp = (b.lat - a.lat) * r;
  const dl = (b.lon - a.lon) * r;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function lire<T>(nom: string): T {
  return JSON.parse(readFileSync(resolve(DATA, nom), "utf8")) as T;
}

type Montant = { brut: string; valeur: number | null; devise: string | null };
type FicheForfait = {
  slug: string;
  nom: string | null;
  libelle: string | null;
  prix: { adultes: Montant | null; jeunes: Montant | null; enfants: Montant | null } | null;
};

const forfaits = lire<{ releve: string; fiches: Record<string, FicheForfait> }>("forfaits.json");
const skiresort = lire<{ fiches: Record<string, Point & { lat: number | null; lon: number | null }> }>(
  "skiresort.json",
);

const candidates: (Point & { slug: string; f: FicheForfait })[] = [];
for (const [slug, f] of Object.entries(forfaits.fiches)) {
  if (!f.prix) continue;
  const s = skiresort.fiches[slug];
  if (!s || s.lat == null || s.lon == null) continue;
  candidates.push({ slug, f, lat: s.lat, lon: s.lon });
}

const grille = new Map<string, typeof candidates>();
for (const c of candidates) {
  const la = Math.floor(c.lat);
  const lo = Math.floor(c.lon);
  for (let dla = -1; dla <= 1; dla++) {
    for (let dlo = -1; dlo <= 1; dlo++) {
      const k = `${la + dla}|${lo + dlo}`;
      const lot = grille.get(k);
      if (lot) lot.push(c);
      else grille.set(k, [c]);
    }
  }
}

type Domaine = { id: string; lat: number; lon: number };
const domaines: Domaine[] = [];
for (const f of readdirSync(DATA).sort()) {
  if (!/^[A-Z]{2}\.json$/.test(f)) continue;
  domaines.push(...lire<Domaine[]>(f));
}

const couples: { id: string; slug: string; km: number }[] = [];
for (const d of domaines) {
  const lot = grille.get(`${Math.floor(d.lat)}|${Math.floor(d.lon)}`);
  if (!lot) continue;
  for (const c of lot) {
    const dist = km(d, c);
    if (dist <= RAYON_KM) couples.push({ id: d.id, slug: c.slug, km: dist });
  }
}
couples.sort((a, b) => a.km - b.km);

type Rattachement = {
  slug: string;
  nom: string | null;
  km: number;
  libelle: string | null;
  adultes: Montant | null;
  jeunes: Montant | null;
  enfants: Montant | null;
};

const parDomaine: Record<string, Rattachement> = {};
const pris = new Set<string>();
const parSlug = new Map(candidates.map((c) => [c.slug, c]));

for (const c of couples) {
  if (parDomaine[c.id] || pris.has(c.slug)) continue;
  const f = parSlug.get(c.slug)?.f;
  if (!f?.prix) continue;
  parDomaine[c.id] = {
    slug: c.slug,
    nom: f.nom,
    km: Math.round(c.km * 100) / 100,
    libelle: f.libelle,
    adultes: f.prix.adultes,
    jeunes: f.prix.jeunes,
    enfants: f.prix.enfants,
  };
  pris.add(c.slug);
}

const devises = new Map<string, number>();
for (const r of Object.values(parDomaine)) {
  const d = r.adultes?.devise;
  if (d) devises.set(d, (devises.get(d) ?? 0) + 1);
}

writeFileSync(
  resolve(DATA, "forfaitsDomaines.json"),
  JSON.stringify(
    {
      calcule: new Date().toISOString().slice(0, 10),
      quoi: "rattachement, par la position, des domaines du référentiel aux prix de forfait publiés par skiresort.fr",
      regle: `la fiche la plus proche à ${RAYON_KM} km au plus, appariement glouton : une fiche ne sert qu'un domaine`,
      rayonKm: RAYON_KM,
      releve: forfaits.releve,
      domaines: domaines.length,
      rattaches: Object.keys(parDomaine).length,
      avertissement:
        "le montant est dans la devise du pays ; il ne doit pas être converti. La conversion « env. € » que le site publie reste dans forfaits.json et n'est pas un prix.",
      forfaits: parDomaine,
    },
    null,
    1,
  ) + "\n",
  "utf8",
);

const n = Object.keys(parDomaine).length;
console.log(`Domaines du référentiel  : ${domaines.length}`);
console.log(`Fiches avec un prix      : ${candidates.length}`);
console.log(`Rattachés                : ${n}   ${((n / domaines.length) * 100).toFixed(1)} %`);
const d = Object.values(parDomaine).map((r) => r.km).sort((a, b) => a - b);
if (d.length) console.log(`Distance médiane         : ${d[Math.floor(d.length / 2)]?.toFixed(2)} km`);
console.log(`Devises                  : ${devises.size}`);
for (const [k, v] of [...devises].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${k}  ${v}`);
