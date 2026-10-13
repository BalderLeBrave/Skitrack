/**
 * Les réseaux piétons des stations (`public/reseau-pieton/`, écrits par
 * `scripts/build-reseau-pieton.mjs`), chargés à la demande, une fois par
 * station, et leur champ de distances calculé une fois (`champDepuisGares`).
 *
 * L'index (`index.json`) dit quelles stations ont un fichier : aucune requête
 * ne part pour une station qui n'en a pas, et un index absent (données pas
 * encore générées) laisse tout à vol d'oiseau, sans erreur.
 *
 * Les réseaux routiers (`public/reseau-voiture/`, même script) se lisent de
 * même : ils donnent le trajet en voiture quand la marche est longue.
 */

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Listing } from "@/lib/listings";
import { appliquerAPiedListe, estAPied, estEnVoiture, type ReseauCalcule } from "@/lib/stay/aPied";
import { champDepuisGares, cheminVersGare, fichierValide, lireReseau, type ModeReseau } from "./reseauPieton";

const DOSSIERS: Record<ModeReseau, string> = { pied: "/reseau-pieton", voiture: "/reseau-voiture" };

export type IndexReseaux = { le?: string; source?: string; stations: Record<string, unknown> };

const index = new Map<ModeReseau, Promise<Set<string>>>();
/** Clés `mode:station`. */
const charges = new Map<string, Promise<void>>();
/** `null` : pas de fichier, ou illisible. Absent : pas encore lu. */
const prets = new Map<string, ReseauCalcule | null>();
const cle = (mode: ModeReseau, stationId: string) => `${mode}:${stationId}`;
let version = 0;
const abonnes = new Set<() => void>();

function prevenir() {
  version++;
  for (const f of abonnes) f();
}

async function lireJson(url: string): Promise<unknown> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    // Un serveur d'application peut rendre la page HTML à la place d'un
    // fichier absent : ce n'est pas du JSON, et c'est l'absence.
    return await r.json();
  } catch {
    return null;
  }
}

function chargerIndex(mode: ModeReseau): Promise<Set<string>> {
  let p = index.get(mode);
  if (!p) {
    p = lireJson(`${DOSSIERS[mode]}/index.json`).then((x) => {
      const st = (x as IndexReseaux | null)?.stations;
      return new Set(st && typeof st === "object" ? Object.keys(st) : []);
    });
    index.set(mode, p);
  }
  return p;
}

function charger(mode: ModeReseau, stationId: string): Promise<void> {
  const k = cle(mode, stationId);
  let p = charges.get(k);
  if (!p) {
    p = chargerIndex(mode).then(async (ids) => {
      let calc: ReseauCalcule | null = null;
      if (ids.has(stationId)) {
        const f = await lireJson(`${DOSSIERS[mode]}/${encodeURIComponent(stationId)}.json`);
        if (fichierValide(f)) {
          const reseau = lireReseau(f);
          calc = { reseau, champ: champDepuisGares(reseau) };
        }
      }
      prets.set(k, calc);
      prevenir();
    });
    charges.set(k, p);
  }
  return p;
}

/** Le réseau calculé d'une station, à pied ou en voiture : `undefined` tant
 *  qu'il se lit, `null` sans fichier. */
export function reseauCalcule(
  stationId: string | null | undefined,
  mode: ModeReseau = "pied",
): ReseauCalcule | null | undefined {
  return stationId ? prets.get(cle(mode, stationId)) : null;
}

function abonner(f: () => void) {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
}

/** Lance la lecture des réseaux, à pied et en voiture, de ces stations ; rend
 *  un numéro qui change à chaque réseau arrivé, pour les mémos. */
export function useReseauxPietons(stationIds: readonly (string | null | undefined)[]): number {
  const v = useSyncExternalStore(
    abonner,
    () => version,
    () => 0,
  );
  const ids = [...new Set(stationIds.filter((x): x is string => !!x))].sort().join("|");
  useEffect(() => {
    if (!ids) return;
    for (const id of ids.split("|")) {
      void charger("pied", id);
      void charger("voiture", id);
    }
  }, [ids]);
  return v;
}

/**
 * La liste avec la distance à pied de chaque annonce, dès que le réseau de sa
 * station est chargé (`appliquerAPied`), et son trajet en voiture quand la
 * marche est longue (`appliquerVoiture`). Avant, et sans réseau : la liste
 * telle quelle, à vol d'oiseau.
 */
export function useAPied<T extends Listing>(listings: readonly T[]): T[] {
  const ids = useMemo(() => listings.map((l) => l.stationId), [listings]);
  const v = useReseauxPietons(ids);
  return useMemo(
    () => {
      void v;
      return appliquerAPiedListe(
        listings,
        (id) => prets.get(cle("pied", id)),
        (id) => prets.get(cle("voiture", id)),
      );
    },
    // `v` change à chaque réseau arrivé : la liste se remesure alors.
    [listings, v],
  );
}

/** Le trajet du logement à sa remontée, pour la carte de la fiche : par la
 *  route quand il se fait en voiture (`estEnVoiture`), sinon à pied ; `null`
 *  quand la distance n'est ni l'un ni l'autre. */
export function useCheminAPied(
  l: Listing | null | undefined,
): { mode: ModeReseau; points: { lat: number; lon: number }[] } | null {
  const v = useReseauxPietons([l?.stationId]);
  const lat = l?.lat;
  const lon = l?.lon;
  const mode: ModeReseau | null = !l ? null : estEnVoiture(l) ? "voiture" : estAPied(l) ? "pied" : null;
  const stationId = l?.stationId;
  return useMemo(() => {
    void v;
    if (!mode || lat == null || lon == null) return null;
    const calc = reseauCalcule(stationId, mode);
    const points = calc ? cheminVersGare(calc.reseau, calc.champ, lat, lon) : null;
    return points ? { mode, points } : null;
  }, [v, mode, lat, lon, stationId]);
}
