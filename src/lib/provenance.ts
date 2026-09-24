/**
 * La provenance d'une annonce, dite en phrases.
 *
 * `proven` est une trace de collecteur (« StaySearchResult live
 * 2027-02-06→2027-02-13 », « ITEA gites-web 2026-09-03, … · GPS ITEA »).
 * Les collecteurs ne sont pas touchés : on lit ici les champs de l'annonce,
 * et la trace seulement pour ce qu'elle seule porte (date du relevé figé,
 * voyageurs, repli, origine du GPS). Rien n'est inventé : un morceau absent
 * de la trace est simplement tu.
 */
import type { Listing } from "./listings.ts";

export type SujetProvenance = Pick<
  Listing,
  "source" | "total" | "proven" | "scannedAt" | "pricedCheckIn" | "pricedCheckOut"
> &
  Partial<Pick<Listing, "propertyType" | "platformId">>;

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function jourIso(iso: string): { j: number; m: number; a: number } | null {
  const m = ISO.exec(iso);
  if (!m) return null;
  return { a: Number(m[1]), m: Number(m[2]), j: Number(m[3]) };
}

function jourLbl(j: number): string {
  return j === 1 ? "1er" : String(j);
}

/** « 3 septembre 2026 ». */
export function dateLbl(iso: string): string | null {
  const d = jourIso(iso);
  if (!d || d.m < 1 || d.m > 12) return null;
  return `${jourLbl(d.j)} ${MOIS[d.m - 1]} ${d.a}`;
}

/** « du 6 au 13 février 2027 », « du 27 février au 6 mars 2027 », « du 30 décembre 2026 au 6 janvier 2027 ». */
export function periodeLbl(debut: string, fin: string): string | null {
  const a = jourIso(debut);
  const b = jourIso(fin);
  if (!a || !b || a.m < 1 || a.m > 12 || b.m < 1 || b.m > 12) return null;
  if (a.a !== b.a) return `du ${dateLbl(debut)} au ${dateLbl(fin)}`;
  if (a.m !== b.m) return `du ${jourLbl(a.j)} ${MOIS[a.m - 1]} au ${dateLbl(fin)}`;
  return `du ${jourLbl(a.j)} au ${dateLbl(fin)}`;
}

/** « le 24 septembre 2026 à 14 h 05 », à l'heure de Paris. */
export function instantLbl(ms: number): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const v = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const minutes = String(v("minute")).padStart(2, "0");
  return `le ${jourLbl(v("day"))} ${MOIS[v("month") - 1]} ${v("year")} à ${v("hour")} h ${minutes}`;
}

const CENTRALE = /^(.+?) \((?:Arkiane|Deskline|Ingénie|MSEM|Open System|Orchestra|iResa)\b/;

/** « sur Airbnb », « auprès de l'Office de tourisme de Tignes ». */
function aupresDe(l: SujetProvenance): string {
  if (l.source !== "Centrale") return `sur ${l.source}`;
  const nom = CENTRALE.exec(l.proven)?.[1]?.trim();
  return nom ? `auprès de ${nom}` : "auprès de la centrale de réservation de la station";
}

/** Date du relevé écrite dans la trace : une date ISO qui n'est pas une date de séjour (pas collée à « → »). */
function dateReleve(proven: string): string | null {
  const m = /(?<!→\s*)(\d{4}-\d{2}-\d{2})(?!\s*→)/.exec(proven);
  return m ? dateLbl(m[1]) : null;
}

function datesSejour(l: SujetProvenance): string | null {
  if (l.pricedCheckIn && l.pricedCheckOut) return periodeLbl(l.pricedCheckIn, l.pricedCheckOut);
  const m = /(\d{4}-\d{2}-\d{2})\s*→\s*(\d{4}-\d{2}-\d{2})/.exec(l.proven);
  return m ? periodeLbl(m[1], m[2]) : null;
}

function voyageurs(proven: string): number | null {
  const m = /(\d+)\s*pers\./.exec(proven);
  return m ? Number(m[1]) : null;
}

/**
 * La phrase de provenance du bas de fiche, en une ou plusieurs phrases.
 *
 * « Prix relevé sur Airbnb le 24 septembre 2026 à 14 h 05, pour 8 personnes,
 * du 6 au 13 février 2027. »
 */
export function provenancePhrase(l: SujetProvenance): string {
  const proven = l.proven ?? "";
  const repli = /repli/i.test(proven);
  const cozy = /CozyCozy/i.test(proven);

  const quoi = l.total > 0 ? "Prix relevé" : "Annonce relevée";
  const via = cozy ? " via le comparateur CozyCozy" : "";
  const releve = dateReleve(proven);
  const quand =
    l.scannedAt != null && !repli ? ` ${instantLbl(l.scannedAt)}` : releve ? ` le ${releve}` : "";
  const n = voyageurs(proven);
  const pour = n != null ? `pour ${n} personne${n > 1 ? "s" : ""}` : null;
  const dates = datesSejour(l);
  const cadre = [pour, dates].filter(Boolean).join(", ");

  const phrases: string[] = [];
  if (repli) {
    const repris = l.total > 0 ? "ce prix est repris" : "cette annonce est reprise";
    const deQuoi = releve ? `de notre relevé du ${releve}` : "d’un relevé antérieur";
    phrases.push(`Pas de résultat en direct ${aupresDe(l)} : ${repris} ${deQuoi}${cadre ? `, ${cadre}` : ""}.`);
  } else {
    phrases.push(`${quoi} ${aupresDe(l)}${via}${quand}${cadre ? `, ${cadre}` : ""}.`);
  }

  if (/complété par le relevé direct/i.test(proven)) {
    phrases.push(`Fiche complétée par un relevé direct sur ${l.source}.`);
  }
  if (/GPS ITEA/.test(proven)) {
    phrases.push("La position sur la carte est celle publiée par Gîtes de France.");
  } else if (/GPS Booking/.test(proven)) {
    phrases.push("La position sur la carte est celle publiée par Booking.");
  }
  return phrases.join(" ");
}

/**
 * La ligne « Source » de la liste de vérification, en phrase.
 *
 * « Logement de type « Appartement » proposé sur Airbnb (réf. 12345). »
 * Le type est cité tel que la source l'écrit : on ne l'accorde pas.
 */
export function sourcePhrase(l: SujetProvenance): string {
  const type = l.propertyType?.trim();
  const sujet = type ? `Logement de type « ${type} »` : "Logement";
  const ref = l.platformId ? ` (réf. ${l.platformId})` : "";
  if (l.source === "Centrale") {
    const nom = CENTRALE.exec(l.proven ?? "")?.[1]?.trim();
    return `${sujet} proposé par ${nom ?? "la centrale de réservation de la station"}${ref}.`;
  }
  return `${sujet} proposé sur ${l.source}${ref}.`;
}
