/**
 * Les réseaux piétons des stations (`public/reseau-pieton/`, écrits par
 * `scripts/build-reseau-pieton.mjs`), chargés à la demande, une fois par
 * station, et leur champ de distances calculé une fois (`champDepuisGares`).
 *
 * L'index (`index.json`) dit quelles stations ont un fichier : aucune requête
 * ne part pour une station qui n'en a pas, et un index absent (données pas
 * encore générées) laisse tout à vol d'oiseau, sans erreur.
 */

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Listing } from "@/lib/listings";
import { appliquerAPiedListe, estAPied, type ReseauCalcule } from "@/lib/stay/aPied";
import { champDepuisGares, cheminVersGare, fichierValide, lireReseau } from "./reseauPieton";

const DOSSIER = "/reseau-pieton";

export type IndexReseaux = { le?: string; source?: string; stations: Record<string, unknown> };

let index: Promise<Set<string>> | null = null;
const charges = new Map<string, Promise<void>>();
/** `null` : pas de fichier, ou illisible. Absent : pas encore lu. */
const prets = new Map<string, ReseauCalcule | null>();
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

function chargerIndex(): Promise<Set<string>> {
  if (!index) {
    index = lireJson(`${DOSSIER}/index.json`).then((x) => {
      const st = (x as IndexReseaux | null)?.stations;
      return new Set(st && typeof st === "object" ? Object.keys(st) : []);
    });
  }
  return index;
}

function charger(stationId: string): Promise<void> {
  let p = charges.get(stationId);
  if (!p) {
    p = chargerIndex().then(async (ids) => {
      let calc: ReseauCalcule | null = null;
      if (ids.has(stationId)) {
        const f = await lireJson(`${DOSSIER}/${encodeURIComponent(stationId)}.json`);
        if (fichierValide(f)) {
          const reseau = lireReseau(f);
          calc = { reseau, champ: champDepuisGares(reseau) };
        }
      }
      prets.set(stationId, calc);
      prevenir();
    });
    charges.set(stationId, p);
  }
  return p;
}

/** Le réseau calculé d'une station : `undefined` tant qu'il se lit, `null`
 *  sans fichier. */
export function reseauCalcule(stationId: string | null | undefined): ReseauCalcule | null | undefined {
  return stationId ? prets.get(stationId) : null;
}

function abonner(f: () => void) {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
}

/** Lance la lecture des réseaux de ces stations ; rend un numéro qui change à
 *  chaque réseau arrivé, pour les mémos. */
export function useReseauxPietons(stationIds: readonly (string | null | undefined)[]): number {
  const v = useSyncExternalStore(
    abonner,
    () => version,
    () => 0,
  );
  const cle = [...new Set(stationIds.filter((x): x is string => !!x))].sort().join("|");
  useEffect(() => {
    if (!cle) return;
    for (const id of cle.split("|")) void charger(id);
  }, [cle]);
  return v;
}

/**
 * La liste avec la distance à pied de chaque annonce, dès que le réseau de sa
 * station est chargé (`appliquerAPied`). Avant, et sans réseau : la liste
 * telle quelle, à vol d'oiseau.
 */
export function useAPied<T extends Listing>(listings: readonly T[]): T[] {
  const ids = useMemo(() => listings.map((l) => l.stationId), [listings]);
  const v = useReseauxPietons(ids);
  return useMemo(
    () => {
      void v;
      return appliquerAPiedListe(listings, (id) => prets.get(id));
    },
    // `v` change à chaque réseau arrivé : la liste se remesure alors.
    [listings, v],
  );
}

/** Le chemin à pied du logement à sa remontée, pour la carte de la fiche ;
 *  `null` quand la distance n'est pas une marche. */
export function useCheminAPied(l: Listing | null | undefined): { lat: number; lon: number }[] | null {
  const v = useReseauxPietons([l?.stationId]);
  const lat = l?.lat;
  const lon = l?.lon;
  const marche = l ? estAPied(l) : false;
  const stationId = l?.stationId;
  return useMemo(() => {
    void v;
    if (!marche || lat == null || lon == null) return null;
    const calc = reseauCalcule(stationId);
    return calc ? cheminVersGare(calc.reseau, calc.champ, lat, lon) : null;
  }, [v, marche, lat, lon, stationId]);
}
