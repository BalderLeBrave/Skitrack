/**
 * Ce que la barre de recherche (accueil et fenêtre « Modifier la recherche »)
 * lit des stations : les massifs résumés, la station qu'un texte désigne, et
 * les suggestions du champ Destination.
 */

import { ICONES } from "@/components/maquette";
import { foldName, nomCorrespond, villageCherche } from "@/lib/carte";
import { communesPour, stationIdDeLaCommune } from "@/lib/communesProches";
import { tr, trN } from "@/lib/i18n";
import { STATIONS, stationById, type Station } from "@/lib/stations";
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
 * La station qu'un texte nomme en toutes lettres : son nom, le nom d'un de
 * ses villages (« Plagne Centre » désigne La Plagne), ou une commune
 * (« Lamoura » désigne Les Rousses, son domaine, pas le pin le plus proche).
 */
export function stationDuTexte(texte: string): Station | undefined {
  const cible = foldName(texte);
  if (!cible) return undefined;
  return (
    STATIONS.find((s) => foldName(s.name) === cible) ??
    STATIONS.find((s) => {
      const v = villageCherche(s.id, cible);
      return v !== null && foldName(v) === cible;
    }) ??
    stationById(stationIdDeLaCommune(cible) ?? "")
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
 * trois plus grands domaines. Champ rempli : trois massifs et douze stations
 * au plus dont le nom, un village ou le domaine contient le texte. Une
 * commune, une ville, un village ou une station du classeur qui n'est pas
 * écrite comme dans le référentiel propose la sienne : « Avoriaz 1800 »
 * propose Avoriaz, « Lamoura » Les Rousses. Un homonyme ne prend pas la
 * place de la station que le texte nomme.
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
  const station = (s: Station, village: string | null, procheKm: number | null): Suggestion => ({
    key: "s:" + s.id + (village ? ":" + foldName(village) : ""),
    type: "station",
    station: s,
    label: village ? tr("{village} ({station})", { village, station: s.name }) : s.name,
    kind:
      procheKm != null
        ? tr("Station la plus proche · {km} km", { km: procheKm })
        : (s.domain ?? s.massif),
    icone: ICONES.pin,
  });
  if (!ql) {
    return [
      ...MASSIFS.map(massif),
      ...[...STATIONS]
        .sort((a, b) => (b.pistesKm ?? 0) - (a.pistesKm ?? 0))
        .slice(0, 3)
        .map((s) => station(s, null, null)),
    ];
  }
  const parNom = STATIONS.filter(
    (s) => nomCorrespond(s, ql) || (!!s.domain && foldName(s.domain).includes(ql)),
  )
    .sort((a, b) => {
      const rang = (s: Station) => {
        const n = foldName(s.name);
        const d = foldName(s.domain ?? "");
        if (n === ql) return 0;
        if (n.startsWith(ql)) return 1;
        if (d === ql) return 2;
        if (d.startsWith(ql)) return 3;
        if (n.includes(ql)) return 4;
        return 5;
      };
      return rang(a) - rang(b) || a.name.localeCompare(b.name, "fr");
    })
    .slice(0, 12);
  const deja = new Set(parNom.map((s) => s.id));
  const communes = communesPour(ql)
    .filter((c) => {
      if (deja.has(c.stationId)) return false;
      // « La Grave » nomme déjà La Grave la Meije : pas le hameau homonyme.
      if (foldName(c.nom) === ql && parNom.some((s) => foldName(s.name).includes(ql))) return false;
      return true;
    })
    .slice(0, Math.max(0, 12 - parNom.length));
  return [
    ...MASSIFS.filter((x) => foldName(x.m).includes(ql)).slice(0, 3).map(massif),
    // Un village ou une commune renvoie à sa station : « Val Claret » propose
    // Tignes, « Lamoura » propose Les Rousses, et la suggestion dit pourquoi.
    ...parNom.map((s) => station(s, foldName(s.name).includes(ql) ? null : villageCherche(s.id, ql), null)),
    ...communes.flatMap((c) => {
      const s = stationById(c.stationId);
      return s ? [station(s, c.nom, c.domaine ? null : c.km)] : [];
    }),
  ];
}

/** `guestsLbl` de la maquette : « 8 pers. · 3 ch. », ou « studio accepté ». */
export function voyageursLbl(trav: number, rooms: number): string {
  return `${tr("{n} pers.", { n: trav })} · ${rooms ? tr("{n} ch.", { n: rooms }) : tr("studio accepté")}`;
}
