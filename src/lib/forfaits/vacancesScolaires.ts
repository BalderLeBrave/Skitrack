/**
 * Le calendrier des vacances scolaires françaises, par zone.
 *
 * Les stations publient des tarifs « vacances de février » ou « hors vacances
 * scolaires » sans dates : pour les ranger dans une saison, il faut savoir
 * quand tombent ces vacances, et elles ne tombent pas au même moment selon la
 * zone. Faute de précision du site, on retient la plage qui couvre les trois
 * zones : un forfait « vacances d'hiver » s'applique dès que l'une d'elles est
 * en vacances.
 *
 * Sources, lues le 30 septembre 2026 :
 * - 2025-26 : arrêté du 7 décembre 2022 (Légifrance) ;
 * - 2026-27 : arrêté du 22 octobre 2025 ;
 * - 2027-28 : arrêté du 21 juillet 2026 ;
 * reprises par Service-Public.fr (page F31952, vérifiée le 2 septembre 2026).
 *
 * Les dates sont celles des textes : le samedi du départ, et le jour de la
 * reprise des cours. Le dernier jour de vacances est donc la veille de la
 * reprise.
 *
 * Chargé tel quel par `node --experimental-strip-types` : aucun alias `@/`.
 */

export type Zone = "A" | "B" | "C";
export const ZONES: readonly Zone[] = ["A", "B", "C"];

export type NomVacances = "toussaint" | "noel" | "hiver" | "printemps";

type Vacances = { depart: string; reprise: string };
type Annee = Record<NomVacances, Record<Zone, Vacances>>;

const toutes = (depart: string, reprise: string): Record<Zone, Vacances> => ({
  A: { depart, reprise },
  B: { depart, reprise },
  C: { depart, reprise },
});

/** Par saison (« 2026-27 »), qui est aussi l'année scolaire. */
export const CALENDRIER: Record<string, Annee> = {
  "2025-26": {
    toussaint: toutes("2025-10-18", "2025-11-03"),
    noel: toutes("2025-12-20", "2026-01-05"),
    hiver: {
      A: { depart: "2026-02-07", reprise: "2026-02-23" },
      B: { depart: "2026-02-14", reprise: "2026-03-02" },
      C: { depart: "2026-02-21", reprise: "2026-03-09" },
    },
    printemps: {
      A: { depart: "2026-04-04", reprise: "2026-04-20" },
      B: { depart: "2026-04-11", reprise: "2026-04-27" },
      C: { depart: "2026-04-18", reprise: "2026-05-04" },
    },
  },
  "2026-27": {
    toussaint: toutes("2026-10-17", "2026-11-02"),
    noel: toutes("2026-12-19", "2027-01-04"),
    hiver: {
      A: { depart: "2027-02-13", reprise: "2027-03-01" },
      B: { depart: "2027-02-20", reprise: "2027-03-08" },
      C: { depart: "2027-02-06", reprise: "2027-02-22" },
    },
    printemps: {
      A: { depart: "2027-04-10", reprise: "2027-04-26" },
      B: { depart: "2027-04-17", reprise: "2027-05-03" },
      C: { depart: "2027-04-03", reprise: "2027-04-19" },
    },
  },
  "2027-28": {
    toussaint: toutes("2027-10-23", "2027-11-08"),
    noel: toutes("2027-12-18", "2028-01-03"),
    hiver: {
      A: { depart: "2028-02-19", reprise: "2028-03-06" },
      B: { depart: "2028-02-05", reprise: "2028-02-21" },
      C: { depart: "2028-02-12", reprise: "2028-02-28" },
    },
    printemps: {
      A: { depart: "2028-04-22", reprise: "2028-05-09" },
      B: { depart: "2028-04-08", reprise: "2028-04-24" },
      C: { depart: "2028-04-15", reprise: "2028-05-02" },
    },
  },
};

export type Plage = { debut: string; fin: string };

/** La veille d'un jour AAAA-MM-JJ. */
export function veille(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Le lendemain d'un jour AAAA-MM-JJ. */
export function lendemain(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Les jours de vacances d'une période, du premier jour à la veille de la
 * reprise, couvrant les zones demandées (les trois par défaut). `null` si la
 * saison n'est pas au calendrier.
 */
export function plageVacances(
  saison: string,
  nom: NomVacances,
  zones: readonly Zone[] = ZONES,
): Plage | null {
  const annee = CALENDRIER[saison];
  if (!annee || !zones.length) return null;
  const v = zones.map((z) => annee[nom][z]);
  const debut = v.map((x) => x.depart).sort()[0];
  const reprise = v.map((x) => x.reprise).sort()[v.length - 1];
  return { debut, fin: veille(reprise) };
}

/** Les vacances d'une saison de ski : Noël, hiver, printemps. */
export function vacancesDeSaison(saison: string, zones: readonly Zone[] = ZONES): Plage[] {
  const out: Plage[] = [];
  for (const nom of ["noel", "hiver", "printemps"] as const) {
    const p = plageVacances(saison, nom, zones);
    if (p) out.push(p);
  }
  return out;
}

/**
 * Ce qui n'est pas en vacances, dans une fenêtre donnée : le complément des
 * vacances de Noël, d'hiver et de printemps. Vide si la saison n'est pas au
 * calendrier : « hors vacances » sans calendrier ne se devine pas.
 */
export function horsVacances(
  saison: string,
  fenetre: Plage,
  zones: readonly Zone[] = ZONES,
): Plage[] {
  if (!CALENDRIER[saison]) return [];
  const vac = vacancesDeSaison(saison, zones).sort((a, b) => (a.debut < b.debut ? -1 : 1));
  const out: Plage[] = [];
  let curseur = fenetre.debut;
  for (const v of vac) {
    if (v.fin < curseur) continue;
    if (v.debut > fenetre.fin) break;
    if (v.debut > curseur)
      out.push({
        debut: curseur,
        fin: veille(v.debut) < fenetre.fin ? veille(v.debut) : fenetre.fin,
      });
    curseur = lendemain(v.fin);
  }
  if (curseur <= fenetre.fin) out.push({ debut: curseur, fin: fenetre.fin });
  return out;
}
