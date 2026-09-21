/**
 * Le rattachement des domaines européens à leur photo Skiinfo.
 *
 *     node --experimental-strip-types scripts/build-photos-monde.ts
 *
 * Écrit `src/lib/monde/data/photosDomaines.json`.
 *
 * ## Pourquoi une jointure, encore
 *
 * `photos.json` range les adresses par slug Skiinfo — `valais/zermatt` — et le
 * référentiel range les domaines par le sien — `ch-zermatt`. Aucune clé n'est
 * commune, et les noms ne se comparent pas davantage que pour les couleurs.
 * Reste la position, et la règle est donc la même que celle de
 * `build-couleurs-monde.ts` : la fiche la plus proche à cinq kilomètres au
 * plus, la distance écrite à côté, la fiche nommée.
 *
 * Une fiche Skiinfo ne sert **qu'une fois** : deux domaines voisins ne
 * partagent pas une photo. Le plus proche l'emporte, l'autre n'en a pas — ce
 * qui est la vérité, et non un manque à combler.
 *
 * ## Les hôtes, et ce qu'on en sait
 *
 * Deux hôtes servent ces images :
 *
 * - `cdn.bfldr.com` — 1 315 photos. Vérifié le 21 septembre 2026 : répond 200,
 *   et **accepte les transformations**. La même image pèse 2 157 ko en PNG,
 *   312 ko en WebP, 61 ko en WebP à 640 px de large. C'est `photos.ts` qui
 *   applique la transformation à l'affichage ; le relevé garde l'adresse
 *   publiée, sans retouche.
 * - `img1` à `img5.onthesnow.com` — 52 photos. **Ne répondent pas** : le
 *   chemin `/image/…` reste sans réponse jusqu'au délai, en HTTPS comme en
 *   HTTP, alors que la racine du même hôte rend un 404 normal. Ces adresses
 *   sont conservées telles que le site les publie, et marquées : un écran qui
 *   les affiche verra une image cassée, ce qui est pire qu'une absence
 *   assumée.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");
const RAYON_KM = 5;

/** Les hôtes dont on a vérifié qu'ils servent l'image. */
const HOTES_SERVANTS = new Set(["cdn.bfldr.com"]);

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

type FichePhoto = { cle: string; nom: string | null; photo: string | null };
type FicheSkiinfo = { slug: string; lat: number | null; lon: number | null };

const photos = lire<{ releve: string; fiches: Record<string, FichePhoto> }>("photos.json");
const skiinfo = lire<{ fiches: Record<string, FicheSkiinfo & Point> }>("skiinfo.json");

/** Les fiches qui portent **et** une photo **et** un point. */
const candidates: { cle: string; nom: string | null; photo: string; lat: number; lon: number }[] =
  [];
for (const [cle, p] of Object.entries(photos.fiches)) {
  if (!p.photo) continue;
  const s = skiinfo.fiches[cle];
  if (!s || s.lat == null || s.lon == null) continue;
  candidates.push({ cle, nom: p.nom, photo: p.photo, lat: s.lat, lon: s.lon });
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

type Domaine = { id: string; nom: string; lat: number; lon: number };

const domaines: Domaine[] = [];
const { readdirSync } = await import("node:fs");
for (const f of readdirSync(DATA).sort()) {
  if (!/^[A-Z]{2}\.json$/.test(f)) continue;
  domaines.push(...lire<Domaine[]>(f));
}

/**
 * Chaque domaine prend la fiche la plus proche, et chaque fiche ne sert qu'une
 * fois.
 *
 * On classe donc tous les couples possibles par distance croissante, et on les
 * prend dans cet ordre : c'est l'appariement glouton, qui donne à chaque fiche
 * le domaine dont elle est le plus proche, et non le premier venu.
 */
const couples: { id: string; cle: string; km: number }[] = [];
for (const d of domaines) {
  const lot = grille.get(`${Math.floor(d.lat)}|${Math.floor(d.lon)}`);
  if (!lot) continue;
  for (const c of lot) {
    const dist = km(d, c);
    if (dist <= RAYON_KM) couples.push({ id: d.id, cle: c.cle, km: dist });
  }
}
couples.sort((a, b) => a.km - b.km);

type Rattachement = { cle: string; nom: string | null; km: number; url: string; servi: boolean };

const parDomaine: Record<string, Rattachement> = {};
const clesPrises = new Set<string>();
const parCle = new Map(candidates.map((c) => [c.cle, c]));

for (const c of couples) {
  if (parDomaine[c.id] || clesPrises.has(c.cle)) continue;
  const fiche = parCle.get(c.cle);
  if (!fiche) continue;
  let hote = "";
  try {
    hote = new URL(fiche.photo).host;
  } catch {
    hote = "";
  }
  parDomaine[c.id] = {
    cle: c.cle,
    nom: fiche.nom,
    km: Math.round(c.km * 100) / 100,
    url: fiche.photo,
    servi: HOTES_SERVANTS.has(hote),
  };
  clesPrises.add(c.cle);
}

const servis = Object.values(parDomaine).filter((r) => r.servi).length;
const sortie = {
  calcule: new Date().toISOString().slice(0, 10),
  quoi: "rattachement, par la position, des domaines du référentiel aux photos publiées par Skiinfo",
  regle: `la fiche la plus proche à ${RAYON_KM} km au plus, appariement glouton : une fiche ne sert qu'un domaine`,
  rayonKm: RAYON_KM,
  releve: photos.releve,
  domaines: domaines.length,
  rattaches: Object.keys(parDomaine).length,
  servis,
  nonServis: Object.keys(parDomaine).length - servis,
  avertissement:
    "servi: false désigne un hôte qui n'a pas répondu au contrôle du 21 septembre 2026 (img*.onthesnow.com). L'adresse est celle que le site publie ; l'affichage doit la traiter comme une absence plutôt que de montrer une image cassée.",
  photos: parDomaine,
};

writeFileSync(
  resolve(DATA, "photosDomaines.json"),
  JSON.stringify(sortie, null, 1) + "\n",
  "utf8",
);

const pct = (n: number) => `${((n / domaines.length) * 100).toFixed(1)} %`;
console.log(`Domaines du référentiel   : ${domaines.length}`);
console.log(`Fiches photo utilisables  : ${candidates.length}`);
console.log(`Rattachés                 : ${Object.keys(parDomaine).length}   ${pct(Object.keys(parDomaine).length)}`);
console.log(`  dont hôte qui répond    : ${servis}   ${pct(servis)}`);
console.log(`  dont hôte muet          : ${Object.keys(parDomaine).length - servis}`);
const d = Object.values(parDomaine).map((r) => r.km).sort((a, b) => a - b);
if (d.length) {
  console.log(`Distance médiane          : ${d[Math.floor(d.length / 2)]?.toFixed(2)} km`);
  console.log(`  à moins de 1 km         : ${d.filter((x) => x <= 1).length}`);
}
