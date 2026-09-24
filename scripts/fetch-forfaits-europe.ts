/**
 * Le relevé des prix de forfaits, Europe entière, chez skiresort.fr.
 *
 *     node --experimental-strip-types scripts/fetch-forfaits-europe.ts
 *     node --experimental-strip-types scripts/fetch-forfaits-europe.ts --completer
 *     node --experimental-strip-types scripts/fetch-forfaits-europe.ts --essai 10
 *
 * Écrit `src/lib/monde/data/forfaits.json`.
 *
 * ## Pourquoi un second passage sur des pages déjà lues
 *
 * `fetch-skiresort-monde.ts` a visité ces 6 816 pages le 20 septembre et n'en a
 * retenu que les altitudes, les kilomètres et les remontées. Le prix y était,
 * et n'a pas été extrait. Les pages n'ayant pas été conservées, il faut y
 * retourner — à la même cadence, sous le même en-tête.
 *
 * ## Le périmètre
 *
 * Le fil d'Ariane du site porte le continent, et c'est lui qui fait foi ici
 * plutôt qu'une table de noms de pays reconstruite : « République tchèque »,
 * « Grande-Bretagne » et huit districts fédéraux russes ne se retrouvent dans
 * aucun catalogue CLDR, et les apparier à la main introduirait une seconde
 * vérité à côté de celle de la source.
 *
 * **La Russie est écartée du référentiel** depuis le 21 septembre 2026. Le site
 * la range de toute façon en continent à part : ses 152 fiches ne sont pas
 * relevées. Restent 4 308 fiches « Europe ».
 *
 * ## Ce que le site publie, et sous quelle forme
 *
 * Un bloc stable, avec des identifiants — non des positions dans un tableau :
 *
 *     <h3 class="label h5">Prix des forfaits</h3>
 *     <strong>Forfait journalier Haute saison</strong>
 *     <td id="selTicketA">SFr. 94,- </td>      ← adultes, devise locale
 *     <td id="selTicketY">SFr. 80,-</td>       ← jeunes
 *     <td id="selTicketC">SFr. 47,-</td>       ← enfants
 *     <td id="selTicketEurA">env. € 99,-</td>  ← la conversion du site
 *
 * **La ligne en euros n'est pas un prix.** Le site l'écrit « env. » et ne dit
 * ni son taux ni sa date. Elle est conservée telle quelle, sous un nom qui le
 * dit (`euroEnviron`), et ne doit jamais servir de montant : `devises.ts`
 * affiche les 94 francs en francs. Un prix converti sans taux daté serait
 * exactement la valeur estimée que le dépôt s'interdit.
 *
 * Le libellé du forfait est relevé lui aussi. « Forfait journalier Haute
 * saison » n'est pas « Forfait journalier » : la saison fait le prix, et un
 * montant sans son libellé ne se compare à rien.
 *
 * ## Ce que le relevé ne fait pas
 *
 * Il ne convertit pas, il ne complète pas, il ne moyenne pas. Une fiche sans
 * bloc de prix — c'est le cas de la plupart des téléskis de village — sort
 * avec `prix: null`, et non avec des zéros.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");
const SOURCE = resolve(DATA, "skiresort.json");
const SORTIE = resolve(DATA, "forfaits.json");
const BASE = "https://www.skiresort.fr";

const INTERVALLE_MS = 2_000;
const TIMEOUT_MS = 25_000;
const REESSAIS = 2;
const SAUVE_TOUS = 50;

// Se présenter comme un navigateur, comme le relevé de l'app (consigne du propriétaire, 24 sept. 2026).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Les continents du fil d'Ariane qui valent « Europe » pour le dépôt.
 *
 * Le site range la Russie en continent à part. Elle a d'abord été reprise ici,
 * `geo/pays.ts` la classant en Europe — puis **écartée du référentiel le
 * 21 septembre 2026**, sur décision du propriétaire. Ses 152 fiches sortent
 * donc du périmètre, et la ligne qui les faisait entrer est conservée en
 * commentaire pour que le changement se lise.
 */
const CONTINENTS_EUROPE = new Set(["Europe"]);

class Refus extends Error {}

