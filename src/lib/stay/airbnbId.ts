/**
 * L'identifiant Airbnb qu'une annonce porte déjà : `platformId`, URL
 * `rooms/`, ou le jeton `Hosting-` d'une photo. Sans lui, aucune page du
 * logement à lire. Module sans dépendance vers `logement.ts`, qui s'en sert
 * pour savoir si une capacité Airbnb peut encore venir de la page.
 */

import { galerieOf } from "./completude.ts";

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
