/**
 * Comparer les plateformes de réservation, pour le séjour en cours.
 *
 * Airbnb, Booking, Gîtes de France, la centrale, Abritel : ce que chacune
 * a publié, ce qu'elle a tarifé, ce qu'elle a confirmé. Rien n'est inventé.
 * Un loyer de centrale sans taxe relevée n'est pas le total payé ; un
 * montant Gîtes figé n'est pas un devis.
 */

import { availabilityOf, type Stay } from "./availability.ts";
import { completudeOf } from "./completude.ts";
import { estPauseApi } from "./deadline.ts";
import { horsFraisSejour } from "./tarif.ts";

export const ORDRE_PLATEFORMES = [
  "Centrale",
  "Airbnb",
  "Gîtes de France",
  "Booking",
  "Abritel",
] as const;

export type SujetPlateforme = {
  source: string;
  total: number;
  url?: string | null;
  guests?: number | null;
  bedrooms?: number | null;
  rooms?: number | null;
  lat?: number | null;
  lon?: number | null;
  photo?: string | null;
  photos?: string[] | null;
  proven?: string | null;
  priceLabel?: string | null;
  priceIndicative?: boolean | null;
  pricedCheckIn?: string | null;
  pricedCheckOut?: string | null;
  scannedAt?: number | null;
  missingSince?: { checkIn: string; checkOut: string } | null;
};

export type RapportSource = {
  source: string;
  ok: boolean;
  count: number;
  error?: string;
};

export type ColonnePlateforme = {
  source: string;
  n: number;
  nPrix: number;
  nConfirmes: number;
  nCompletes: number;
  moinsCher: number | null;
  couverture: string;
  releve: string;
};

export type IdCriterePlateforme =
  | "n"
  | "nPrix"
  | "nConfirmes"
  | "nCompletes"
  | "moinsCher"
  | "couverture"
  | "releve";

export type CriterePlateforme = {
  id: IdCriterePlateforme;
  label: string;
  note: string | null;
  /** `null` : le critère ne se classe pas (libellé, pas un chiffre). */
  num: (c: ColonnePlateforme) => number | null;
  txt: (c: ColonnePlateforme) => string | null;
  /** `true` : plus grand gagne. `false` : plus petit gagne. */
  max: boolean;
};

/** Un total « à partir de » n'est pas un total de séjour. */
function estTotalSejour(l: SujetPlateforme): boolean {
  return l.total > 0 && !l.priceIndicative;
}

function euros(n: number): string {
  return (
    n
      .toLocaleString("fr-FR", {
        minimumFractionDigits: n % 1 ? 2 : 0,
        maximumFractionDigits: 2,
      })
      .replace(/\u202f|\u00a0/g, " ") + " €"
  );
}

export function libelleCouverture(rows: SujetPlateforme[]): string {
  const priced = rows.filter(estTotalSejour);
  if (priced.length === 0) return "prix non publié";
  const hors = priced.filter((l) => horsFraisSejour(l));
  if (hors.length === priced.length) return "loyer, hors frais de séjour";
  if (hors.length > 0) return "loyer ; taxe quand le panier la publie";
  const avecTaxe = priced.every(
    (l) =>
      (l.proven && /taxe de s[ée]jour/i.test(l.proven)) ||
      (l.priceLabel && /taxe de s[ée]jour/i.test(l.priceLabel)),
  );
  if (avecTaxe) return "loyer et taxe de séjour";
  return "total relevé chez la source";
}

export function libelleReleve(report: RapportSource | undefined): string {
  if (!report) return "relevé figé";
  if (estPauseApi(report.error)) return "pause — relevé précédent conservé";
  if (!report.ok) return report.error?.trim() || "relevé en échec";
  return "relevé en direct";
}