/** Un montant tel que le site l'écrit, et ce qu'on a pu en lire. */
type Montant = {
  /** La chaîne publiée, sans retouche : « SFr. 94,- », « env. € 99,- ». */
  brut: string;
  /** Le nombre, quand il se lit sans ambiguïté. */
  valeur: number | null;
  /** ISO 4217, quand le symbole se reconnaît. `null` sinon — jamais deviné. */
  devise: string | null;
};

type Fiche = {
  slug: string;
  nom: string | null;
  pays: string | null;
  /** « Forfait journalier Haute saison », tel qu'écrit. */
  libelle: string | null;
  prix: { adultes: Montant | null; jeunes: Montant | null; enfants: Montant | null } | null;
  /** La conversion du site, marquée « env. ». **Ce n'est pas un prix.** */
  euroEnviron: { adultes: Montant | null; jeunes: Montant | null; enfants: Montant | null } | null;
};

/**
 * Les symboles rencontrés, et leur code ISO.
 *
 * Écrite à la main, et volontairement incomplète : un symbole absent de cette
 * table laisse `devise: null` et paraît dans le journal de fin, pour être
 * ajouté en connaissance de cause. Deviner « couronne » sans savoir laquelle
 * mettrait des couronnes tchèques en Norvège.
 */
const DEVISES: [RegExp, string][] = [
  [/^SFr\.?/i, "CHF"],
  [/^CHF/i, "CHF"],
  [/€/, "EUR"],
  [/^EUR/i, "EUR"],
  [/£/, "GBP"],
  [/^GBP/i, "GBP"],
  [/^NOK/i, "NOK"],
  [/^SEK/i, "SEK"],
  // Le site écrit « Skr 300,- » pour la Suède. Vérifié sur son propre repère :
  // il convertit 300 Skr en « env. € 27,- », soit le taux de la couronne.
  [/^Skr/i, "SEK"],
  [/^DKK/i, "DKK"],
  [/^ISK/i, "ISK"],
  [/^PLN/i, "PLN"],
  [/zł/i, "PLN"],
  [/^CZK/i, "CZK"],
  [/Kč/i, "CZK"],
  [/^HUF/i, "HUF"],
  [/Ft\b/, "HUF"],
  [/^RON/i, "RON"],
  [/lei\b/i, "RON"],
  [/^RSD/i, "RSD"],
  [/^BAM/i, "BAM"],
  [/^MKD/i, "MKD"],
  [/^ALL/i, "ALL"],
  [/^BGN/i, "BGN"],
  [/лв/i, "BGN"],
  [/^RUB/i, "RUB"],
  [/₽/, "RUB"],
  [/^UAH/i, "UAH"],
  [/₴/, "UAH"],
  [/^TRY/i, "TRY"],
  [/₺/, "TRY"],
  [/^BYN/i, "BYN"],
  [/^GEL/i, "GEL"],
  [/^AMD/i, "AMD"],
  [/^AZN/i, "AZN"],
];

const inconnues = new Map<string, number>();

/**
 * Lit un montant publié.
 *
 * « SFr. 94,- » → 94 CHF. Le « ,- » allemand marque l'absence de centimes, pas
 * une décimale : `94,-` vaut 94 et non 94,0 quelque chose. Un montant à
 * centimes s'écrit `94,50`, et se lit donc bien.
 */
