/**
 * Le dernier recours : les sites officiels des stations.
 *
 *     node --experimental-strip-types scripts/fetch-sites-officiels.ts
 *     node --experimental-strip-types scripts/fetch-sites-officiels.ts --completer
 *     node --experimental-strip-types scripts/fetch-sites-officiels.ts --essai 10
 *
 * Écrit `src/lib/monde/data/sitesOfficiels.json`.
 *
 * ## Pourquoi celui-ci après les deux autres
 *
 * Skiinfo couvre 1 160 domaines en photo, skiresort 114 de plus. Restent
 * 2 324 domaines sans image, dont **899 dont le référentiel connaît le site
 * officiel** : OpenSkiMap publie `websites`, et personne ne l'avait encore
 * ouvert. Même chose pour les prix : 553 domaines sans forfait ont un site.
 *
 * ## Ce qu'on y cherche, et seulement cela
 *
 * **Une photo** : `og:image`, `twitter:image`, ou l'`image` d'un bloc JSON-LD.
 * Ce sont des balises que le site publie *pour être lues par des machines* ;
 * elles ne se devinent pas et ne changent pas au prochain habillage.
 *
 * **Un prix** : uniquement dans un bloc JSON-LD portant `price` et
 * `priceCurrency`. C'est la seule forme où le site dit lui-même « ceci est un
 * montant, dans cette devise ».
 *
 * **Rien n'est extrait du texte de la page.** Un nombre près du mot
 * « forfait » peut être un tarif enfant, un prix d'école de ski, une location
 * de matériel ou le numéro d'une navette. Sur neuf cents sites aux mises en
 * page toutes différentes, une expression qui ramasse « 45 € » près de
 * « forfait » aurait un taux d'erreur qu'on ne saurait ni mesurer ni corriger.
 * **Un prix faux est pire qu'un prix absent** : il se recopie, il se compare,
 * et rien à l'écran ne dit qu'il est faux.
 *
 * ## `robots.txt` est lu **et respecté**
 *
 * C'est la différence avec les connecteurs de `src/lib/scrape/`, dont la
 * politique documentée est de lire, journaliser et interroger quand même : ce
 * sont vingt-deux hôtes connus, dont le fichier interdit une page de
 * réservation qu'un humain atteint en trois clics.
 *
 * Ici, ce sont **neuf cents hôtes inconnus**, visités une fois chacun, pour une
 * donnée qu'ils publient volontairement dans leurs métadonnées. Rien ne
 * justifierait d'y passer outre. Un hôte qui refuse est compté et nommé, et
 * son domaine reste sans photo.
 *
 * ## Cadence
 *
 * Une requête à la fois, 1,5 s entre deux. Chaque hôte n'en reçoit qu'une ou
 * deux — son `robots.txt`, puis sa page d'accueil —, si bien que la cadence
 * par hôte est très en deçà de ce que `politesse.ts` impose aux sources qu'on
 * parcourt en entier.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");
const SORTIE = resolve(DATA, "sitesOfficiels.json");

const INTERVALLE_MS = 1_500;
const TIMEOUT_MS = 20_000;
const SAUVE_TOUS = 50;

const UA =
  "Skitrack/1.0 (relevé de métadonnées de stations de ski ; robot applicatif, " +
  "une requête à la fois, 1,5 s entre deux ; lit robots.txt et le respecte)";
/** Le jeton sous lequel on se cherche dans `robots.txt`. */
const AGENT = "skitrack";

class Refus extends Error {}

type Trouve = {
  id: string;
  nom: string | null;
  site: string;
  /** L'adresse finale, après redirections. */
  url: string | null;
  statut: number | null;
  photo: string | null;
  /** D'où sort la photo : la balise qui la portait. */
  photoSource: string | null;
  prix: { valeur: number; devise: string; nom: string | null } | null;
  /** `robots.txt` a-t-il refusé ? Le domaine reste alors sans rien. */
  refuse: boolean;
};

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── robots.txt, lu une fois par hôte ────────────────────────────────────────

