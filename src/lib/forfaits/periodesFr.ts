/**
 * Les périodes telles que les stations les écrivent, ramenées à des dates.
 *
 * « Du 21 au 27 novembre 2026 », « du Samedi 19/12/26 au Samedi 02/01/27 »,
 * « 19.12.26 - 06.01.27 », « de l'ouverture au 18/12/26 », « à partir du
 * 20 mars », « vacances de février », « hors vacances scolaires » : autant de
 * façons d'écrire une plage de jours. Ce module les lit et rend des plages
 * AAAA-MM-JJ, bornes incluses, pour une saison donnée.
 *
 * Ce qu'il ne fait pas : deviner. Une date seule n'est pas une plage (« 5/11
 * inclus » est un âge, pas le 5 novembre) ; « haute saison » sans date ne se
 * traduit pas ; « jusqu'au 30 novembre » sur une ligne qui parle d'achat est
 * une date limite de vente, pas une période de ski.
 *
 * Chargé tel quel par `node --experimental-strip-types` : aucun alias `@/`.
 */

import { bornesSaison } from "./tarifsPeriode.ts";
import {
  horsVacances,
  plageVacances,
  vacancesDeSaison,
  veille,
  ZONES,
  type Plage,
  type Zone,
} from "./vacancesScolaires.ts";

export type { Plage };

/** Ce qu'un texte dit d'une période. */
export type PeriodeLue = {
  plages: Plage[];
  /** `dates` : écrites ; `vacances` : tirées du calendrier scolaire. */
  nature: "dates" | "vacances";
  /** Une borne au moins est l'ouverture ou la fin de saison : « jusqu'au
   *  15 novembre », « à partir du 20 mars ». Seule, une telle ligne est
   *  souvent une date limite d'achat plutôt qu'une période de ski. */
  ouverte: boolean;
};

export const plier = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\b1er\b/g, "1")
    .replace(/\s+/g, " ")
    .trim();

const MOIS: Record<string, number> = {
  janvier: 1,
  janv: 1,
  jan: 1,
  fevrier: 2,
  fevr: 2,
  fev: 2,
  mars: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  juil: 7,
  aout: 8,
  septembre: 9,
  sept: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  decembre: 12,
  dec: 12,
};

const NOMS_MOIS = Object.keys(MOIS)
  .sort((a, b) => b.length - a.length)
  .join("|");

type Jeton = {
  debut: number;
  fin: number;
  jour: number;
  mois: number | null;
  annee: number | null;
};

/** Les mots qu'on peut trouver entre deux dates d'une même plage sans
 *  qu'ils en changent le sens : « du Samedi 19/12/26 au Samedi 02/01/27 ». */
const JOURS_SEMAINE = /\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|le)\b/g;

/** Toutes les dates d'un texte plié : numériques, en toutes lettres, ou un
 *  jour seul suivi d'un connecteur (« du 21 au 27 novembre »). */
function jetons(t: string): Jeton[] {
  const out: Jeton[] = [];
  const pris = (i: number) => out.some((j) => i >= j.debut && i < j.fin);
  const num = /(?<![\d,.:])(\d{1,2})[./](\d{1,2})(?:[./](\d{4}|\d{2}))?(?![\d,:/]|\s*ans\b)/g;
  const lettres = new RegExp(
    `(?<![\\d,.])(\\d{1,2})\\s+(${NOMS_MOIS})\\.?(?:\\s+(\\d{4}))?(?![a-z])`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = lettres.exec(t))) {
    out.push({
      debut: m.index,
      fin: m.index + m[0].length,
      jour: Number(m[1]),
      mois: MOIS[m[2]],
      annee: m[3] ? Number(m[3]) : null,
    });
  }
  while ((m = num.exec(t))) {
    if (pris(m.index)) continue;
    const a = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : null;
    out.push({
      debut: m.index,
      fin: m.index + m[0].length,
      jour: Number(m[1]),
      mois: Number(m[2]),
      annee: a,
    });
  }
  // Un jour seul, quand un connecteur le relie à une date complète :
  // « du 21 au 27 novembre 2026 », « 12 au 18/12 ».
  const seul = /(?<![\d,./:])(\d{1,2})(?=\s*(?:au|a|-)\s*(?:\w+\s+)?\d)/g;
  while ((m = seul.exec(t))) {
    if (pris(m.index)) continue;
    out.push({
      debut: m.index,
      fin: m.index + m[0].length,
      jour: Number(m[1]),
      mois: null,
      annee: null,
    });
  }
  return out.sort((a, b) => a.debut - b.debut);
}

function iso(annee: number, mois: number, jour: number): string | null {
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  if (d.getUTCMonth() !== mois - 1) return null;
  return d.toISOString().slice(0, 10);
}

/** L'année d'une date sans année : celle de la saison qui contient ce mois. */
function anneeDansSaison(mois: number, saison: string): number {
  const debut = Number(saison.slice(0, 4));
  return mois >= 8 ? debut : debut + 1;
}

function dateDe(j: Jeton, saison: string, repli?: Jeton): string | null {
  const mois = j.mois ?? repli?.mois ?? null;
  if (mois == null) return null;
  const annee = j.annee ?? (j.mois == null ? repli?.annee : null) ?? anneeDansSaison(mois, saison);
  return iso(annee, mois, j.jour);
}

