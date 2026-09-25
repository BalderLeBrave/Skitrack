/**
 * Mode « fiches » du worker Airbnb (`scrape/airbnb/pdp.py`, `run_fiches`) :
 * la demande et ce que Node lit de la réponse. Pur : ni processus, ni réseau,
 * pour être testé seul. Le lancement est dans `airbnb.server.ts`
 * (`lireFichesAirbnb`).
 *
 * Une fiche PDP donne capacité, chambres, GPS et type de chambre. Rien n'est
 * estimé : un nombre hors bornes est jeté, pas corrigé.
 */

/** Pourquoi une tranche s'est arrêtée. Seul `refus` veut dire qu'Airbnb a refusé. */
export type ArretFiches =
  "refus" | "coupe-circuit" | "rythme" | "echeance" | "hash" | "illisible" | "cle" | "worker";

export type FicheAirbnb = {
  guests: number | null;
  bedrooms: number | null;
  rooms: number | null;
  lat: number | null;
  lon: number | null;
  /** « Entire home/apt », « Private room », « Hotel room »… tel qu'Airbnb l'écrit. */
  roomType: string | null;
  /** « Logement entier : chalet »… : le type publié, quand la fiche le dit. */
  typeLogement: string | null;
  /** Hôtel, chambre (privée, partagée, d'hôtes) ou hébergement insolite : l'annonce sort. */
  ecartee: boolean;
};

export type LectureFichesAirbnb = {
  /** Par identifiant Airbnb (chiffres), les fiches lues. */
  fiches: Record<string, FicheAirbnb>;
  /** Lues, mais sans rien d'utile : annonce retirée, réponse vide. Ne pas redemander dans la course. */
  vides: string[];
  /** Non lues : à redemander à la tranche suivante, si l'arrêt le permet. */
  restants: string[];
  /** Requêtes réellement parties vers Airbnb. */
  lues: number;
  /** `null` : la tranche est allée au bout. */
  arret: ArretFiches | null;
  /** Le texte de l'arrêt, pour le journal et le bandeau. Seul un refus dit « HTTP … ». */
  raison?: string;
  /** Pour `rythme` : l'attente que le limiteur a demandée. */
  attenteMs?: number;
};

export type DemandeFichesAirbnb = {
  ids: readonly string[];
  checkIn: string;
  checkOut: string;
  adults: number;
  /** Instant absolu (`Date.now()`) avant lequel la tranche doit avoir rendu. 45 s par défaut. */
  echeance?: number;
  /** Secondes entre deux fiches, en plus de l'écart du limiteur (4 par défaut, 2 au moins). */
  pauseS?: number;
};

export const ID_AIRBNB = /^\d{5,20}$/;
/** Même borne que `MAX_IDS` de `pdp.py`. */
export const MAX_FICHES_TRANCHE = 60;
export const ECHEANCE_FICHES_MS = 45_000;

const ARRETS = new Set<ArretFiches>([
  "refus",
  "coupe-circuit",
  "rythme",
  "echeance",
  "hash",
  "illisible",
  "cle",
  "worker",
]);

const LIBELLE: Record<ArretFiches, string> = {
  refus: "Airbnb a refusé une fiche",
  "coupe-circuit": "coupe-circuit Airbnb, pause après un refus",
  rythme: "limiteur local, trop d'appels Airbnb récents",
  echeance: "échéance de la tranche",
  hash: "requête PdpPlatformSections inconnue d'Airbnb (hash périmé)",
  illisible: "fiches lues sans capacité, format à revoir",
  cle: "clé API Airbnb illisible",
  worker: "worker Airbnb sans réponse lisible",
};

/** Les identifiants à demander : des chiffres, sans doublon, une tranche au plus. */
export function idsFiches(ids: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const x of ids) {
    const id =
      typeof x === "string"
        ? x.trim()
        : typeof x === "number" && Number.isInteger(x)
          ? String(x)
          : "";
    if (ID_AIRBNB.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= MAX_FICHES_TRANCHE) break;
  }
  return out;
}

