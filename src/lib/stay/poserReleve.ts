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
