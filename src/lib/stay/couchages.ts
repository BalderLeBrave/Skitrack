/**
 * La capacité d'un logement, faute de mieux : la somme des couchages que sa
 * fiche décrit. Décision du propriétaire du 3 octobre 2026 : quand une fiche
 * ne chiffre pas sa capacité mais décrit ses lits, la capacité est la somme
 * de leurs places, **seulement si chaque couchage est chiffré** — un lit dont
 * on ne sait pas combien il couche, et rien n'est calculé.
 *
 * Ce qui chiffre un couchage :
 * - les places écrites : « 1 lit 2 pers. », « 3 lits 1 pers. », « 1 x 2 lits
 *   1 personne superposés », « canapé convertible 2 places » ;
 * - le type : lit double, grand lit, queen, king, full = 2 ; lit simple, une
 *   place, twin, single = 1 ; « lits superposés » = une place par lit (un lit
 *   superposé seul : deux) ;
 * - la largeur : 120 cm et plus = 2, moins = 1 (« canapé convertible 140X190 »).
 *
 * Ne comptent pas : lit bébé, lit parapluie, lit d'appoint pour enfant, et
 * les lits des services (« draps petit lit / grand lit », « lits faits »).
 */

/** La provenance d'une capacité ainsi calculée, dans `proven`. */
export const NOTE_COUCHAGES = "capacité : somme des couchages décrits";

const NOMBRES: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, an: 1,
};

const N = String.raw`(\d{1,2}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|one|two|three|four|five|seven|eight|nine|ten|an?)`;

function nombre(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  return NOMBRES[t] ?? null;
}

