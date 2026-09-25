/**
 * La mémoire des fiches : capacité, chambres, pièces et position lues une fois
 * pour une annonce, gardées trente jours sur la machine.
 *
 * Les relevés de l'écran Prix reviennent sur les mêmes annonces : une station
 * relevée pour d'autres dates, ou sa voisine, qui partage ses Airbnb. Une
 * fiche Airbnb coûte une requête au limiteur partagé (18 par minute) ; lue
 * une fois, elle ne se redemande plus pendant un mois.
 *
 * Quatre règles :
 *
 * 1. **Rien n'est estimé.** On ne garde que ce qu'une source a publié : une
 *    annonce complète d'un relevé, ou une fiche lue. Une valeur absente ne
 *    s'écrit pas, et n'efface pas celle qu'on avait.
 * 2. **Chaque valeur a sa date.** Une valeur que personne n'a republiée depuis
 *    trente jours s'efface, même quand l'annonce a été revue entre-temps pour
 *    une autre. Une fiche lue, pleine ou vide, est notée comme telle : elle ne
 *    se redemande plus avant trente jours, même si elle tait ce qui manque.
 * 3. **La mémoire ne comble que les trous.** Elle ne remplace jamais ce que le
 *    relevé du jour publie (`comblerDepuisMemoire`).
 * 4. **Écriture atomique** (fichier temporaire, puis `rename`), dans le
 *    dossier de configuration de l'application, comme les clés
 *    (`src/lib/cles/store.server.ts`) : hors du dépôt, et un fichier tronqué
 *    ne se lit jamais.
 *
 * La clé est celle de `cleListing` (`poserReleve.ts`) : « Airbnb:123… »,
 * « Gîtes:74G… », « Centrale:… ».
 */

import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

/** Trente jours : au-delà, une annonce a pu changer (travaux, nouvelle capacité). */
export const DUREE_MEMOIRE_MS = 30 * 24 * 60 * 60 * 1000;
/** Une valeur revue n'est réécrite, pour sa seule date, qu'une fois par jour. */
const RAFRAICHIR_MS = 24 * 60 * 60 * 1000;

/** Ce qu'une source a publié sur une annonce. `null` : elle ne l'a pas dit. */
export type ValeursFiche = {
  guests: number | null;
  bedrooms: number | null;
  rooms: number | null;
  lat: number | null;
  lon: number | null;
  /** Airbnb : hôtel, chambre ou hébergement insolite, qui n'est pas un logement entier. */
  ecartee?: boolean;
  /**
   * La fiche elle-même a été lue, pleine ou vide : à `noter`, elle vient de
   * l'être ; rendu par `lire`, elle l'a été il y a moins de trente jours.
   */
  lue?: boolean;
};

/** Ce qui se date une à une : chaque valeur, et la lecture de la fiche. */
type Datee = "guests" | "bedrooms" | "rooms" | "point" | "ecartee" | "lue";
type Dates = Partial<Record<Datee, number>>;
const DATEES: readonly Datee[] = ["guests", "bedrooms", "rooms", "point", "ecartee", "lue"];
const NOMBRES = ["guests", "bedrooms", "rooms"] as const;

type Entree = Omit<ValeursFiche, "lue"> & {
  /** La plus récente des dates, en ms. */
  vu: number;
  /** La dernière publication de chaque valeur, en ms. Absente d'un fichier plus ancien : `vu` pour toutes. */
  dates?: Dates;
};
type Datees = Entree & { dates: Dates };
type Fichier = { version: 1; fiches: Record<string, Entree> };

