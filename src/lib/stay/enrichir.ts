/**
 * Ce qu'on peut encore lire sur une annonce déjà construite, sans relancer
 * un collecteur : titre, URL, type, galerie, identifiant Airbnb dans une photo.
 *
 * Le GPS Gîtes et l'accès ski se posent dans `searchStay`, qui connaît la
 * station. Ici, rien n'est estimé : on ne fait que poser ce que la source
 * a déjà écrit, ailleurs que dans le champ dédié.
 */

import type { Listing } from "../listings.ts";
import { galerieOf } from "./completude.ts";
import { occupancyOfListing } from "./occupancy.ts";
import { purgerTarifFigé } from "./tarif.ts";
import { titreDepuisUrl, titreEstFichier } from "./titre.ts";

const HOSTING = /Hosting-([A-Za-z0-9_%=+-]+)/i;
const ROOMS_PATH = /\/rooms\/(\d{5,})(?:[/?]|$)/i;

function decodeB64(s: string): string | null {
  try {
    const pad = s.replace(/-/g, "+").replace(/_/g, "/");
    const p = pad + "=".repeat((4 - (pad.length % 4)) % 4);
    return atob(p);
  } catch {
    return null;
  }
}

function idFromHostingToken(raw: string): string | null {
  let token = raw;
  try {
    token = decodeURIComponent(raw);
  } catch {
    /* déjà décodé */
  }
  if (/^\d{5,}$/.test(token)) return token;
  const decoded = decodeB64(token);
  if (!decoded) return null;
  const m = decoded.match(/(\d{5,})\s*$/);
  return m ? m[1] : null;
}

/** Identifiant Airbnb que la source a déjà écrit : URL, platformId, ou photo. */
export function airbnbIdOf(l: {
  url?: string | null;
  platformId?: string | null;
  photo?: string | null;
  photos?: string[] | null;
}): string | null {
  if (l.platformId && /^\d{5,}$/.test(l.platformId)) return l.platformId;
  if (l.url) {
    const m = ROOMS_PATH.exec(l.url);
    if (m) return m[1];
  }
  for (const u of galerieOf({ photo: l.photo ?? null, photos: l.photos })) {
    const h = HOSTING.exec(u);
    if (!h) continue;
    const id = idFromHostingToken(h[1]);
    if (id) return id;
  }
  return null;
}

export function enrichirListing(l: Listing): Listing {
  const title = titreEstFichier(l.title) ? (titreDepuisUrl(l.url) ?? l.title) : l.title;
  const occ = occupancyOfListing({ ...l, title });
  const photo = l.photo ?? galerieOf(l)[0] ?? null;
  const airbnbId = l.source === "Airbnb" ? airbnbIdOf(l) : null;
  const url = l.url ?? (airbnbId ? `https://www.airbnb.fr/rooms/${airbnbId}` : null);
  const platformId = l.platformId ?? airbnbId ?? null;
  // Le montant de la centrale est le loyer aux dates demandées, pas le
  // total payé : la taxe de séjour s'ajoute au paiement. L'étiquette
  // « à partir de » du gabarit n'en fait pas un tarif d'appel.
  const priceIndicative = l.source === "Centrale" && l.total > 0 ? null : (l.priceIndicative ?? null);
  const next = {
    ...l,
    title,
    ...occ,
    photo,
    url,
    platformId,
    priceIndicative,
  };
  return purgerTarifFigé(next);
}