function plier(s: string): string {
  return s
    // Les entités d'un descriptif Ingénie (« &eacute; », « &bull; »).
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&([a-z])(?:acute|grave|circ|uml|cedil|ring|tilde);/gi, "$1")
    .replace(/&(?:[a-z]+|#\d+);/gi, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[×*]/g, "x")
    .replace(/\s+/g, " ");
}

/** Ce qui parle de lits sans être un couchage du logement. */
const HORS_COUCHAGE =
  /\b(?:lits? (?:de )?bebes?|lits? parapluie|lits? d'?appoint|lits? enfants?|baby ?cots?|cribs?|lits? faits?|linge de lit|draps?|parures?|housses?|couettes?|literie fournie)\b(?:[^.;:|]|\.\d)*/g;

type Motif = { re: RegExp; places: (m: RegExpExecArray) => number | null };

/** Dans l'ordre : le plus précis d'abord, chaque mention n'est comptée qu'une fois. */
const MOTIFS: Motif[] = [
  // « 1 x 2 lits 1 personne superposés »
  {
    re: new RegExp(String.raw`\b${N}\s*x\s*${N}\s*lits?\b[^.;|]{0,20}?\b(\d)\s*(?:pers\b\.?|personnes?|places?)`, "g"),
    places: (m) => {
      const a = nombre(m[1]), b = nombre(m[2]), c = Number(m[3]);
      return a != null && b != null ? a * b * c : null;
    },
  },
  // « 1 lit 2 pers. », « 3 lits 1 pers. », « 2 lits superposés 1 personne », « 1 lit 2 places »
  {
    re: new RegExp(String.raw`\b${N}\s*lits?\b(?:\s+(?:superposes?|gigognes?|simples?|doubles?|de))*\s*(\d)\s*(?:pers\b\.?|personnes?|places?|p\b)`, "g"),
    places: (m) => {
      const a = nombre(m[1]);
      return a != null ? a * Number(m[2]) : null;
    },
  },
  // canapé, convertible, BZ, clic-clac, divan, gigogne, sofa : places écrites
  {
    re: new RegExp(String.raw`(?:\b${N}\s+)?\b(?:canapes?(?:[- ]lits?)?|convertibles?|clic[- ]?clac|bz|divans?(?:[- ]lits?)?|gigognes?|futons?|sofa(?:[- ]?beds?)?)\b[^.;|]{0,30}?\b(\d)\s*(?:pers\b\.?|personnes?|places?|couchages?)`, "g"),
    places: (m) => (nombre(m[1]) ?? 1) * Number(m[2]),
  },
  // canapé, convertible… : largeur
  {
    re: new RegExp(String.raw`(?:\b${N}\s+)?\b(?:canapes?(?:[- ]lits?)?|convertibles?|clic[- ]?clac|bz|divans?(?:[- ]lits?)?|futons?)\b[^.;|]{0,30}?\b(\d{2,3})\s*(?:x\s*\d{2,3}|cm)`, "g"),
    places: (m) => (nombre(m[1]) ?? 1) * (Number(m[2]) >= 120 ? 2 : 1),
  },
  // grand lit, lit double, queen, king, full
  {
    re: new RegExp(String.raw`(?:\b${N}\s+)?\b(?:grands? lits?|lits? doubles?|lits? (?:queen|king)(?: size)?|(?:double|queen|king|full)(?:[- ]size)? beds?)\b`, "g"),
    places: (m) => (nombre(m[1]) ?? 1) * 2,
  },
  // lit simple, une place, single, twin
  {
    re: new RegExp(String.raw`(?:\b${N}\s+)?\b(?:lits? simples?|lits? (?:d'?)?une place|lits? 1 place|(?:single|twin)(?:[- ]size)? beds?|petits? lits?)\b`, "g"),
    places: (m) => nombre(m[1]) ?? 1,
  },
  // lits superposés sans places : une par lit ; « un lit superposé » : deux
  {
    re: new RegExp(String.raw`(?:\b${N}\s+)?\blits? superposes?\b`, "g"),
    places: (m) => {
      const a = nombre(m[1]) ?? 1;
      return a === 1 ? 2 : a;
    },
  },
  // lit et sa largeur : « 1 lit 140 », « lit 90x190 »
  {
    re: new RegExp(String.raw`(?:\b${N}\s+)?\blits?\b[^.;|,]{0,12}?\b(\d{2,3})\s*(?:x\s*\d{2,3}|cm)`, "g"),
    places: (m) => (nombre(m[1]) ?? 1) * (Number(m[2]) >= 120 ? 2 : 1),
  },
];

/** Un mot de couchage : s'il en reste un que rien n'a chiffré, on ne calcule rien. */
const MOT_COUCHAGE = /\b(?:lits?|canapes?|convertibles?|clic[- ]?clac|bz|divans?|gigognes?|futons?|sofas?|beds?|couchages?)\b/g;

/**
 * Des lits qui valent pour plusieurs pièces : « 2 chambres (1 lit 2
 * personnes) » (un lit par chambre, sans doute), « 3 chambres avec chacune un
 * lit double ». La somme se tromperait : rien.
 */
function ambigu(t: string): boolean {
  if (/\b(?:chacune?|each|par chambre|dans chaque|in each)\b/.test(t)) return true;
  // « 2 chambres avec grand lit » : un lit pour chacune, ou un pour les deux.
  for (const m of t.matchAll(new RegExp(String.raw`\b${N}\s+chambres?\b[^.;(]{0,30}?\b(?:lits?|grands? lits?|canapes?)\b`, "g"))) {
    const chambres = nombre(m[1]);
    if (chambres != null && chambres >= 2) return true;
  }
  // Une cabine dont le lit n'est pas décrit (« 2 chambres cabines (sans fenêtre) »).
  for (const m of t.matchAll(/\bcabines?\b([^.;]{0,40})/g)) {
    if (!/\b(?:lits?|canapes?|convertibles?|superposes?|bz)\b/.test(m[1] ?? "")) return true;
  }
  for (const m of t.matchAll(new RegExp(String.raw`\b${N}\s+chambres?\s*\(([^)]*)\)`, "g"))) {
    const chambres = nombre(m[1]);
    if (chambres == null || chambres < 2) continue;
    let lits = 0;
    for (const l of (m[2] ?? "").matchAll(new RegExp(String.raw`\b${N}\s*(?:x\s*${N}\s*)?(?:lits?|grands? lits?|canapes?|convertibles?)\b`, "g"))) {
      lits += (nombre(l[1]) ?? 1) * (l[2] != null ? (nombre(l[2]) ?? 1) : 1);
    }
    if (lits < chambres) return true;
  }
  return false;
}

/** Un couchage nommé au pluriel : « lits superposés », « grands lits ». */
const PLURIEL = /\b(?:lits|canapes|convertibles|divans|futons|sofas|beds)\b/;

/**
 * La capacité que donnent les couchages décrits, ou `null` : aucun couchage,
 * ou un couchage dont les places ne sont pas écrites. Un couchage sans nombre
 * vaut un s'il est au singulier (« chambre : lit queen size »), rien au
 * pluriel (« lits superposés ») ; `compteExige` : rien sans nombre du tout,
 * pour une liste d'équipements (« Lit 140 cm · Lit 90 cm », Orcières), qui
 * dit quels lits il y a, pas combien.
 */
export function capaciteDesCouchages(
  texte: string | null | undefined,
  opts: { compteExige?: boolean } = {},
): number | null {
  if (!texte) return null;
  let t = plier(texte).replace(HORS_COUCHAGE, " ");
  if (ambigu(t)) return null;
  let total = 0;
  let vus = 0;
  for (const { re, places } of MOTIFS) {
    re.lastIndex = 0;
    t = t.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpExecArray;
      const sansNombre = m[1] == null;
      if (sansNombre && (opts.compteExige || PLURIEL.test(m[0]))) return m[0];
      const p = places(m);
      if (p == null) return args[0] as string;
      total += p;
      vus += 1;
      return " ".repeat((args[0] as string).length);
    });
  }
  if (vus === 0) return null;
  // « couchages : » est un titre ; tout autre mot de couchage resté est un lit sans places.
  const restes = [...t.matchAll(MOT_COUCHAGE)].filter((m) => !/^couchages?$/.test(m[0]));
  if (restes.length > 0) return null;
  return total > 0 && total <= 99 ? total : null;
}
