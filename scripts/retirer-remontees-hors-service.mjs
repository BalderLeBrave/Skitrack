#!/usr/bin/env node
/**
 * Retire de nos gares OSM (`src/lib/osmLifts.json`, `src/lib/osmAccess.snapshot.json`)
 * celles dont l'appareil ne fait pas un logement au pied des pistes, selon
 * openskidata.org.
 *
 * Nos fichiers ne gardent d'une gare que son nom, son genre et sa position :
 * l'état se lit dans `lifts.geojson` d'openskidata.org (`status`, `liftType`,
 * `access`, `skiAreas`, et l'altitude de chaque point du tracé), que le
 * pipeline des tuiles télécharge déjà (`filtrer-openskidata-europe.py`).
 * Relevé du 26 septembre 2026, sur le jeu européen du 22. Cinq familles :
 *
 * 1. **hors service** : désaffecté, abandonné, en projet, prévu ou en
 *    construction. L'ancienne télécabine de Charlannes mettait le bourg de
 *    La Bourboule à 307 m des pistes, quand la première remontée en service
 *    est à 5 km.
 * 2. **privé sans domaine** : accès privé, rattaché à aucun domaine skiable.
 *    Le téléphérique de l'observatoire de Bure faisait entrer « Chalet 8
 *    Personnes - Dévoluy » à La Joue du Loup (1 756 m ; 2 037 m sans lui), et
 *    Plaouquès (privé, sans domaine, vallée d'Aure) « Grange en Vallée
 *    d'Aure » à Espiaube (1 722 m ; 3 704 m). Pragnères, Tramezaygues 1 et 2
 *    aussi.
 * 3. **cabine sans domaine** : funiculaire, téléphérique ou télécabine en
 *    service, rattaché à aucun domaine. Applevage mettait deux « Gd Appart …
 *    GR10 » de Gabas à 1 311 m des pistes d'Artouste (2 343 m sans lui) ;
 *    Ponts de Camps, Tramezaygues 3, et les appareils de ville : le
 *    funiculaire de Thonon, dont 7 gares étaient dans la liste de Lullin (un
 *    logement de Thonon y passait « à 21 m »). Sauf `GARDEES`.
 * 4. **câble plat sans domaine** : 3 m de dénivelé au plus sur 80 m au moins,
 *    lus aux altitudes du tracé. Ce sont des téléskis nautiques : celui du
 *    plan d'eau de Chaillol (173 m, 0 m de dénivelé) faisait entrer « Le
 *    Moulin des Écrins » (1 246 m ; 3 087 m sans lui) et « Maison la
 *    Chanette » (1 738 m ; 3 831 m).
 * 5. **désignés** : `RETIREES_DESIGNEES`, par identifiant openskidata, et
 *    `POSITIONS_RETIREES`, par position exacte de nos gares. Le télésiège du
 *    Glacier des Bossons, rattaché à un domaine sans aucune piste à 2 km, mettait
 *    « Papillon Chamonix Chalet » « au pied des pistes » (171 m ; 2 979 m sans
 *    lui) ; la corde du tremplin de Ventron ferait entrer tout le village.
 *
 * Passage du 26 septembre 2026, depuis les fichiers d'origine : 7 030 → 6 313
 * gares dans l'index national, 27 973 → 27 011 dans les listes de station,
 * 716 gares sur 715 positions dans `remonteesRetirees.json` (405 hors
 * service, 24 privées, 151 cabines dont le Capucin, 132 câbles plats, 4
 * désignées). Sur les
 * relevés et sur le code du 25 septembre, 11 logements sortent de « Par
 * budget » (1 618 → 1 607), dont un T4 de Seyssinet-Pariset relevé pour
 * Lans-en-Vercors, à 1 578 m d'un funiculaire privé de Grenoble ; sur le code
 * du 26, 10 (1 499 → 1 489), le « Mobile-home » d'Espiaube en sortant déjà
 * par ailleurs ; le Capucin en ôte 17 de plus (le bourg du Mont-Dore, à
 * 2,2 km des Longes). Un second passage ne retire rien.
 *
 * Ce que le script ne fait pas, exprès : juger un appareil par les kilomètres
 * de pistes de son domaine. « Domaine à 0 km » prendrait de vrais téléskis
 * (Gaschney, Val Pelens). Les tremplins rattachés à un domaine (Courchevel,
 * Les Tuffes, Chaux-Neuve) et l'Ascenseur des Thermes (rattaché à Megève)
 * restent : leur usage hors ski n'est pas prouvé.
 *
 * Une gare est rapprochée des points des tracés d'openskidata.org, extrémités
 * et gares intermédiaires, à 60 m au plus, du même nom quand elle en a un.
 * Les extrémités seules laissaient « Sambuy » (La Sambuy, désaffecté) et
 * « Prat de Tossa » (Puigmal, abandonné), gares au milieu de leur tracé. Elle
 * part seulement si toutes les remontées qui la touchent sont à retirer : une
 * gare partagée avec un appareil gardé reste, et une gare que rien ne touche
 * aussi.
 *
 * `remonteesRetirees.json` garde chaque gare retirée par sa position et son
 * nom, tous ses noms : une même position en porte parfois deux (« TKE1 du Col
 * des Aravis » et « Télétraineau du Col des Aravis »), et une annonce déjà
 * enregistrée peut tenir l'un ou l'autre.
 *
 * Le rapport avertit, sans rien garder, des gares « cabine sans domaine » ou
 * « câble plat sans domaine » à 500 m au plus d'une piste de descente en
 * service (`runs.geojson` d'openskidata.org, à côté du fichier des remontées,
 * ou `--pistes`) : une télécabine neuve qui relie un village à son domaine,
 * pas encore rattachée, partirait sinon sans bruit. Un avertissement, pas un
 * filtre : un filtre garderait Applevage, dont la gare haute est à 500 m des
 * pistes de Fabrèges (seule gare signalée au passage du 26 septembre).
 *
 *   node scripts/retirer-remontees-hors-service.mjs <lifts.geojson>            (à blanc)
 *   node scripts/retirer-remontees-hors-service.mjs <lifts.geojson> --ecrire
 *   node scripts/retirer-remontees-hors-service.mjs <lifts.geojson> --pistes <runs.geojson>
 */
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIFTS = join(racine, "src", "lib", "osmLifts.json");
const ACCESS = join(racine, "src", "lib", "osmAccess.snapshot.json");
/** Les gares retirées, gardées pour les relevés déjà enregistrés : une annonce
 *  mesurée à l'une d'elles se remesure (`remesurerRemontee`). Cumulé d'un
 *  passage à l'autre. */