function montant(brut: string | undefined): Montant | null {
  const s = (brut ?? "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const chiffres = /(\d[\d .']*)(?:,(\d{2}))?\s*,?-?/.exec(s);
  let valeur: number | null = null;
  if (chiffres) {
    const entier = (chiffres[1] ?? "").replace(/[ .']/g, "");
    const cents = chiffres[2];
    const n = Number(cents ? `${entier}.${cents}` : entier);
    valeur = Number.isFinite(n) ? n : null;
  }
  let devise: string | null = null;
  const sansEnv = s.replace(/^env\.\s*/i, "");
  for (const [re, iso] of DEVISES) {
    if (re.test(sansEnv)) {
      devise = iso;
      break;
    }
  }
  if (!devise) {
    const symbole = sansEnv.replace(/[\d .,'-]/g, "").trim();
    if (symbole) inconnues.set(symbole, (inconnues.get(symbole) ?? 0) + 1);
  }
  return { brut: s, valeur, devise };
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function page(url: string): Promise<string | null> {
  for (let essai = 0; essai <= REESSAIS; essai++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "text/html", "accept-language": "fr-FR,fr;q=0.9" },
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429 || res.status === 503) {
        throw new Refus(`${res.status} — ${(await res.text()).replace(/\s+/g, " ").slice(0, 120)}`);
      }
      if (res.status === 404) return null;
      if (!res.ok) {
        console.error(`  HTTP ${res.status} sur ${url}`);
        return null;
      }
      return await res.text();
    } catch (err) {
      if (err instanceof Refus) throw err;
      if (essai === REESSAIS) {
        console.error(`  ${url} : ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
      await dormir(3_000 * essai);
    }
  }
  return null;
}

/** Le contenu d'une cellule, désignée par son identifiant. */
function cellule(html: string, id: string): string | undefined {
  const m = new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(html);
  return m?.[1];
}

function lire(slug: string, source: { nom?: string | null; pays?: string | null }, html: string): Fiche {
  const bloc = /Prix des forfaits<\/h3>([\s\S]{0,1200}?)<\/table>/.exec(html);
  const libelle = bloc ? /<strong>([^<]+)<\/strong>/.exec(bloc[1] ?? "")?.[1]?.trim() ?? null : null;

  const local = {
    adultes: montant(cellule(html, "selTicketA")),
    jeunes: montant(cellule(html, "selTicketY")),
    enfants: montant(cellule(html, "selTicketC")),
  };
  const euro = {
    adultes: montant(cellule(html, "selTicketEurA")),
    jeunes: montant(cellule(html, "selTicketEurY")),
    enfants: montant(cellule(html, "selTicketEurC")),
  };
  const aUnPrix = local.adultes || local.jeunes || local.enfants;
  const aUnEuro = euro.adultes || euro.jeunes || euro.enfants;

  return {
    slug,
    nom: source.nom ?? null,
    pays: source.pays ?? null,
    libelle,
    prix: aUnPrix ? local : null,
    euroEnviron: aUnEuro ? euro : null,
  };
}

// ─── Le tour ──────────────────────────────────────────────────────────────────

type Sortie = {
  releve: string;
  source: string;
  robots: string;
  perimetre: string;
  avertissement: string;
  stations: number;
  avecPrix: number;
  /** Fiches « Europe » dont la source ne donne aucun pays : écartées, comptées. */
  sansPaysEcartees: number;
  fiches: Record<string, Fiche>;
};

const args = process.argv.slice(2);
const completer = args.includes("--completer");
const essaiIdx = args.indexOf("--essai");
const limite = essaiIdx >= 0 ? Number(args[essaiIdx + 1]) : 0;

const amont = JSON.parse(readFileSync(SOURCE, "utf8")) as {
  fiches: Record<string, { nom?: string | null; pays?: string | null; continent?: string | null }>;
};

/**
 * Une fiche sans pays n'entre pas dans un périmètre défini par pays.
 *
 * Le fil d'Ariane du site saute parfois le niveau du pays : trente-quatre
 * fiches portent « Europe » puis directement la région. Elles sont en majorité
 * russes — Kazan, Tsaritsyno, Krylatskoye, Gubakha —, et cinq ont même rendu
 * un prix en roubles, ce qui les aurait fait entrer dans un référentiel qui a
 * écarté la Russie. Mais `olellnice-v-orlick` est tchèque et
 * `tusheti-kaukasus-heliskiing` géorgien : les ranger toutes en Russie serait
 * une devinette.
 *
 * On applique donc la règle que `build-monde.py` tient déjà pour les domaines
 * qu'OpenSkiMap ne rattache à aucun pays : **écarter, et compter**. Le nombre
 * est publié dans le relevé pour que l'absence se voie.
 */
const sansPays = Object.entries(amont.fiches).filter(
  ([, f]) => CONTINENTS_EUROPE.has(f.continent ?? "") && !(f.pays ?? "").trim(),
);

const europeennes = Object.entries(amont.fiches).filter(
  ([, f]) => CONTINENTS_EUROPE.has(f.continent ?? "") && (f.pays ?? "").trim(),
);

let fiches: Record<string, Fiche> = {};
if (completer) {
  try {
    fiches = (JSON.parse(readFileSync(SORTIE, "utf8")) as Sortie).fiches;
    console.log(`Reprise : ${Object.keys(fiches).length} fiches déjà relevées.`);
  } catch {
    console.log("Aucun relevé antérieur : on part de zéro.");
  }
}

let restantes = europeennes.filter(([slug]) => !fiches[slug]);

// `--varie` prend un domaine par pays avant d'en reprendre un second.
//
// Les slugs sont alphabétiques : un essai de quarante fiches ne sortirait
// autrement que de Suède et de Norvège, et les symboles monétaires des vingt
// autres pays n'apparaîtraient qu'au bout de deux heures de tour.
if (args.includes("--varie")) {
  const parPays = new Map<string, [string, (typeof restantes)[number][1]][]>();
  for (const e of restantes) {
    const cle = e[1].pays ?? "?";
    (parPays.get(cle) ?? parPays.set(cle, []).get(cle)!).push(e);
  }
  const files = [...parPays.values()];
  const melange: typeof restantes = [];
  for (let i = 0; melange.length < restantes.length; i++) {
    for (const f of files) if (f[i]) melange.push(f[i]!);
    if (files.every((f) => i >= f.length)) break;
  }
  restantes = melange;
}

if (limite > 0) restantes = restantes.slice(0, limite);

function ecrire(): void {
  const avecPrix = Object.values(fiches).filter((f) => f.prix).length;
  const sortie: Sortie = {
    releve: new Date().toISOString(),
    source: BASE,
    robots: "Allow: /, recherche interdite ; fiches lues une à une, 2 s entre deux",
    perimetre:
      "fiches dont le fil d'Ariane du site dit « Europe » ou « Russie » — geo/pays.ts range la Russie en Europe",
    avertissement:
      "euroEnviron est la conversion publiée par le site, marquée « env. », sans taux ni date : ce n'est pas un prix et elle ne doit pas être affichée comme tel",
    stations: Object.keys(fiches).length,
    avecPrix,
    sansPaysEcartees: sansPays.length,
    fiches,
  };
  writeFileSync(SORTIE, JSON.stringify(sortie, null, 1) + "\n", "utf8");
}

console.log(`robots.txt de skiresort.fr : Allow: /, recherche interdite, fiches autorisées.`);
console.log(`Fiches européennes au relevé amont : ${europeennes.length}`);
console.log(`Écartées, faute de pays dans la source : ${sansPays.length}`);
console.log(`À relever maintenant                : ${restantes.length}`);
console.log(`Cadence : une requête toutes les ${INTERVALLE_MS / 1000} s, une à la fois.`);
console.log(
  `Durée attendue : ${Math.round((restantes.length * INTERVALLE_MS) / 60000)} minutes.\n`,
);

let faites = 0;
let arret: string | null = null;

for (const [slug, f] of restantes) {
  try {
    const h = await page(`${BASE}/domaine-skiable/${slug}/`);
    await dormir(INTERVALLE_MS);
    if (!h) continue;
    fiches[slug] = lire(slug, f, h);
    faites++;
  } catch (err) {
    if (err instanceof Refus) {
      // Un 429 arrête le tour, et dit pourquoi. Insister serait exactement ce
      // que le code de réponse demande de ne pas faire.
      arret = err.message;
      break;
    }
    throw err;
  }
  if (faites % SAUVE_TOUS === 0) {
    ecrire();
    const avecPrix = Object.values(fiches).filter((x) => x.prix).length;
    console.log(
      `  ${faites}/${restantes.length} — ${avecPrix} avec un prix (${Math.round(
        (avecPrix / Object.keys(fiches).length) * 100,
      )} %)`,
    );
  }
}

ecrire();

const total = Object.keys(fiches).length;
const avecPrix = Object.values(fiches).filter((f) => f.prix).length;
const devises = new Map<string, number>();
for (const f of Object.values(fiches)) {
  const d = f.prix?.adultes?.devise;
  if (d) devises.set(d, (devises.get(d) ?? 0) + 1);
}

console.log(`\nRelevé : ${total} fiches, ${avecPrix} avec un prix (${Math.round((avecPrix / Math.max(1, total)) * 100)} %).`);
console.log(`Devises reconnues : ${devises.size}`);
for (const [d, n] of [...devises].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${d}  ${n}`);
}
if (inconnues.size) {
  console.log(`\nSymboles non reconnus — à ajouter à la table, jamais à deviner :`);
  for (const [s, n] of [...inconnues].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${JSON.stringify(s)}  ${n}`);
  }
}
if (arret) console.log(`\nArrêt demandé par le site : ${arret}`);
