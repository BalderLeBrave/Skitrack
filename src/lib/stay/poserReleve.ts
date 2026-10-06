/**
 * Recopie capacité, chambres et GPS d'un relevé déjà lu pour la même annonce.
 * Rien n'est estimé : c'est ce que la source avait publié, ailleurs que sur
 * la tuile du moment. Chaque valeur garde sa source : un champ structuré
 * passe devant le texte, et une valeur du texte (lue dans le titre du
 * relevé) ne comble qu'un champ vide.
 */

import { airbnbIdOf } from "./enrichir.ts";
import {
  poserValeur,
  qualifierLogement,
  sourceCapacite,
  sourceChambres,
  type SourceCapacite,
  type SourceValeur,
} from "./logement.ts";
import { titreEstFichier, titreDepuisUrl } from "./titre.ts";

export type SujetReleve = {
  source?: string | null;
  id?: string | null;
  url?: string | null;
  platformId?: string | null;
  photo?: string | null;
  photos?: string[] | null;
  title?: string | null;
  propertyType?: string | null;
  priceLabel?: string | null;
  capacity: number | null;
  bedrooms: number | null;
  rooms?: number | null;
  capacitySource?: SourceCapacite | null;
  bedroomsSource?: SourceValeur | null;
  isStudio?: boolean | null;
  lat: number | null;
  lon: number | null;
  locality?: string | null;
  proven: string;
};

function gitesCodeOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{2}g\d{3,})/i);
  return m ? m[1].toUpperCase() : null;
}