const RETIREES = join(racine, "src", "lib", "remonteesRetirees.json");

const args = process.argv.slice(2);
const ecrire = args.includes("--ecrire");
const iPistes = args.indexOf("--pistes");
const source = args.find((a, i) => !a.startsWith("--") && (iPistes < 0 || i !== iPistes + 1));
if (!source || (iPistes >= 0 && !args[iPistes + 1])) {
  console.error(
    "Usage : node scripts/retirer-remontees-hors-service.mjs <lifts.geojson> [--ecrire] [--pistes <runs.geojson>]",
  );
  process.exit(1);
}
/** Les pistes d'openskidata.org : `--pistes`, sinon le `runs.geojson` (ou
 *  `eu-runs.geojson`) posé à côté du fichier des remontées. */
function pistesVoisines() {
  const b = basename(source);
  return b.includes("lifts") ? join(dirname(source), b.replace("lifts", "runs")) : null;
}
const PISTES = iPistes >= 0 ? args[iPistes + 1] : pistesVoisines();
if (iPistes >= 0 && !existsSync(PISTES)) {
  console.error(`Pistes introuvables : ${PISTES}`);
  process.exit(1);
}

const HORS_SERVICE = new Set(["disused", "abandoned", "proposed", "planned", "construction"]);
/** Les appareils à cabine ou à voie : un funiculaire, un téléphérique ou une
 *  télécabine sans domaine ne sert pas un domaine skiable. */
