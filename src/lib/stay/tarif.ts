/**
 * Ce que le montant affiché couvre, et ce qu'il ne couvre pas.
 *
 * Un loyer de centrale n'inclut pas la taxe de séjour : 3 500 € sur la
 * tuile, 3 660,16 € au paiement (3 500 + 160,16). Le panier de la
 * centrale publie les deux sommes ; on les additionne. Sans ce relevé,
 * on dit l'écart : « hors frais de séjour ». On n'invente pas un
 * 2,60 × personnes × nuits.
 *
 * Un prix Gîtes issu du relevé figé n'est pas un devis à ces dates. Le
 * widget ITEA, lui, publie un total daté : loyer + taxe de séjour
 * (`sp_montantPrixTotal`). Sans ce devis live, le montant n'est pas
 * publié, et la disponibilité n'est pas confirmée. Un « à partir de »
 * par semaine n'est pas ce total.
 */

import type { Listing } from "../listings.ts";

export function estDevisGitesLive(proven: string): boolean {
  return /devis ITEA live/i.test(proven);
}

/** Le loyer d'une centrale n'est pas le total payé, sauf si la taxe y est déjà. */
export function horsFraisSejour(l: {
  source: string;
  total: number;
  proven?: string | null;
  priceLabel?: string | null;
}): boolean {
  if (l.source !== "Centrale" || !(l.total > 0)) return false;
  if (l.proven && /taxe de s[ée]jour/i.test(l.proven)) return false;
  if (l.priceLabel && /taxe de s[ée]jour/i.test(l.priceLabel)) return false;
  return true;
}

/**
 * Un devis Gîtes live reste. Un montant figé ou replié n'est pas publié
 * maintenant : on le retire, pour ne pas confirmer une disponibilité.
 */
export function purgerTarifFigé<
  T extends {
    source: Listing["source"];
    total: number;
    proven: string;
    pricedCheckIn?: string | null;
    pricedCheckOut?: string | null;
    scannedAt?: number | null;
  },
>(l: T): T {
  if (l.source !== "Gîtes de France") return l;
  if (!(l.total > 0)) return l;
  if (estDevisGitesLive(l.proven)) return l;
  return { ...l, total: 0, pricedCheckIn: null, pricedCheckOut: null, scannedAt: null };
}