const robots = new Map<string, { interdits: string[]; lu: boolean }>();
/** Les hôtes qui ont répondu 429 : on ne les rappelle pas. */
const refusants = new Set<string>();

/** Les chemins interdits par le groupe qui nous concerne. */
function lireRobots(txt: string): string[] {
  const lignes = txt.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim());
  let groupes: string[][] = [];
  let courant: string[] | null = null;
  let agents: string[] = [];
  let dansAgents = false;
  const parGroupe: { agents: string[]; interdits: string[] }[] = [];
  for (const l of lignes) {
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(l);
    if (!m) continue;
    const cle = m[1]!.toLowerCase();
    const val = m[2]!.trim();
    if (cle === "user-agent") {
      if (!dansAgents) {
        agents = [];
        courant = [];
        parGroupe.push({ agents, interdits: courant });
        dansAgents = true;
      }
      agents.push(val.toLowerCase());
    } else if (cle === "disallow") {
      dansAgents = false;
      if (courant && val) courant.push(val);
    } else {
      dansAgents = false;
    }
  }
  groupes = parGroupe.filter((g) => g.agents.includes(AGENT)).map((g) => g.interdits);
  if (!groupes.length) groupes = parGroupe.filter((g) => g.agents.includes("*")).map((g) => g.interdits);
  return groupes.flat();
}

function autorise(interdits: readonly string[], chemin: string): boolean {
  return !interdits.some((d) => chemin.startsWith(d.replace(/\*.*$/, "")));
}