const CABINES = new Set(["funicular", "cable_car", "gondola"]);
/** Un câble plat : 3 m de dénivelé au plus, sur 80 m au moins. */
const PLAT_DENIVELE_M = 3;
const PLAT_LONGUEUR_M = 80;
/** Portée du rapprochement d'une gare avec un point de tracé. */
const PORTEE_M = 60;
/** Sans nom, une gare ne se rapproche que de plus près. */
const PORTEE_SANS_NOM_M = 30;
/** Les familles retirées sur la seule absence de domaine : une piste de
 *  descente à `PISTE_PROCHE_M` au plus de l'une de leurs gares est signalée. */
const A_VERIFIER = new Set(["cabine sans domaine", "câble plat sans domaine"]);
const PISTE_PROCHE_M = 500;

/**
 * Gardés par décision du propriétaire (26 septembre 2026), quoi qu'en disent
 * les familles 2 à 5 ; un appareil hors service part quand même. Désignés par
 * identifiant openskidata, ou par nom et genre si l'identifiant change d'un
 * jeu à l'autre.
 *
 * - L'Aiguille du Midi et la Mer de Glace, qui desservent le hors-piste de la
 *   Vallée Blanche : openskidata les rattache aujourd'hui à un domaine, et
 *   aucune famille ne les prend ; la liste les garde si ce rattachement tombe.
 */
const GARDEES = [
  // Le funiculaire du Capucin (Le Mont-Dore) n'y est plus : le propriétaire
  // l'a retiré le 26 septembre 2026 (aucun domaine, aucune piste à 1 km de sa
  // gare haute), avec les logements du bourg qui ne tenaient que par lui.
  {
    id: "0c9356f361c8fabc42cbd80fa58a27143cf27e27",
    nom: "TPH Aiguille du Midi",
    type: "cable_car",
  },
  {
    id: "c01935d7b906ccbcadccce82a2a28b48e4ed5942",
    nom: "TPH Plan de l'Aiguille",
    type: "cable_car",
  },
  { id: "801278f911681f3511200aaabd753bf91ea731b1", nom: "TC Mer de Glace", type: "gondola" },
  {
    id: "4881dee2023f306dd82638739a0f2fc882516058",
    nom: "Panoramic Mont Blanc, Kleinkabinenbahn Vallée Blanche, Funivia dei Ghiacciai",
    type: "cable_car",
  },
];

/**
 * Retirés un à un, rattachés à un domaine : aucune famille ne les prend.
 *
 * - Le télésiège du Glacier des Bossons (Chamonix) : aucune piste à 2 km. Il
 *   mettait trois chalets « au pied des pistes », dont « Papillon Chamonix
 *   Chalet » à 171 m (2 979 m sans lui).
 */
const RETIREES_DESIGNEES = [
  {
    id: "12731f2c879a42901d5dd8cb796c112f4f57180c",
    nom: "Glacier des Bossons",
    type: "chair_lift",
  },
];

/**
 * Nos gares retirées par leur position exacte, quand openskidata.org ne les
 * rend pas à retirer.
 *
 * - La corde du tremplin de saut de Ventron (73 m, en service, sans domaine) :
 *   tout le village passait à moins de 2 km des pistes, quand les vraies
 *   remontées sont à 2,5 à 4,8 km.
 */
const POSITIONS_RETIREES = [
  { n: "Teleski à cable bas Tremplin du Saut", lat: 47.936218, lon: 6.868825 },
  { n: "Teleski à cable bas Tremplin du Saut", lat: 47.935874, lon: 6.86799 },
];