/** Un montant publié, espaces de groupement et virgule décimale compris. */
export function eurosPublie(texte: string): number | null {
  if (!texte) return null;
  const t = texte.replace(/\u00a0|\u202f/g, " ").replace(/&nbsp;/gi, " ").replace(/&#160;/gi, " ");
  const p = /([0-9][0-9 .]*)(?:[,.](\d{1,2}))?\s*(?:€|euros?)/i.exec(t);
  if (!p) return null;
  const entiere = (p[1] ?? "").replace(/[^\d]/g, "");
  if (!entiere) return null;
  const n = Number(`${entiere}.${(p[2] ?? "0").padEnd(2, "0")}`);
  if (!Number.isFinite(n) || n <= 0 || n > 200_000) return null;
  return Math.round(n * 100) / 100;
}

/** ITEA écrit `&euro;` ; le panier Ingénie écrit `€`. */
export function eurosItea(texte: string): number | null {
  if (!texte) return null;
  const t = texte.replace(/&euro;/gi, "€").replace(/&#8364;/gi, "€");
  const via = eurosPublie(t);
  if (via != null) return via;
  const n = Number(
    t
      .replace(/€/g, "")
      .replace(/\s|&nbsp;|&#160;/gi, "")
      .replace(",", "."),
  );
  if (!Number.isFinite(n) || n <= 0 || n > 200_000) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Taxe de séjour publiée **en une somme** pour le séjour, pas un tarif
 * à la nuit qu'il faudrait multiplier.
 */
export function taxeSejourSomme(html: string): number | null {
  if (!html) return null;
  const m = html.match(/taxe de s[ée]jour[^<]{0,160}?([\d\s\u00a0\u202f]+(?:[.,]\d{1,2})?)\s*€([^<]{0,48})/i);
  if (!m) return null;
  const voisin = `${m[0] ?? ""} ${m[2] ?? ""}`;
  if (/par\s+(?:nuit|jour|personne)/i.test(voisin)) return null;
  return eurosPublie(`${m[1] ?? ""} €`);
}

export type TarifRecap = {
  loyer: number;
  taxeSejour: number;
  total: number;
};

/**
 * Le recapitulatif de réservation : loyer d'une part, taxe de séjour
 * d'autre part, tels que la centrale les écrit dans le panier.
 */
export function tarifRecap(html: string): TarifRecap | null {
  if (!html) return null;
  let loyer: number | null = null;
  let taxe: number | null = null;
  const re = /<tr\b[^>]*ligne_tarif_formule[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const row = m[1] ?? "";
    const lib = (row.match(/class="libelle_formule"[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const prix = (row.match(/class="prix_formule"[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "").replace(
      /<[^>]+>/g,
      " ",
    );
    const n = eurosPublie(prix);
    if (n == null) continue;
    if (/taxe de s[ée]jour|frais de s[ée]jour/i.test(lib)) taxe = n;
    else if (/location|loyer|h[ée]bergement/i.test(lib)) loyer = n;
  }
  if (loyer == null || !(loyer > 0)) return null;
  const taxeSejour = taxe != null && taxe > 0 ? taxe : 0;
  return { loyer, taxeSejour, total: Math.round((loyer + taxeSejour) * 100) / 100 };
}

/** Identifiant de prestation Ingénie, forme `G-prestataire-prestation`. */
export function prestationIngenie(raw: string): string | null {
  if (!raw) return null;
  const deco = raw.replace(/&/g, "&");
  const a = deco.match(/PRESTATION-(G[-|][A-Za-z0-9|-]+)/i);
  if (a?.[1]) return a[1].replace(/\|/g, "-");
  const b = deco.match(/\bG\|(\d+)\|(\d+)\b/);
  if (b) return `G-${b[1]}-${b[2]}`;
  const c = deco.match(/\bG-(\d+)-(\d+)\b/);
  if (c) return `G-${c[1]}-${c[2]}`;
  return null;
}

/** `cid` et prestation publiés par le widget de la fiche. */
export function moteurIngenie(html: string): { prestation: string; cid: string } | null {
  if (!html) return null;
  const code =
    html.match(/"object"\s*:\s*\{[^}]{0,120}"code"\s*:\s*"(G[^"]+)"/i)?.[1] ??
    html.match(/\bcode["']?\s*:\s*["'](G[|][^"']+)["']/i)?.[1] ??
    null;
  const prestation = prestationIngenie(code ?? "") ?? prestationIngenie(html);
  if (!prestation) return null;
  const cid =
    html.match(/\bcid["']?\s*:\s*["']?(\d+)/i)?.[1] ??
    html.match(/name=["']cid["'][^>]*value=["'](\d+)["']/i)?.[1] ??
    html.match(/value=["'](\d+)["'][^>]*name=["']cid["']/i)?.[1] ??
    null;
  if (!cid) return null;
  return { prestation, cid };
}

export function cidDepuisUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("cid");
  } catch {
    const m = url.match(/[?&]cid=(\d+)/i);
    return m?.[1] ?? null;
  }
}

/** Pose le total du panier (loyer + taxe) à la place du seul loyer. */
export function poserRecap<
  T extends {
    source: Listing["source"];
    total: number;
    proven: string;
    priceLabel?: string | null;
  },
>(l: T, recap: TarifRecap): T {
  if (l.source !== "Centrale") return l;
  if (!(recap.loyer > 0) || !(recap.taxeSejour > 0)) return l;
  const proven = /taxe de s[ée]jour/i.test(l.proven)
    ? l.proven
    : `${l.proven} · taxe de séjour ${recap.taxeSejour} €`;
  return {
    ...l,
    total: recap.total,
    proven,
    priceLabel: "loyer et taxe de séjour",
  };
}

export type FicheItea = {
  ident: string;
  instance: string;
  exercice: string;
};

/** `data-ident` / `data-instance` / `data-exercice` du widget ITEA. Un gîte finit par `.G`. */
export function ficheItea(html: string): FicheItea | null {
  if (!html) return null;
  const ident = html.match(/data-ident="([^"]+)"/i)?.[1];
  const instance = html.match(/data-instance="([^"]+)"/i)?.[1];
  const exercice = html.match(/data-exercice="([^"]+)"/i)?.[1];
  if (!ident || !instance || !exercice) return null;
  if (!/\.G$/i.test(ident)) return null;
  return { ident, instance, exercice };
}

export type DevisItea = {
  loyer: number | null;
  taxeSejour: number | null;
  total: number;
  label: string | null;
};

function spanMontant(html: string, classe: string): number | null {
  const re = new RegExp(`<[^>]*\\b${classe}\\b[^>]*>([\\s\\S]*?)</`, "i");
  const m = html.match(re);
  return m ? eurosItea(m[1] ?? "") : null;
}

/**
 * Le total de séjour que le widget ITEA publie pour les dates demandées.
 *
 * Ce n'est pas le « à partir de » de la tuile Drupal, ni le
 * `product:price:amount` du widget. C'est `sp_montantPrixTotal` (loyer +
 * taxe), ou la somme des deux lignes quand le total n'est pas marqué.
 *
 * `contactSiNonVendable` : la source ne vend pas en ligne. Un `prixLoc`
 * dans ce JSON n'est pas un total de séjour (la taxe n'y est pas).
 */
export function devisItea(html: string): DevisItea | null {
  if (!html) return null;
  if (/contactSiNonVendable/i.test(html) && !/sp_montantPrixTotal/i.test(html)) return null;

  const loyer = spanMontant(html, "sp_montantLocation");
  const taxeSejour = spanMontant(html, "sp_montantTaxeSejour");

  let total: number | null = null;
  const tag = html.match(/<[^>]*\bsp_montantPrixTotal\b[^>]*>/i)?.[0];
  if (tag) {
    const dp = tag.match(/data-prix=["']([\d.,]+)["']/i)?.[1];
    if (dp) total = eurosItea(`${dp.replace(".", ",")} €`) ?? eurosItea(`${dp} €`);
  }
  if (total == null) total = spanMontant(html, "sp_montantPrixTotal");
  if (total == null) {
    const dpt = html.match(/data-prixtotal=["']([^"']+)["']/i)?.[1];
    if (dpt) total = eurosItea(dpt);
  }
  if (total == null && loyer != null && taxeSejour != null) {
    total = Math.round((loyer + taxeSejour) * 100) / 100;
  }
  if (total == null || !(total > 0)) return null;

  let label: string | null = null;
  if (loyer != null && taxeSejour != null && taxeSejour > 0) label = "loyer et taxe de séjour";
  else if (loyer != null) label = "loyer";

  return { loyer, taxeSejour, total, label };
}

export type StayDates = {
  checkIn: string;
  checkOut: string;
  guests: number;
};

/** Pose le devis ITEA live : total daté, provenance, tampon de relevé. */
export function poserDevis<
  T extends {
    source: Listing["source"];
    total: number;
    proven: string;
    priceLabel?: string | null;
    pricedCheckIn?: string | null;
    pricedCheckOut?: string | null;
    scannedAt?: number | null;
  },
>(l: T, devis: DevisItea, stay: StayDates, scannedAt = Date.now()): T {
  if (l.source !== "Gîtes de France") return l;
  if (!(devis.total > 0)) return l;
  const dates = `${stay.checkIn}→${stay.checkOut}`;
  let proven = `Devis ITEA live ${dates}, ${stay.guests} pers.`;
  if (devis.taxeSejour != null && devis.taxeSejour > 0) {
    proven = `${proven} · taxe de séjour ${devis.taxeSejour} €`;
  }
  return {
    ...l,
    total: devis.total,
    proven,
    priceLabel: devis.label,
    pricedCheckIn: stay.checkIn,
    pricedCheckOut: stay.checkOut,
    scannedAt,
  };
}

function codeGites(l: { id: string; url?: string | null }): string {
  const m = (l.id || "").match(/(\d{2}g\d{3,})/i) ?? (l.url || "").match(/(\d{2}g\d{3,})/i);
  return m ? m[1].toUpperCase() : l.id;
}

/**
 * Un relevé live sans devis ne doit pas effacer un total ITEA déjà posé
 * sur le relevé figé. On fusionne par code gîte : le devis live l'emporte,
 * sinon on garde le total déjà publié.
 */
export function conserverDevisGites<
  T extends {
    source: Listing["source"] | string;
    id: string;
    url?: string | null;
    total: number;
    proven: string;
  },
>(dump: T[], rows: T[]): T[] {
  const dumpG = dump.filter((l) => l.source === "Gîtes de France");
  const liveG = rows.filter((l) => l.source === "Gîtes de France");
  if (dumpG.length === 0 || liveG.length === 0) return rows;
  const map = new Map<string, T>();
  for (const l of dumpG) map.set(codeGites(l), l);
  for (const l of liveG) {
    const k = codeGites(l);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, l);
      continue;
    }
    const liveDevis = l.total > 0 && estDevisGitesLive(l.proven);
    const prevDevis = prev.total > 0 && estDevisGitesLive(prev.proven);
    if (liveDevis || (l.total > 0 && !prevDevis)) map.set(k, l);
  }
  return [...rows.filter((l) => l.source !== "Gîtes de France"), ...map.values()];
}