/** Entre deux dates : un connecteur de plage, et rien d'autre. */
const CONNECTEUR = /^\s*(?:au|a|-|jusqu'?(?:au|a)|jusqu a|to)\s*$/;
/** Une date limite d'achat n'est pas une période de ski. */
const ACHAT =
  /reserv|achat|achet|vente|disponible|commande|prevente|early|en ligne|valable jusqu|applicable jusqu|inscri/;

/** Les plages de dates écrites dans un texte, pour une saison. */
export function plagesEcrites(texte: string, saison: string): Plage[] {
  return plagesLues(texte, saison).plages;
}

function plagesLues(texte: string, saison: string): { plages: Plage[]; ouverte: boolean } {
  const bornes = bornesSaison(saison);
  if (!bornes) return { plages: [], ouverte: false };
  const t = plier(texte);
  const js = jetons(t);
  const out: Plage[] = [];
  const utilises = new Set<number>();
  for (let i = 0; i + 1 < js.length; i += 1) {
    const a = js[i];
    const b = js[i + 1];
    const entre = t.slice(a.fin, b.debut).replace(JOURS_SEMAINE, " ");
    if (!CONNECTEUR.test(entre)) continue;
    const fin = dateDe(b, saison);
    const debut = dateDe(a, saison, b);
    if (!debut || !fin) continue;
    // « du 20 décembre au 2 janvier » sans année : la saison les place ; une
    // plage à l'envers est une lecture fausse, pas une période.
    if (debut > fin) continue;
    out.push({ debut, fin });
    utilises.add(i).add(i + 1);
    i += 1;
  }
  const achat = ACHAT.test(t);
  const fermees = out.length;
  for (let i = 0; i < js.length; i += 1) {
    if (utilises.has(i)) continue;
    const j = js[i];
    const d = dateDe(j, saison);
    if (!d || j.mois == null) continue;
    const avant = t.slice(Math.max(0, j.debut - 40), j.debut);
    const apres = t.slice(j.fin, j.fin + 40);
    if (/(?:ouverture|debut de saison)\s*(?:au|a|-|jusqu'?au)\s*(?:\w+\s+)?$/.test(avant)) {
      out.push({ debut: bornes.debut, fin: d });
    } else if (
      /^\s*(?:-|a|au|jusqu'?a)\s*(?:la\s+)?(?:fermeture|fin de saison|fin de la saison)/.test(apres)
    ) {
      out.push({ debut: d, fin: bornes.fin });
    } else if (
      !achat &&
      /(?:a partir du|a partir de|des le|des|a compter du|depuis le)\s*(?:\w+\s+)?$/.test(avant)
    ) {
      out.push({ debut: d, fin: bornes.fin });
    } else if (!achat && /(?:jusqu'?au|jusqu a)\s*(?:\w+\s+)?$/.test(avant)) {
      out.push({ debut: bornes.debut, fin: d });
    } else if (!achat && /avant le\s*(?:\w+\s+)?$/.test(avant)) {
      out.push({ debut: bornes.debut, fin: veille(d) });
    }
  }
  return {
    plages: out.sort((a, b) => (a.debut < b.debut ? -1 : 1)),
    ouverte: out.length > fermees,
  };
}

/** Les zones citées : « zone A », « zones B et C ». Toutes à défaut. */
export function zonesCitees(texte: string): Zone[] {
  const m = /\bzones?\s+([abc](?:\s*(?:,|et|&|\/)\s*[abc])*)\b/.exec(plier(texte));
  if (!m) return [...ZONES];
  return [...new Set(m[1].toUpperCase().match(/[ABC]/g) as Zone[])];
}

/** Les vacances nommées dans un texte, tirées du calendrier. */
export function plagesNommees(texte: string, saison: string): Plage[] {
  const t = plier(texte);
  const zones = zonesCitees(texte);
  const bornes = bornesSaison(saison);
  if (!bornes) return [];
  if (/hors vacances/.test(t)) return horsVacances(saison, bornes, zones);
  const out: Plage[] = [];
  const ajouter = (p: Plage | null) => p && out.push(p);
  if (/vacances (?:scolaires )?de noel|vacances de fin d'annee|fetes de fin d'annee/.test(t))
    ajouter(plageVacances(saison, "noel", zones));
  if (/vacances (?:scolaires )?(?:d'hiver|de fevrier)/.test(t))
    ajouter(plageVacances(saison, "hiver", zones));
  if (/vacances (?:scolaires )?(?:de printemps|de paques)/.test(t))
    ajouter(plageVacances(saison, "printemps", zones));
  if (!out.length && /vacances scolaires/.test(t)) return vacancesDeSaison(saison, zones);
  return out;
}

/**
 * Ce qu'un texte dit d'une période : ses dates écrites d'abord, les vacances
 * nommées à défaut. `null` quand il n'en dit rien de datable.
 */
export function periodeDepuisTexte(texte: string, saison: string): PeriodeLue | null {
  const ecrites = plagesLues(texte, saison);
  if (ecrites.plages.length)
    return { plages: ecrites.plages, nature: "dates", ouverte: ecrites.ouverte };
  const nommees = plagesNommees(texte, saison);
  if (nommees.length) return { plages: nommees, nature: "vacances", ouverte: false };
  return null;
}

/** Les saisons citées dans un texte : « 2026-2027 », « 2026/27 », « hiver 26/27 ». */
export function saisonsCitees(texte: string): string[] {
  const t = plier(texte);
  const out = new Set<string>();
  const longues = /(20\d{2})\s*[-/]\s*(?:20)?(\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = longues.exec(t))) {
    const a = Number(m[1]);
    if ((a + 1) % 100 === Number(m[2])) out.add(`${a}-${m[2]}`);
  }
  const courtes = /\b(?:hiver|saison|winter)\s*(\d{2})\s*[-/]\s*(\d{2})\b/g;
  while ((m = courtes.exec(t))) {
    const a = 2000 + Number(m[1]);
    if ((a + 1) % 100 === Number(m[2])) out.add(`${a}-${m[2]}`);
  }
  return [...out].sort();
}