function plier(s) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function metres(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** L'appareil est-il dans cette liste, par identifiant, ou par nom et genre ? */
function designe(liste, p) {
  return liste.some(
    (d) => d.id === p.id || (plier(d.nom) === plier(p.name) && d.type === p.liftType),
  );
}

/** Les identifiants des domaines : chaînes dans le jeu européen, objets dans
 *  le `lifts.geojson` d'origine. */
function domaines(p) {
  return (p.skiAreas ?? [])
    .map((s) => (typeof s === "string" ? s : s?.properties?.id))
    .filter(Boolean);
}

/** Longueur du tracé et dénivelé entre son point le plus bas et le plus haut ;
 *  `null` si une altitude manque. */
function profil(c) {
  let long = 0;
  for (let i = 1; i < c.length; i++) long += metres(c[i - 1][1], c[i - 1][0], c[i][1], c[i][0]);
  const alts = c.map((x) => x[2]);
  if (!alts.every((z) => typeof z === "number" && Number.isFinite(z))) return null;
  return { long, deniv: Math.max(...alts) - Math.min(...alts) };
}

/** Pourquoi l'appareil ne fait pas un logement au pied des pistes, ou `null`. */
function motif(p, c) {
  const status = p.status ?? "operating";
  if (HORS_SERVICE.has(status)) return status;
  if (designe(GARDEES, p)) return null;
  if (designe(RETIREES_DESIGNEES, p)) return "désigné";
  if (domaines(p).length) return null;
  if (p.access === "private") return "privé sans domaine";
  if (CABINES.has(p.liftType)) return "cabine sans domaine";
  const pr = profil(c);
  if (pr && pr.long >= PLAT_LONGUEUR_M && pr.deniv <= PLAT_DENIVELE_M) {
    return "câble plat sans domaine";
  }
  return null;
}

// Les points des tracés d'openskidata.org, rangés par cases d'un centième de degré.
const PAS = 0.01;
const cases = new Map();
const cle = (i, j) => `${i}:${j}`;
const geo = JSON.parse(readFileSync(source, "utf8"));
for (const f of geo.features ?? []) {
  const c = f.geometry?.type === "LineString" ? f.geometry.coordinates : null;
  if (!c || c.length < 2) continue;
  const p = f.properties ?? {};
  const r = { nom: plier(p.name), motif: motif(p, c) };
  for (const [lon, lat] of c) {
    const k = cle(Math.floor(lat / PAS), Math.floor(lon / PAS));
    const liste = cases.get(k) ?? [];
    liste.push({ lat, lon, r });
    cases.set(k, liste);
  }
}

/** Les remontées dont un point est à `portee` au plus, chacune une fois. */
function autour(lat, lon, portee) {
  const i0 = Math.floor(lat / PAS);
  const j0 = Math.floor(lon / PAS);
  const out = new Set();
  for (let i = i0 - 1; i <= i0 + 1; i++) {
    for (let j = j0 - 1; j <= j0 + 1; j++) {
      for (const e of cases.get(cle(i, j)) ?? []) {
        if (metres(lat, lon, e.lat, e.lon) <= portee) out.add(e.r);
      }
    }
  }
  return [...out];
}

const designees = new Set(POSITIONS_RETIREES.map((g) => `${g.lat},${g.lon}`));

/** Le motif qui fait partir la gare, ou `null` : elle reste. */
function aRetirer(p) {
  if (designees.has(`${p.lat},${p.lon}`)) return "désigné";
  const nom = plier(p.n);
  let touche;
  if (nom) {
    const memeNom = autour(p.lat, p.lon, PORTEE_M).filter((e) => e.nom === nom);
    // Un nom qu'aucune remontée proche ne porte : seul un point très proche
    // fait foi (appareil renommé).
    touche = memeNom.length ? memeNom : autour(p.lat, p.lon, PORTEE_SANS_NOM_M);
  } else {
    touche = autour(p.lat, p.lon, PORTEE_SANS_NOM_M);
  }
  if (touche.length === 0) return null;
  if (!touche.every((e) => e.motif)) return null;
  return touche[0].motif;
}

const retirees = new Map();
/** Chaque gare retirée, une fois par position et par nom : position, nom, motif. */
const gares = new Map();
const position = (g) => `${g.lat},${g.lon}`;
const cleGare = (g) => JSON.stringify([g.lat, g.lon, g.n ?? null]);
function filtrer(points, ou) {
  return points.filter((p) => {
    const s = aRetirer(p);
    if (!s) return true;
    gares.set(cleGare(p), { n: p.n, s, lat: p.lat, lon: p.lon });
    const k = `${p.n ?? "(sans nom)"} · ${p.k} · ${s}`;
    const r = retirees.get(k) ?? { n: 0, ou: new Set() };
    r.n += 1;
    r.ou.add(ou);
    retirees.set(k, r);
    return false;
  });
}

const lifts = JSON.parse(readFileSync(LIFTS, "utf8"));
const access = JSON.parse(readFileSync(ACCESS, "utf8"));
const liftsApres = filtrer(lifts, "national");
const accessApres = Object.fromEntries(
  Object.entries(access).map(([id, a]) => [id, { ...a, lifts: filtrer(a.lifts, id) }]),
);

const parMotif = {};
for (const k of retirees.keys()) {
  const s = k.split(" · ").pop();
  parMotif[s] = (parMotif[s] ?? 0) + 1;
}
console.log(`${source}`);
console.log(`osmLifts.json : ${lifts.length} → ${liftsApres.length} gares`);
const avantAcces = Object.values(access).reduce((n, a) => n + a.lifts.length, 0);
const apresAcces = Object.values(accessApres).reduce((n, a) => n + a.lifts.length, 0);
console.log(`osmAccess.snapshot.json : ${avantAcces} → ${apresAcces} gares`);
console.log(`(nom, genre, motif) retirés : ${retirees.size}`, parMotif);
for (const [k, r] of [...retirees].sort()) {
  const ou = [...r.ou];
  console.log(`  ${k} — ${r.n} gare(s) — ${ou.slice(0, 4).join(", ")}${ou.length > 4 ? "…" : ""}`);
}

/* ---------- Pistes proches des gares retirées sans domaine ---------- */

/** Les pistes d'un `runs.geojson`, lu ligne à ligne (un objet par ligne,
 *  comme openskidata.org et `filtrer-openskidata-europe.py` l'écrivent : le
 *  jeu complet dépasse 800 Mo). Un fichier d'une seule ligne passe aussi. */
async function* lirePistes(fichier) {
  const lignes = createInterface({ input: createReadStream(fichier, "utf8"), crlfDelay: Infinity });
  for await (const brute of lignes) {
    const l = brute.trim().replace(/,$/, "");
    if (!l.startsWith("{")) continue;
    let o;
    try {
      o = JSON.parse(l);
    } catch {
      continue; // L'en-tête `{"type":"FeatureCollection","features":[`.
    }
    if (o.type === "Feature") yield o;
    else if (o.type === "FeatureCollection") yield* o.features ?? [];
  }
}

/** Les lignes d'une géométrie de piste, et ses surfaces (anneau extérieur). */
function traits(g) {
  switch (g?.type) {
    case "LineString":
      return { lignes: [g.coordinates], surfaces: [] };
    case "MultiLineString":
      return { lignes: g.coordinates, surfaces: [] };
    case "Polygon":
      return { lignes: g.coordinates, surfaces: [g.coordinates[0]] };
    case "MultiPolygon":
      return { lignes: g.coordinates.flat(), surfaces: g.coordinates.map((p) => p[0]) };
    default:
      return { lignes: [], surfaces: [] };
  }
}

/** Le point est-il dans l'anneau ? Rayon lancé vers l'est. */
function dedans(lat, lon, anneau) {
  let d = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i];
    const [xj, yj] = anneau[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

/** Distance du point à la piste, en mètres : au segment le plus proche, en
 *  projection locale ; 0 dans une surface. */
function aLaPiste(lat, lon, t) {
  if (t.surfaces.some((a) => dedans(lat, lon, a))) return 0;
  const ky = (Math.PI / 180) * 6371000;
  const kx = ky * Math.cos((lat * Math.PI) / 180);
  let min = Infinity;
  for (const ligne of t.lignes) {
    for (let i = 1; i < ligne.length; i++) {
      const ax = (ligne[i - 1][0] - lon) * kx;
      const ay = (ligne[i - 1][1] - lat) * ky;
      const dx = (ligne[i][0] - lon) * kx - ax;
      const dy = (ligne[i][1] - lat) * ky - ay;
      const l2 = dx * dx + dy * dy;
      const u = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      min = Math.min(min, Math.hypot(ax + u * dx, ay + u * dy));
    }
  }
  return min;
}

/**
 * Les gares retirées à ce passage comme « cabine » ou « câble plat » sans
 * domaine, à `PISTE_PROCHE_M` au plus d'une piste de descente en service,
 * avec la plus proche ; `null` si les pistes ne sont pas là.
 */
async function pistesProches() {
  if (!PISTES || !existsSync(PISTES)) return null;
  const margeLat = PISTE_PROCHE_M / ((Math.PI / 180) * 6371000);
  const aVoir = new Map();
  for (const g of gares.values()) {
    if (!A_VERIFIER.has(g.s)) continue;
    const k = position(g);
    const margeLon = margeLat / Math.cos((g.lat * Math.PI) / 180);
    const v = aVoir.get(k) ?? { ...g, noms: new Set(), margeLon, m: Infinity, piste: null };
    v.noms.add(g.n ?? "(sans nom)");
    aVoir.set(k, v);
  }
  const candidates = [...aVoir.values()];
  if (candidates.length === 0) return [];
  // Sans une piste lue (fichier indenté, en-tête inattendu), le rapport ne doit
  // pas affirmer une absence qu'il n'a pas vérifiée.
  let lues = 0;
  for await (const f of lirePistes(PISTES)) {
    lues += 1;
    const p = f.properties ?? {};
    if (!(p.uses ?? []).includes("downhill") || HORS_SERVICE.has(p.status ?? "operating")) continue;
    const t = traits(f.geometry);
    let [s, w, n, e] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ligne of t.lignes) {
      for (const [lon, lat] of ligne) {
        s = Math.min(s, lat);
        n = Math.max(n, lat);
        w = Math.min(w, lon);
        e = Math.max(e, lon);
      }
    }
    for (const c of candidates) {
      if (c.lat < s - margeLat || c.lat > n + margeLat) continue;
      if (c.lon < w - c.margeLon || c.lon > e + c.margeLon) continue;
      const m = aLaPiste(c.lat, c.lon, t);
      if (m <= PISTE_PROCHE_M && m < c.m) {
        c.m = m;
        c.piste = p.name ?? p.ref ?? p.id ?? "(sans nom)";
      }
    }
  }
  if (lues === 0) return null;
  return candidates.filter((c) => c.piste !== null).sort((a, b) => a.m - b.m);
}

const proches = await pistesProches();
if (proches === null) {
  console.log("pistes non lues (runs.geojson à côté des remontées, ou --pistes) : proximité non vérifiée.");
} else if (proches.length === 0) {
  console.log(
    `aucune gare retirée à ce passage comme « cabine » ou « câble plat » sans domaine n'est à ${PISTE_PROCHE_M} m d'une piste.`,
  );
} else {
  console.log(
    `à vérifier : ${proches.length} gare(s) « cabine » ou « câble plat » sans domaine à ${PISTE_PROCHE_M} m au plus d'une piste de descente, retirées quand même :`,
  );
  for (const c of proches) {
    const noms = [...c.noms].join(" / ");
    console.log(`  ${noms} · ${c.s} · ${c.lat},${c.lon} — ${Math.round(c.m)} m de « ${c.piste} »`);
  }
}

if (ecrire) {
  writeFileSync(LIFTS, JSON.stringify(liftsApres));
  writeFileSync(ACCESS, JSON.stringify(accessApres));
  let deja = [];
  try {
    deja = JSON.parse(readFileSync(RETIREES, "utf8"));
  } catch {
    // Premier passage : rien de retiré avant.
  }
  for (const g of deja) if (!gares.has(cleGare(g))) gares.set(cleGare(g), g);
  // Une position qu'une gare gardée occupe encore n'est pas retirée, sous
  // aucun nom : la TSCD de la Tête du Torraz, en projet, part du nœud de la
  // TSF4 en service.
  const gardees = new Set(
    [...liftsApres, ...Object.values(accessApres).flatMap((a) => a.lifts)].map(position),
  );
  for (const [k, g] of [...gares]) if (gardees.has(position(g))) gares.delete(k);
  const nom = (g) => g.n ?? "";
  const liste = [...gares.values()].sort(
    (a, b) => a.lat - b.lat || a.lon - b.lon || (nom(a) < nom(b) ? -1 : nom(a) > nom(b) ? 1 : 0),
  );
  writeFileSync(RETIREES, JSON.stringify(liste));
  const positions = new Set(liste.map(position)).size;
  console.log(`écrit (${liste.length} gares retirées au total, sur ${positions} positions).`);
} else {
  console.log("à blanc : rien d'écrit (--ecrire pour écrire).");
}
