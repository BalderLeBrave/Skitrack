/**
 * Ce que le montant affiché couvre, et ce qu'il ne couvre pas.
 *
 * Un loyer de centrale n'est pas le total payé. Le panier publie le
 * total (`calculerTotalPrestationAjax`) : loyer + taxe, que la taxe
 * soit une somme ou un pourcentage. On pose ce total, on n'applique
 * pas nous-mêmes 5,5 %. Sans ce relevé, le loyer de la tuile reste.
 *
 * Un prix Gîtes issu du relevé figé n'est pas un devis à ces dates. Le
 * widget ITEA, lui, publie un total daté : loyer + taxe de séjour
 * (`sp_montantPrixTotal`). Sans ce devis live, le montant n'est pas
 * publié. Un « à partir de » par semaine n'est pas ce total.
 */

import { montantCents } from "../devises.ts";
import type { Listing } from "../listings.ts";

export function estDevisGitesLive(proven: string): boolean {
  return /devis ITEA live/i.test(proven);
}

/**
 * Un gîte n'est une offre que si ITEA a publié un total de séjour
 * pour ces dates. `prixLoc` d'un `contactSiNonVendable` n'en est pas un
 * (pas de taxe, et souvent `OCC` : occupé, à appeler). Un relevé figé
 * non plus. On n'annonce pas la capacité, le GPS ni un prix tant que
 * ce devis n'est pas lu.
 */
export function estOffreGitesVerifiee(l: {
  source?: string;
  total?: number | null;
  proven?: string | null;
}): boolean {
  if (l.source !== "Gîtes de France") return true;
  return (l.total ?? 0) > 0 && estDevisGitesLive(l.proven ?? "");
}

/** Le loyer d'une centrale n'est pas le total payé, sauf si la taxe y est déjà. */
export function horsFraisSejour(l: {
  source: string;
  total: number;
  proven?: string | null;
  priceLabel?: string | null;
}): boolean {
  if (l.source !== "Centrale" || !(l.total > 0)) return false;
  if (l.proven && /panier|taxe de s[ée]jour/i.test(l.proven)) return false;
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
    : `${l.proven} · taxe de séjour ${montantCents(recap.taxeSejour)}`;
  return {
    ...l,
    total: recap.total,
    proven,
    priceLabel: "loyer et taxe de séjour",
  };
}

/** Attribut HTML, guillemets doubles ou simples. */
function attrOf(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  if (!m) return undefined;
  return m[1] ?? m[2] ?? "";
}

/** Champs du formulaire de recap, pour `calculerTotalPrestationAjax`. */
export function champsRecap(html: string, guests: number): URLSearchParams {
  const p = new URLSearchParams();
  if (!html) return p;
  const input = /<input\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = input.exec(html))) {
    const tag = m[0];
    const name = attrOf(tag, "name");
    if (!name) continue;
    const type = (attrOf(tag, "type") ?? "text").toLowerCase();
    const value = attrOf(tag, "value") ?? "";
    const disabled = /\bdisabled\b/i.test(tag);
    if (type === "hidden") p.append(name, value);
    else if (type === "checkbox" && /\bchecked\b/i.test(tag) && !disabled) p.append(name, value || "on");
  }
  const select = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  while ((m = select.exec(html))) {
    const name = attrOf(m[1] ?? "", "name") ?? "";
    const corps = m[2] ?? "";
    const sel =
      /<option[^>]*value="([^"]*)"[^>]*\bselected\b/i.exec(corps)?.[1] ??
      /<option[^>]*\bselected\b[^>]*value="([^"]*)"/i.exec(corps)?.[1] ??
      /<option[^>]*value='([^']*)'[^>]*\bselected\b/i.exec(corps)?.[1] ??
      "";
    const val = /nb_personnes_MTAXE/i.test(name) && guests > 0 ? String(guests) : sel;
    if (name) p.set(name, val);
  }
  return p;
}

/** Total publié par `calculerTotalPrestationAjax` (`data.total`). */
export function totalPanierJson(raw: string): number | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { success?: unknown; data?: { total?: unknown } };
    if (j.success !== 1 && j.success !== true) return null;
    const t = j.data?.total;
    if (typeof t !== "string" && typeof t !== "number") return null;
    return typeof t === "number" ? (t > 0 && t <= 200_000 ? Math.round(t * 100) / 100 : null) : eurosPublie(t) ?? eurosItea(t);
  } catch {
    return null;
  }
}

/** Pose le total du panier, tel que la centrale le calcule. */
export function poserPanier<
  T extends {
    source: Listing["source"];
    total: number;
    proven: string;
    priceLabel?: string | null;
    scannedAt?: number | null;
  },
>(l: T, total: number, scannedAt = Date.now()): T {
  if (l.source !== "Centrale") return l;
  if (!(total > 0)) return l;
  const proven = /panier/i.test(l.proven) ? l.proven : `${l.proven} · panier`;
  return {
    ...l,
    total,
    proven,
    scannedAt,
    priceLabel: l.priceLabel && /taxe de s[ée]jour/i.test(l.priceLabel) ? l.priceLabel : "loyer et taxe de séjour",
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
 * `contactSiNonVendable` : la source ne vend pas en ligne à ces dates
 * (`OCC`, occupé, ou centrale à appeler). Un `prixLoc` dans ce JSON
 * est un tarif de catalogue, pas le total du séjour.
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
    proven = `${proven} · taxe de séjour ${montantCents(devis.taxeSejour)}`;
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
    title?: string;
    total: number;
    proven: string;
  },
>(dump: T[], rows: T[]): T[] {
  const dumpG = dump.filter((l) => l.source === "Gîtes de France" && !/fiche introuvable/i.test(l.proven));
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
    const url = l.url && /gites-de-france\.com/i.test(l.url) ? l.url : prev.url;
    const title = l.title && l.title.trim().length >= 4 ? l.title : prev.title;
    if (liveDevis || (l.total > 0 && !prevDevis)) {
      map.set(k, { ...l, url: url ?? l.url, title: title ?? l.title });
    } else {
      map.set(k, { ...prev, url: url ?? prev.url, title: title ?? prev.title });
    }
  }
  return [
    ...rows.filter((l) => l.source !== "Gîtes de France"),
    ...[...map.values()].filter(estOffreGitesVerifiee),
  ];
}