export const CRITERES_PLATEFORME: CriterePlateforme[] = [
  {
    id: "n",
    label: "Annonces",
    note: "relevées pour ce séjour",
    num: (c) => c.n,
    txt: (c) => String(c.n),
    max: true,
  },
  {
    id: "nPrix",
    label: "Avec un total",
    note: "publié par la source, pas « à partir de »",
    num: (c) => (c.nPrix > 0 ? c.nPrix : null),
    txt: (c) => (c.nPrix > 0 ? String(c.nPrix) : "prix non publié"),
    max: true,
  },
  {
    id: "nConfirmes",
    label: "Disponibilité confirmée",
    note: "prix relevé aux dates, depuis moins de 6 h",
    num: (c) => (c.nConfirmes > 0 ? c.nConfirmes : null),
    txt: (c) => (c.nConfirmes > 0 ? String(c.nConfirmes) : "non confirmée"),
    max: true,
  },
  {
    id: "nCompletes",
    label: "Fiches complètes",
    note: "prix, capacité, chambres, GPS, photo, lien",
    num: (c) => (c.nCompletes > 0 ? c.nCompletes : null),
    txt: (c) => (c.nCompletes > 0 ? String(c.nCompletes) : "aucune"),
    max: true,
  },
  {
    id: "moinsCher",
    label: "Moins cher",
    note: "plus bas total publié",
    num: (c) => c.moinsCher,
    txt: (c) => (c.moinsCher != null ? euros(c.moinsCher) : null),
    max: false,
  },
  {
    id: "couverture",
    label: "Ce que le montant couvre",
    note: null,
    num: () => null,
    txt: (c) => c.couverture,
    max: true,
  },
  {
    id: "releve",
    label: "Provenance",
    note: null,
    num: () => null,
    txt: (c) => c.releve,
    max: true,
  },
];

export function ordreSources(
  listings: { source: string }[],
  reports?: RapportSource[] | null,
): string[] {
  const present = new Set<string>();
  for (const l of listings) if (l.source) present.add(l.source);
  for (const r of reports ?? []) if (r.source) present.add(r.source);
  const out: string[] = [];
  for (const n of ORDRE_PLATEFORMES) if (present.has(n)) out.push(n);
  const canon = new Set<string>(ORDRE_PLATEFORMES);
  for (const n of [...present].sort((a, b) => a.localeCompare(b, "fr"))) {
    if (!canon.has(n)) out.push(n);
  }
  return out;
}

function colonneOf(
  source: string,
  rows: SujetPlateforme[],
  stay: Stay,
  report: RapportSource | undefined,
  now: number,
): ColonnePlateforme {
  const priced = rows.filter(estTotalSejour);
  let moinsCher: number | null = null;
  for (const l of priced) {
    if (moinsCher == null || l.total < moinsCher) moinsCher = l.total;
  }
  return {
    source,
    n: rows.length,
    nPrix: priced.length,
    nConfirmes: rows.filter((l) => availabilityOf(l, stay, now).status === "confirmed").length,
    nCompletes: rows.filter((l) =>
      completudeOf({
        total: l.total,
        guests: l.guests ?? null,
        bedrooms: l.bedrooms ?? null,
        rooms: l.rooms ?? null,
        lat: l.lat ?? null,
        lon: l.lon ?? null,
        photo: l.photo ?? null,
        photos: l.photos ?? null,
        url: l.url ?? null,
      }).ok,
    ).length,
    moinsCher,
    couverture: libelleCouverture(rows),
    releve: libelleReleve(report),
  };
}

export function colonnesPlateforme(
  listings: SujetPlateforme[],
  stay: Stay,
  reports?: RapportSource[] | null,
  now: number = Date.now(),
): ColonnePlateforme[] {
  const names = ordreSources(listings, reports);
  return names.map((source) =>
    colonneOf(
      source,
      listings.filter((l) => l.source === source),
      stay,
      reports?.find((r) => r.source === source),
      now,
    ),
  );
}

/** La meilleure valeur du critère, si au moins deux colonnes la portent. */
export function valeurGagne(
  crit: CriterePlateforme,
  colonnes: ColonnePlateforme[],
  i: number,
): boolean {
  const vals = colonnes.map((c) => crit.num(c));
  const known = vals.filter((v): v is number => v != null);
  if (known.length < 2) return false;
  const v = vals[i];
  if (v == null) return false;
  const best = crit.max ? Math.max(...known) : Math.min(...known);
  return v === best;
}

export function voirAnnoncesLbl(n: number, source: string): string {
  if (n <= 0) return `Aucune annonce de ${source}`;
  if (n === 1) return `Voir l’annonce de ${source}`;
  return `Voir les ${n} annonces de ${source}`;
}