/** Le dossier de configuration de l'application, le même que `cles.json`. */
export function cheminMemoire(): string {
  const p = platform();
  const base =
    process.env.SKITRACK_CONFIG_DIR?.trim() ||
    (p === "win32"
      ? join(process.env.APPDATA?.trim() || join(homedir(), "AppData", "Roaming"), "skitrack")
      : p === "darwin"
        ? join(homedir(), "Library", "Application Support", "skitrack")
        : join(process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config"), "skitrack"));
  return join(base, "fiches.json");
}

function entier(v: unknown, min: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= 50 ? v : null;
}

function coordonnee(v: unknown, borne: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > borne) return null;
  return Math.round(v * 1e6) / 1e6;
}

/** Ce qui se garde d'une valeur reçue : les nombres plausibles, le reste à `null`. */
export function valeursLues(v: Partial<ValeursFiche> | null | undefined): ValeursFiche {
  const lat = coordonnee(v?.lat, 90);
  const lon = coordonnee(v?.lon, 180);
  const point = lat != null && lon != null && !(lat === 0 && lon === 0);
  return {
    guests: entier(v?.guests, 1),
    bedrooms: entier(v?.bedrooms, 0),
    rooms: entier(v?.rooms, 1),
    lat: point ? lat : null,
    lon: point ? lon : null,
    ...(typeof v?.ecartee === "boolean" ? { ecartee: v.ecartee } : {}),
    ...(v?.lue === true ? { lue: true } : {}),
  };
}

function utile(v: ValeursFiche): boolean {
  return (
    v.guests != null ||
    v.bedrooms != null ||
    v.rooms != null ||
    v.lat != null ||
    typeof v.ecartee === "boolean" ||
    v.lue === true
  );
}

function datesLues(brut: unknown): Dates | undefined {
  if (!brut || typeof brut !== "object") return undefined;
  const out: Dates = {};
  for (const k of DATEES) {
    const t = (brut as Record<string, unknown>)[k];
    if (typeof t === "number" && Number.isFinite(t)) out[k] = t;
  }
  return out;
}

/**
 * L'entrée sans ce que personne n'a republié depuis `dureeMs`, chaque date
 * posée ; `null` s'il n'en reste rien.
 */
function fraiche(e: Entree, now: number, dureeMs: number): Datees | null {
  const date = (k: Datee): number => e.dates?.[k] ?? e.vu;
  const frais = (k: Datee): boolean => now - date(k) <= dureeMs;
  const out: Datees = { guests: null, bedrooms: null, rooms: null, lat: null, lon: null, vu: 0, dates: {} };
  for (const k of NOMBRES) {
    if (e[k] == null || !frais(k)) continue;
    out[k] = e[k];
    out.dates[k] = date(k);
  }
  if (e.lat != null && e.lon != null && frais("point")) {
    out.lat = e.lat;
    out.lon = e.lon;
    out.dates.point = date("point");
  }
  if (typeof e.ecartee === "boolean" && frais("ecartee")) {
    out.ecartee = e.ecartee;
    out.dates.ecartee = date("ecartee");
  }
  // « Lue » ne se déduit pas d'un fichier plus ancien : seule sa date le dit.
  const lue = e.dates?.lue;
  if (lue != null && now - lue <= dureeMs) out.dates.lue = lue;
  const vus = Object.values(out.dates);
  if (vus.length === 0) return null;
  out.vu = Math.max(...vus);
  return out;
}

/** Pause courte et synchrone : le fichier est tenu un instant par un lecteur sous Windows. */
function dormirSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * La mémoire, lue au premier besoin et relue quand un autre processus a
 * écrit (date du fichier). Les lectures et écritures sont synchrones : deux
 * relevés du même processus ne s'entrelacent pas.
 */
export class MemoireFiches {
  private fiches = new Map<string, Entree>();
  /** La date du fichier à la dernière lecture ; `undefined` : jamais lu. */
  private lueA: number | null | undefined = undefined;
  readonly chemin: string;
  private readonly dureeMs: number;

  constructor(chemin: string = cheminMemoire(), dureeMs: number = DUREE_MEMOIRE_MS) {
    this.chemin = chemin;
    this.dureeMs = dureeMs;
  }

  private dateFichier(): number | null {
    try {
      return statSync(this.chemin).mtimeMs;
    } catch {
      return null;
    }
  }

  /** Relit le fichier s'il a changé depuis la dernière lecture. Illisible : on repart de rien. */
  private charger(now: number): void {
    const date = this.dateFichier();
    if (date === this.lueA) return;
    this.fiches = new Map();
    this.lueA = date;
    if (date == null) return;
    try {
      const lu = JSON.parse(readFileSync(this.chemin, "utf8")) as Partial<Fichier> | null;
      const brut = lu && typeof lu === "object" ? lu.fiches : null;
      if (!brut || typeof brut !== "object") return;
      for (const [cle, e] of Object.entries(brut)) {
        if (!e || typeof e !== "object" || typeof e.vu !== "number") continue;
        const { lue: _lue, ...v } = valeursLues(e);
        const f = fraiche({ ...v, vu: e.vu, dates: datesLues(e.dates) }, now, this.dureeMs);
        if (f) this.fiches.set(cle, f);
      }
    } catch (err) {
      // Une mémoire perdue se reconstitue : rien n'y est qui ne se relise.
      console.warn("[fiches] mémoire illisible, reprise à vide :", (err as Error).message);
    }
  }

  private ecrire(now: number): void {
    const fiches: Record<string, Entree> = {};
    for (const [cle, e] of this.fiches) {
      const f = fraiche(e, now, this.dureeMs);
      if (f) fiches[cle] = f;
    }
    const f: Fichier = { version: 1, fiches };
    mkdirSync(dirname(this.chemin), { recursive: true });
    // Le temporaire est dans le même dossier : `rename` n'est atomique qu'à
    // l'intérieur d'un même système de fichiers.
    const temp = `${this.chemin}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(f), "utf8");
    try {
      for (let essai = 0; ; essai++) {
        try {
          renameSync(temp, this.chemin);
          break;
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if ((code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") || essai >= 4) throw err;
          dormirSync(20 * (essai + 1));
        }
      }
    } finally {
      try {
        unlinkSync(temp);
      } catch {
        /* déjà renommé */
      }
    }
    this.lueA = this.dateFichier();
  }

  /** Ce que la mémoire sait de l'annonce, chaque valeur de moins de trente jours, ou `null`. */
  lire(cle: string | null | undefined, now: number = Date.now()): ValeursFiche | null {
    if (!cle) return null;
    this.charger(now);
    const e = this.fiches.get(cle);
    const f = e ? fraiche(e, now, this.dureeMs) : null;
    if (!f) return null;
    return {
      guests: f.guests,
      bedrooms: f.bedrooms,
      rooms: f.rooms,
      lat: f.lat,
      lon: f.lon,
      ...(typeof f.ecartee === "boolean" ? { ecartee: f.ecartee } : {}),
      ...(f.dates.lue != null ? { lue: true } : {}),
    };
  }

  /**
   * Note ce que des sources viennent de publier. Une valeur publiée remplace
   * celle d'avant (elle est plus récente) et prend la date du jour ; une
   * absence n'efface rien, et ne rajeunit pas la valeur qu'on avait. `lue` :
   * la fiche vient d'être lue. N'écrit le fichier que si quelque chose a
   * changé. Rend le nombre d'annonces notées ou rafraîchies.
   */
  noter(
    entrees: ReadonlyArray<{ cle: string | null | undefined } & Partial<ValeursFiche>>,
    now: number = Date.now(),
  ): number {
    this.charger(now);
    let n = 0;
    for (const brute of entrees) {
      if (!brute.cle) continue;
      const v = valeursLues(brute);
      if (!utile(v)) continue;
      const avant = this.fiches.get(brute.cle);
      const a = avant ? fraiche(avant, now, this.dureeMs) : null;
      const apres: Datees = a
        ? { ...a, dates: { ...a.dates } }
        : { guests: null, bedrooms: null, rooms: null, lat: null, lon: null, vu: now, dates: {} };
      let change = a == null;
      // Une valeur revue telle quelle n'est réécrite, pour sa date, qu'une fois par jour.
      const revoir = (k: Datee, pareille: boolean) => {
        if (!pareille || now - (apres.dates[k] ?? 0) >= RAFRAICHIR_MS) change = true;
        apres.dates[k] = now;
      };
      for (const k of NOMBRES) {
        const x = v[k];
        if (x == null) continue;
        revoir(k, apres[k] === x);
        apres[k] = x;
      }
      if (v.lat != null && v.lon != null) {
        revoir("point", apres.lat === v.lat && apres.lon === v.lon);
        apres.lat = v.lat;
        apres.lon = v.lon;
      }
      if (typeof v.ecartee === "boolean") {
        revoir("ecartee", apres.ecartee === v.ecartee);
        apres.ecartee = v.ecartee;
      }
      if (v.lue) revoir("lue", apres.dates.lue != null);
      if (!change) continue;
      apres.vu = Math.max(...Object.values(apres.dates));
      this.fiches.set(brute.cle, apres);
      n += 1;
    }
    if (n > 0) {
      try {
        this.ecrire(now);
      } catch (err) {
        // Disque plein, dossier refusé : la mémoire du processus reste.
        console.warn("[fiches] mémoire non écrite :", (err as Error).message);
      }
    }
    return n;
  }

  /** Le nombre d'annonces gardées (pour le journal et les essais). */
  taille(now: number = Date.now()): number {
    this.charger(now);
    let n = 0;
    for (const e of this.fiches.values()) if (fraiche(e, now, this.dureeMs)) n += 1;
    return n;
  }
}

/** Ce qu'on peut combler d'une annonce : les trous seulement. */
export type SujetMemoire = {
  guests: number | null;
  bedrooms: number | null;
  rooms?: number | null;
  lat: number | null;
  lon: number | null;
};

/**
 * Pose sur `row` ce que la mémoire sait et que l'annonce tait. Jamais une
 * valeur publiée remplacée. Rend `true` si quelque chose a été posé.
 */
export function comblerDepuisMemoire(row: SujetMemoire, m: ValeursFiche): boolean {
  let pose = false;
  if (row.guests == null && m.guests != null) {
    row.guests = m.guests;
    pose = true;
  }
  if (row.bedrooms == null && m.bedrooms != null) {
    row.bedrooms = m.bedrooms;
    pose = true;
  }
  if ((row.rooms == null || row.rooms <= 0) && m.rooms != null) {
    row.rooms = m.rooms;
    pose = true;
  }
  const point =
    row.lat != null &&
    row.lon != null &&
    Number.isFinite(row.lat) &&
    Number.isFinite(row.lon) &&
    !(row.lat === 0 && row.lon === 0);
  if (!point && m.lat != null && m.lon != null) {
    row.lat = m.lat;
    row.lon = m.lon;
    pose = true;
  }
  return pose;
}

const g = globalThis as typeof globalThis & { __skitrackMemoireFiches__?: MemoireFiches };

/** La mémoire du processus, une seule : le module se réévalue en développement. */
export function memoireFiches(): MemoireFiches {
  return (g.__skitrackMemoireFiches__ ??= new MemoireFiches());
}
