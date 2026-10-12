/**
 * Ce que la barre de recherche (accueil et fenêtre « Modifier la recherche »)
 * lit des stations : les massifs résumés, la station qu'un texte désigne, et
 * les suggestions du champ Destination.
 */

import { ICONES } from "@/components/maquette";
import { foldName, nomCorrespond, villageCherche } from "@/lib/carte";
import { tr, trN } from "@/lib/i18n";
import { STATIONS, type Station } from "@/lib/stations";
import { maxM } from "@/lib/v7";

export type MassifResume = { m: string; n: number; hi: number };

/** Les massifs, par ordre alphabétique : nombre de stations et plus haut sommet. */
export function resumerMassifs(all: readonly Station[]): MassifResume[] {
  const ms = new Map<string, Station[]>();
  for (const s of all) ms.set(s.massif, [...(ms.get(s.massif) ?? []), s]);
  return [...ms.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "fr"))
    .map(([m, arr]) => ({ m, n: arr.length, hi: Math.max(...arr.map((s) => maxM(s) ?? 0)) }));
}

export const MASSIFS: readonly MassifResume[] = resumerMassifs(STATIONS);

/**
 * La station qu'un texte nomme en toutes lettres : son nom, ou le nom d'un de
 * ses villages (« Plagne Centre » désigne La Plagne). Comparaison sur le nom
 * replié : « megeve » trouve Megève.
 */
export function stationDuTexte(texte: string): Station | undefined {
  const cible = foldName(texte);
  if (!cible) return undefined;
  return (
    STATIONS.find((s) => foldName(s.name) === cible) ??
    STATIONS.find((s) => {
      const v = villageCherche(s.id, cible);
      return v !== null && foldName(v) === cible;
    })
  );
}

export type Suggestion = {
  key: string;
  label: string;
  kind: string;
  icone: string;
} & ({ type: "massif"; massif: string } | { type: "station"; station: Station });

/**
 * Les suggestions du champ Destination. Champ vide : les massifs puis les
 * trois plus grands domaines. Champ rempli : trois massifs et six stations
 * au plus dont le nom (ou un village) contient le texte.
 */
export function suggestions(ql: string): Suggestion[] {
  const massif = (x: MassifResume): Suggestion => ({
    key: "m:" + x.m,
    type: "massif",
    massif: x.m,
    label: x.m,
    kind: trN(x.n, "Massif · {n} station", "Massif · {n} stations"),
    icone: ICONES.mount,
  });
  const station = (s: Station, village: string | null): Suggestion => ({
    key: "s:" + s.id,
    type: "station",
    station: s,
    label: village ? tr("{village} ({station})", { village, station: s.name }) : s.name,
    kind: s.domain ?? s.massif,
    icone: ICONES.pin,
  });
  if (!ql) {
    return [
      ...MASSIFS.map(massif),
      ...[...STATIONS]
        .sort((a, b) => (b.pistesKm ?? 0) - (a.pistesKm ?? 0))
        .slice(0, 3)
        .map((s) => station(s, null)),
    ];
  }
  return [
    ...MASSIFS.filter((x) => foldName(x.m).includes(ql)).slice(0, 3).map(massif),
    // Un village renvoie à sa station : « Val Claret » propose Tignes, et la
    // suggestion dit pourquoi.
    ...STATIONS.filter((s) => nomCorrespond(s, ql))
      .slice(0, 6)
      .map((s) => station(s, foldName(s.name).includes(ql) ? null : villageCherche(s.id, ql))),
  ];
}

/** `guestsLbl` de la maquette : « 8 pers. · 3 ch. », ou « studio accepté ». */
export function voyageursLbl(trav: number, rooms: number): string {
  return `${tr("{n} pers.", { n: trav })} · ${rooms ? tr("{n} ch.", { n: rooms }) : tr("studio accepté")}`;
}
