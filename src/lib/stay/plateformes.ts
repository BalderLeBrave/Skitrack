/**
 * Comparer les plateformes de réservation, pour le séjour en cours.
 *
 * Airbnb, Booking, Gîtes de France, la centrale, Abritel, GreenGo : ce que chacune
 * a publié, ce qu'elle a tarifé, ce qu'elle a confirmé. Rien n'est inventé.
 * Un loyer de centrale sans taxe relevée n'est pas le total payé ; un
 * montant Gîtes figé n'est pas un devis.
 */

import { availabilityOf, type Stay } from "./availability.ts";
import { completudeOf } from "./completude.ts";
import { estPauseApi } from "./deadline.ts";
import { horsFraisSejour } from "./tarif.ts";
import { langueIntl } from "../i18n/langue.ts";
import { aTraduire, tr, trN } from "../i18n/tr.ts";

export const ORDRE_PLATEFORMES = [
  "Centrale",
  "Airbnb",
  "Gîtes de France",
  "Booking",
  "Abritel",
  "GreenGo",
] as const;

export type SujetPlateforme = {
  source: string;
  total: number;
  url?: string | null;
  capacity?: number | null;
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
      .toLocaleString(langueIntl(), {
        minimumFractionDigits: n % 1 ? 2 : 0,
        maximumFractionDigits: 2,
      })
      .replace(/\u202f|\u00a0/g, " ") + " €"
  );
}

export function libelleCouverture(rows: SujetPlateforme[]): string {
  const priced = rows.filter(estTotalSejour);
  if (priced.length === 0) return tr("prix non publié");
  const hors = priced.filter((l) => horsFraisSejour(l));
  if (hors.length === priced.length) return tr("loyer, hors frais de séjour");
  if (hors.length > 0) return tr("loyer ; taxe de séjour quand la centrale la publie");
  const avecTaxe = priced.every(
    (l) =>
      (l.proven && /taxe de s[ée]jour/i.test(l.proven)) ||
      (l.priceLabel && /taxe de s[ée]jour/i.test(l.priceLabel)),
  );
  if (avecTaxe) return tr("loyer et taxe de séjour");
  return tr("total relevé chez la source");
}

export function libelleReleve(report: RapportSource | undefined): string {
  if (!report) return tr("relevé figé");
  if (estPauseApi(report.error)) return tr("pause : relevé précédent conservé");
  if (!report.ok) return report.error?.trim() || tr("relevé en échec");
  return tr("relevé en direct");
}

/** Libellés et notes en français : `tr(c.label)`, `tr(c.note)` au rendu. */
export const CRITERES_PLATEFORME: CriterePlateforme[] = [
  {
    id: "n",
    label: aTraduire("Annonces"),
    note: aTraduire("relevées pour ce séjour"),
    num: (c) => c.n,
    txt: (c) => String(c.n),
    max: true,
  },
  {
    id: "nPrix",
    label: aTraduire("Avec un total"),
    note: aTraduire("publié par la source, pas « à partir de »"),
    num: (c) => (c.nPrix > 0 ? c.nPrix : null),
    txt: (c) => (c.nPrix > 0 ? String(c.nPrix) : tr("prix non publié")),
    max: true,
  },
  {
    id: "nConfirmes",
    label: aTraduire("Disponibilité confirmée"),
    note: aTraduire("prix relevé pour ces dates il y a moins de 6 h"),
    num: (c) => (c.nConfirmes > 0 ? c.nConfirmes : null),
    txt: (c) => (c.nConfirmes > 0 ? String(c.nConfirmes) : tr("non confirmée")),
    max: true,
  },
  {
    id: "nCompletes",
    label: aTraduire("Fiches complètes"),
    note: aTraduire("prix, capacité, chambres, GPS, photo, lien"),
    num: (c) => (c.nCompletes > 0 ? c.nCompletes : null),
    txt: (c) => (c.nCompletes > 0 ? String(c.nCompletes) : tr("aucune")),
    max: true,
  },
  {
    id: "moinsCher",
    label: aTraduire("Moins cher"),
    note: aTraduire("plus bas total publié"),
    num: (c) => c.moinsCher,
    txt: (c) => (c.moinsCher != null ? euros(c.moinsCher) : null),
    max: false,
  },
  {
    id: "couverture",
    label: aTraduire("Ce que le montant couvre"),
    note: null,
    num: () => null,
    txt: (c) => c.couverture,
    max: true,
  },
  {
    id: "releve",
    label: aTraduire("Provenance"),
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
        capacity: l.capacity ?? null,
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

/** « de Booking », mais « d’Airbnb » : élision devant une voyelle. L'anglais
 *  place la source devant : « See the 3 Booking listings ». */
function elision(source: string): boolean {
  return /^[aeiouàâäéèêëîïôöùûü]/i.test(source);
}

export function voirAnnoncesLbl(n: number, source: string): string {
  const e = elision(source);
  if (n <= 0) return e ? tr("Aucune annonce d’{source}", { source }) : tr("Aucune annonce de {source}", { source });
  if (n === 1) return e ? tr("Voir l’annonce d’{source}", { source }) : tr("Voir l’annonce de {source}", { source });
  return e
    ? trN(n, "Voir l’annonce d’{source}", "Voir les {n} annonces d’{source}", { source })
    : trN(n, "Voir l’annonce de {source}", "Voir les {n} annonces de {source}", { source });
}