function plausible(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/** Clé stable d'une même annonce. */
export function cleListing(l: SujetReleve): string | null {
  if (l.source === "Airbnb") {
    const id = airbnbIdOf(l);
    return id ? `Airbnb:${id}` : null;
  }
  if (l.source === "Gîtes de France") {
    const code = gitesCodeOf(l.id) || gitesCodeOf(l.url);
    return code ? `Gîtes:${code}` : null;
  }
  if (l.platformId && String(l.platformId).trim()) return `${l.source ?? ""}:${String(l.platformId).trim()}`;
  if (l.id && String(l.id).trim()) return `${l.source ?? ""}:${String(l.id).trim()}`;
  if (l.url) {
    try {
      const u = new URL(l.url);
      return `${l.source ?? ""}:${u.origin}${u.pathname.replace(/\/$/, "")}`;
    } catch {
      return `${l.source ?? ""}:${l.url}`;
    }
  }
  return null;
}

/**
 * L'identité d'un bien : sa plateforme et son identifiant **sur cette
 * plateforme**, tels que `cleListing` les lit (identifiant Airbnb, code Gîtes,
 * `platformId`, à défaut l'identifiant de l'annonce). Deux annonces de même
 * clé sont le même logement relevé deux fois.
 *
 * Une centrale fait exception : toutes portent la source « Centrale », et
 * deux offices peuvent numéroter leurs biens de la même façon. Leur
 * identifiant d'annonce, préfixé du moteur et de l'office (`os-hmv-…`,
 * `dw-…`), est la clé.
 *
 * Une offre forfaits compris n'est pas la même offre que l'hébergement seul
 * du même bien : Mountain Collection, Maeva et Travelski publient les deux
 * sous un même `platformId` (`mc-2338` et `mc-2338-forfait`), à deux totaux.
 * Elles restent deux offres (`skiPassIncluded`, ou à défaut le suffixe
 * `-forfait` de l'identifiant).
 */
export function cleBien(l: SujetReleve & { id: string; skiPassIncluded?: boolean | null }): string {
  const bien = cleDuLogement(l);
  return estFormuleForfait(l) ? `${bien}:forfait` : bien;
}

/** L'offre est-elle la formule forfaits compris de son bien ? */
export function estFormuleForfait(l: { id: string; skiPassIncluded?: boolean | null }): boolean {
  return l.skiPassIncluded === true || /-forfait$/.test(l.id);
}

/**
 * Le logement d'une offre, quelle que soit sa formule : l'hébergement seul et
 * l'offre forfaits compris d'un même bien ont la même. Deux offres d'un même
 * logement, que `regrouper` réunit (`regroupement.ts`).
 */
export function cleDuLogement(l: SujetReleve & { id: string }): string {
  if (l.source === "Centrale") {
    // Les identifiants de centrale portent la formule (`…-forfait`) : le
    // logement est l'identifiant sans elle.
    return `Centrale:${l.id.replace(/-forfait$/, "")}`;
  }
  // `cleListing` rend `source:id` faute de `platformId` : la formule s'y
  // retire aussi.
  const cle = cleListing(l) ?? `${l.source ?? ""}:${l.id}`;
  return cle.replace(/-forfait$/, "");
}

type CopieDeBien = SujetReleve & { id: string; total?: number | null; skiPassIncluded?: boolean | null };

/**
 * Pour chaque bien (`cleBien`), dans l'ordre de sa première copie : la copie
 * gardée et toutes ses copies. La copie tarifée passe devant celle qui ne
 * l'est pas, puis la copie située, puis la moins chère, puis la première
 * rendue. La copie gardée est l'une des copies reçues, telle quelle.
 */
export function copiesParBien<T extends CopieDeBien>(listings: readonly T[]): Map<string, { gardee: T; copies: T[] }> {
  const tarifee = (l: T) => (l.total ?? 0) > 0;
  const meilleure = (a: T, b: T): boolean => {
    if (tarifee(a) !== tarifee(b)) return tarifee(a);
    const pa = plausible(a.lat, a.lon);
    if (pa !== plausible(b.lat, b.lon)) return pa;
    return tarifee(a) && (a.total ?? 0) < (b.total ?? 0);
  };
  const biens = new Map<string, { gardee: T; copies: T[] }>();
  for (const l of listings) {
    const k = cleBien(l);
    const b = biens.get(k);
    if (!b) biens.set(k, { gardee: l, copies: [l] });
    else {
      b.copies.push(l);
      if (meilleure(l, b.gardee)) b.gardee = l;
    }
  }
  return biens;
}

/** Ce qu'une position détermine sur une annonce (`attachAccess`) : repris
 *  ensemble, avec elle, jamais séparément. */
const CHAMPS_DE_POSITION = [
  "lat",
  "lon",
  "gpsSource",
  "distToSlopesM",
  "distToLiftM",
  "liftName",
  "liftKind",
  "liftLat",
  "liftLon",
  "liftOtherLat",
  "liftOtherLon",
  "placeName",
  "distToPlaceM",
  "domainFit",
  "nearestDomainId",
  "nearestDomainName",
  "distToNearestDomainM",
  "winterBarrier",
  "searchedLiftM",
  "searchedLiftName",
] as const;

/**
 * Un bien relevé deux fois (même plateforme, même identifiant) n'est gardé
 * qu'une fois, à la place de sa première copie (`copiesParBien`). Une
 * position qui ne manque qu'à la copie gardée est reprise d'une autre, avec
 * tout ce qu'elle détermine (distances, remontée, verdict de domaine) : c'est
 * le même logement, relevé pour la même station.
 *
 * Ce n'est pas `regrouper` (`regroupement.ts`), qui réunit les offres d'un
 * même logement **sur plusieurs plateformes** : ici, c'est la même offre.
 */
export function dedoublonnerParBien<T extends CopieDeBien>(listings: readonly T[]): T[] {
  return [...copiesParBien(listings).values()].map(({ gardee, copies }) => {
    if (plausible(gardee.lat, gardee.lon)) return gardee;
    const situee = copies.find((c) => plausible(c.lat, c.lon));
    if (!situee) return gardee;
    const out: Record<string, unknown> = { ...gardee };
    const donneur = situee as unknown as Record<string, unknown>;
    for (const k of CHAMPS_DE_POSITION) if (k in donneur) out[k] = donneur[k];
    return out as T;
  });
}

export function poserReleve<T extends SujetReleve, D extends SujetReleve>(rows: T[], dump: D[]): number {
  const index = new Map<string, D>();
  for (const raw of dump) {
    const d = qualifierLogement(raw);
    const key = cleListing(d);
    if (key && !index.has(key)) index.set(key, d);
  }
  let n = 0;
  for (const row of rows) {
    const key = cleListing(row);
    if (!key) continue;
    const d = index.get(key);
    if (!d) continue;
    let changed = false;
    // Chaque valeur avec sa source : un champ structuré passe devant le
    // texte ; une valeur du texte (« 6-8 pers ») ne comble qu'un vide.
    if (poserValeur(row, "capacity", d.capacity, sourceCapacite(d) ?? "structured")) changed = true;
    if (poserValeur(row, "bedrooms", d.bedrooms, sourceChambres(d) ?? "structured")) changed = true;
    if (poserValeur(row, "rooms", d.rooms, "structured")) changed = true;
    if (!plausible(row.lat, row.lon) && plausible(d.lat, d.lon)) {
      row.lat = d.lat;
      row.lon = d.lon;
      changed = true;
    }
    if (!row.locality && d.locality) {
      row.locality = d.locality;
      changed = true;
    }
    if (d.title && !titreEstFichier(d.title)) {
      const slug = titreDepuisUrl(row.url);
      if (titreEstFichier(row.title) || (slug != null && row.title === slug)) {
        row.title = d.title;
        changed = true;
      }
    }
    if (changed) {
      // Les chambres dérivées suivent les valeurs qui viennent d'arriver.
      Object.assign(row, qualifierLogement(row));
      if (!/relevé/.test(row.proven)) row.proven = `${row.proven} · relevé`;
      n += 1;
    }
  }
  return n;
}