async function robotsDe(origine: string): Promise<string[]> {
  const deja = robots.get(origine);
  if (deja) return deja.interdits;
  let interdits: string[] = [];
  try {
    const res = await fetch(`${origine}/robots.txt`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
    if (res.ok) interdits = lireRobots(await res.text());
    else await res.body?.cancel();
  } catch {
    // Pas de `robots.txt` lisible : rien n'est interdit, c'est la règle.
    interdits = [];
  }
  robots.set(origine, { interdits, lu: true });
  await dormir(INTERVALLE_MS);
  return interdits;
}

// ─── La lecture d'une page ───────────────────────────────────────────────────

function meta(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']|` +
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`,
    "i",
  );
  const m = re.exec(html);
  return (m?.[1] ?? m?.[2])?.trim() || null;
}

function blocsJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const d = JSON.parse(m[1] ?? "");
      out.push(...(Array.isArray(d) ? d : [d]));
    } catch {
      /* un bloc illisible n'est pas une panne : on passe au suivant */
    }
  }
  return out;
}

function adresseImage(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v)) {
    for (const e of v) {
      const u = adresseImage(e);
      if (u) return u;
    }
    return null;
  }
  if (v && typeof v === "object") {
    const o = v as { url?: unknown; contentUrl?: unknown };
    return adresseImage(o.url) ?? adresseImage(o.contentUrl);
  }
  return null;
}

/**
 * Le premier prix d'un bloc JSON-LD, avec sa devise.
 *
 * On exige **les deux** : `price` et `priceCurrency`. Un montant sans devise
 * n'est pas un prix, c'est un nombre, et le lecteur y mettrait la sienne.
 */
function prixJsonLd(blocs: readonly unknown[]): { valeur: number; devise: string; nom: string | null } | null {
  const vu = new Set<unknown>();
  const chercher = (v: unknown, nom: string | null): { valeur: number; devise: string; nom: string | null } | null => {
    if (!v || typeof v !== "object" || vu.has(v)) return null;
    vu.add(v);
    const o = v as Record<string, unknown>;
    const titre = typeof o.name === "string" ? o.name : nom;
    const brut = o.price ?? o.lowPrice;
    const dev = o.priceCurrency;
    if (brut != null && typeof dev === "string" && /^[A-Z]{3}$/.test(dev)) {
      const n = typeof brut === "number" ? brut : Number(String(brut).replace(",", "."));
      if (Number.isFinite(n) && n > 0) return { valeur: n, devise: dev, nom: titre };
    }
    for (const x of Object.values(o)) {
      const r = Array.isArray(x)
        ? x.reduce<ReturnType<typeof chercher>>((acc, e) => acc ?? chercher(e, titre), null)
        : chercher(x, titre);
      if (r) return r;
    }
    return null;
  };
  for (const b of blocs) {
    const r = chercher(b, null);
    if (r) return r;
  }
  return null;
}

// ─── Le périmètre : les domaines à qui il manque quelque chose ───────────────

type Domaine = { id: string; nom?: string; sites?: string[] };
const domaines: Domaine[] = [];
for (const f of readdirSync(DATA).sort()) {
  if (!/^[A-Z]{2}\.json$/.test(f)) continue;
  domaines.push(...(JSON.parse(readFileSync(resolve(DATA, f), "utf8")) as Domaine[]));
}

const vues = JSON.parse(readFileSync(resolve(DATA, "vuesDomaines.json"), "utf8")) as {
  vues: Record<string, { photo: unknown; forfait: unknown }>;
};

const aChercher = domaines.filter((d) => {
  const site = d.sites?.[0];
  if (!site || !/^https?:\/\//i.test(site)) return false;
  const v = vues.vues[d.id];
  return !v?.photo || !v?.forfait;
});

// ─── Le tour ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const essaiIdx = args.indexOf("--essai");
const limite = essaiIdx >= 0 ? Number(args[essaiIdx + 1]) : 0;

type Sortie = {
  releve: string;
  quoi: string;
  regle: string;
  robots: string;
  domaines: number;
  avecPhoto: number;
  avecPrix: number;
  refuses: number;
  fiches: Record<string, Trouve>;
};

let fiches: Record<string, Trouve> = {};
if (args.includes("--completer")) {
  try {
    fiches = (JSON.parse(readFileSync(SORTIE, "utf8")) as Sortie).fiches;
    console.log(`Reprise : ${Object.keys(fiches).length} sites déjà visités.`);
  } catch {
    console.log("Aucun relevé antérieur : on part de zéro.");
  }
}

let restants = aChercher.filter((d) => !fiches[d.id]);
if (limite > 0) restants = restants.slice(0, limite);

function ecrire(): void {
  const v = Object.values(fiches);
  const sortie: Sortie = {
    releve: new Date().toISOString(),
    quoi: "les métadonnées publiées par le site officiel de la station : og:image, et un prix JSON-LD quand il existe",
    regle:
      "rien n'est extrait du texte de la page ; un prix n'est retenu que s'il porte price ET priceCurrency dans un bloc JSON-LD",
    robots: "lu par hôte, et respecté : un hôte qui refuse est compté et son domaine reste sans photo",
    domaines: v.length,
    avecPhoto: v.filter((x) => x.photo).length,
    avecPrix: v.filter((x) => x.prix).length,
    refuses: v.filter((x) => x.refuse).length,
    fiches,
  };
  writeFileSync(SORTIE, JSON.stringify(sortie, null, 1) + "\n", "utf8");
}

console.log(`Domaines à qui il manque une photo ou un forfait, et qui ont un site : ${aChercher.length}`);
console.log(`À visiter maintenant : ${restants.length}`);
console.log(`Durée attendue       : ${Math.round((restants.length * INTERVALLE_MS * 1.6) / 60000)} minutes.\n`);

let faites = 0;

for (const d of restants) {
  const site = d.sites![0]!;
  let origine: string;
  let chemin: string;
  try {
    const u = new URL(site);
    origine = u.origin;
    chemin = u.pathname || "/";
  } catch {
    continue;
  }

  if (refusants.has(origine)) continue;

  try {
    const interdits = await robotsDe(origine);
    if (!autorise(interdits, chemin)) {
      fiches[d.id] = {
        id: d.id,
        nom: d.nom ?? null,
        site,
        url: null,
        statut: null,
        photo: null,
        photoSource: null,
        prix: null,
        refuse: true,
      };
      faites++;
      continue;
    }

    let html: string | null = null;
    let statut: number | null = null;
    let finale: string | null = null;
    try {
      const res = await fetch(site, {
        headers: { "user-agent": UA, accept: "text/html", "accept-language": "fr,en;q=0.8" },
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      statut = res.status;
      finale = res.url;
      // Un 429 arrête **cet hôte**, pas le tour.
      //
      // La règle « s'arrêter au premier 429 » est celle d'un relevé qui
      // parcourt un site en entier : insister y serait exactement ce que le
      // code demande d'éviter. Ici, chaque hôte ne reçoit qu'une requête, et
      // un seul d'entre eux a fait tomber le tour à 438 sur 929. On note son
      // refus, on passe au suivant, et on ne le rappelle pas.
      if (res.status === 429) {
        refusants.add(origine);
        await res.body?.cancel();
        throw new Refus(origine);
      }
      if (res.ok) html = await res.text();
      else await res.body?.cancel();
    } catch (err) {
      if (err instanceof Refus) throw err;
      statut = null;
    }
    await dormir(INTERVALLE_MS);

    let photo: string | null = null;
    let photoSource: string | null = null;
    let prix: Trouve["prix"] = null;
    if (html) {
      const blocs = blocsJsonLd(html);
      for (const [prop, nom] of [
        ["og:image", "og:image"],
        ["twitter:image", "twitter:image"],
        ["twitter:image:src", "twitter:image:src"],
      ] as const) {
        const u = meta(html, prop);
        if (u) {
          photo = u;
          photoSource = nom;
          break;
        }
      }
      if (!photo) {
        for (const b of blocs) {
          const u = adresseImage((b as { image?: unknown })?.image);
          if (u) {
            photo = u;
            photoSource = "json-ld";
            break;
          }
        }
      }
      // Une adresse relative se résout sur la page qui la porte.
      if (photo && finale) {
        try {
          photo = new URL(photo, finale).toString();
        } catch {
          photo = null;
        }
      }
      prix = prixJsonLd(blocs);
    }

    fiches[d.id] = {
      id: d.id,
      nom: d.nom ?? null,
      site,
      url: finale,
      statut,
      photo,
      photoSource,
      prix,
      refuse: false,
    };
    faites++;
  } catch (err) {
    if (err instanceof Refus) {
      // L'hôte a dit non : son domaine reste sans rien, et le tour continue.
      fiches[d.id] = {
        id: d.id,
        nom: d.nom ?? null,
        site,
        url: null,
        statut: 429,
        photo: null,
        photoSource: null,
        prix: null,
        refuse: true,
      };
      faites++;
      await dormir(INTERVALLE_MS);
    } else {
      throw err;
    }
  }

  if (faites % SAUVE_TOUS === 0) {
    ecrire();
    const v = Object.values(fiches);
    console.log(
      `  ${faites}/${restants.length} — ${v.filter((x) => x.photo).length} photos, ` +
        `${v.filter((x) => x.prix).length} prix, ${v.filter((x) => x.refuse).length} refus`,
    );
  }
}

ecrire();

const v = Object.values(fiches);
console.log(`\nVisités : ${v.length} sites.`);
console.log(`  avec une photo : ${v.filter((x) => x.photo).length}`);
console.log(`  avec un prix   : ${v.filter((x) => x.prix).length}`);
console.log(`  refusés par robots.txt : ${v.filter((x) => x.refuse).length}`);
console.log(`  injoignables   : ${v.filter((x) => !x.refuse && x.statut == null).length}`);
const sources = new Map<string, number>();
for (const x of v) if (x.photoSource) sources.set(x.photoSource, (sources.get(x.photoSource) ?? 0) + 1);
console.log("D'où viennent les photos :");
for (const [s, n] of [...sources].sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(5)}  ${s}`);