/** Le corps envoyé au worker (`cli.py`, `"mode": "fiches"`). */
export function corpsFiches(
  demande: DemandeFichesAirbnb,
  ids: readonly string[],
  echeance: number,
): string {
  return JSON.stringify({
    mode: "fiches",
    ids,
    checkIn: demande.checkIn,
    checkOut: demande.checkOut,
    adults: demande.adults,
    deadlineMs: echeance,
    ...(demande.pauseS != null ? { pauseS: demande.pauseS } : {}),
  });
}

function entier(v: unknown, min: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= 50 ? v : null;
}

function texte(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null;
}

function position(lat: unknown, lon: unknown): { lat: number | null; lon: number | null } {
  if (
    typeof lat !== "number" ||
    typeof lon !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return { lat: null, lon: null };
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180 || (lat === 0 && lon === 0))
    return { lat: null, lon: null };
  return { lat, lon };
}

function fiche(v: unknown): FicheAirbnb | null {
  if (v == null || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  return {
    guests: entier(r.guests, 1),
    bedrooms: entier(r.bedrooms, 0),
    rooms: entier(r.rooms, 1),
    ...position(r.lat, r.lon),
    roomType: texte(r.roomType),
    typeLogement: texte(r.typeLogement),
    ecartee: r.ecartee === true,
  };
}

function liste(v: unknown, permis: ReadonlySet<string>): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && permis.has(x))
    : [];
}

/**
 * Ce que Node retient de la sortie du worker. Un identifiant demandé n'est
 * jamais perdu : absent des fiches, des vides et des restants, il revient
 * dans les restants. Un worker tué ou muet rend tout en restants.
 */
export function lireSortieFiches(
  parsed: unknown,
  ids: readonly string[],
  tue = false,
): LectureFichesAirbnb {
  const permis = new Set(ids);
  if (parsed == null || typeof parsed !== "object") {
    const arret: ArretFiches = tue ? "echeance" : "worker";
    return {
      fiches: {},
      vides: [],
      restants: [...ids],
      lues: 0,
      arret,
      raison: tue ? "worker coupé à l'échéance" : LIBELLE.worker,
    };
  }
  const p = parsed as Record<string, unknown>;
  const fiches: Record<string, FicheAirbnb> = {};
  if (p.fiches && typeof p.fiches === "object") {
    for (const [id, v] of Object.entries(p.fiches as Record<string, unknown>)) {
      if (!permis.has(id)) continue;
      const f = fiche(v);
      if (f) fiches[id] = f;
    }
  }
  const vides = liste(p.vides, permis).filter((id) => !(id in fiches));
  const restants = liste(p.restants, permis).filter((id) => !(id in fiches) && !vides.includes(id));
  for (const id of ids)
    if (!(id in fiches) && !vides.includes(id) && !restants.includes(id)) restants.push(id);
  const brut =
    typeof p.arret === "string" && ARRETS.has(p.arret as ArretFiches)
      ? (p.arret as ArretFiches)
      : null;
  const arret: ArretFiches | null = brut ?? (tue && restants.length > 0 ? "echeance" : null);
  const lues = typeof p.lues === "number" && Number.isInteger(p.lues) && p.lues >= 0 ? p.lues : 0;
  const out: LectureFichesAirbnb = { fiches, vides, restants, lues, arret };
  if (arret)
    out.raison =
      typeof p.erreurArret === "string" && p.erreurArret.trim()
        ? p.erreurArret.trim()
        : LIBELLE[arret];
  if (
    arret === "rythme" &&
    typeof p.attenteS === "number" &&
    Number.isFinite(p.attenteS) &&
    p.attenteS >= 0
  ) {
    out.attenteMs = Math.round(p.attenteS * 1000);
  }
  return out;
}
