/**
 * Ce qu'une fiche déjà lue publie et que l'annonce ne porte pas : sa
 * description, sa galerie, ses équipements (les douze clés, et les libellés
 * tels que la source les publie sans fiche). Gardé trente jours, à côté de la
 * mémoire des fiches (`memoireFiches.server.ts`), dans `fiches-contenu.json`.
 *
 * Pourquoi une mémoire à part : certains collecteurs ne lisent une fiche
 * qu'une fois (Travelski la lit quand la position manque, puis ne la relit
 * plus). Sans mémoire, la description et la galerie de cette lecture se
 * perdraient au relevé suivant, et les retrouver demanderait une requête de
 * plus par annonce. La mémoire des fiches, elle, ne garde que des nombres
 * datés : y loger du texte en changerait la forme pour tous les collecteurs.
 *
 * Les collecteurs passent par trois fonctions, en bas de ce module, plutôt
 * que par les deux mémoires : `garderLectures` (noter, en une écriture, la
 * fiche enrichie et le contenu des pages lues), `reposerGardees` (les poser,
 * sans réseau, sur les annonces d'un relevé) et `dejaGardee` (ne pas relire
 * une page gardée) ; `poserContenu` pose sur une annonce un contenu qu'ils
 * viennent de lire. C'est le modèle Airbnb (`airbnbSuite.server.ts`) : les
 * tuiles d'abord, les fiches ensuite, une à une en tâche de fond, gardées
 * trente jours, et reposées sans réseau ; l'écran les reprend par sa
 * relecture (`relecture.ts`).
 */

import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Listing } from "../listings.ts";
import type { Equipement, EquipementPublie } from "./equipements.ts";
import { CLES_EQUIPEMENT, equipementsPubliesRelus } from "./equipements.ts";
import { ficheRelue, type FicheEnrichie } from "./ficheEnrichie.ts";
import { MARQUE_MEMOIRE, qualifierLogement } from "./logement.ts";
import { cheminMemoire, comblerDepuisMemoire, DUREE_MEMOIRE_MS, memoireFiches } from "./memoireFiches.server.ts";
import { cleListing } from "./poserReleve.ts";
import { pageJamaisOuverte } from "./priseFiche.ts";

export type ContenuFiche = {
  description: string | null;
  photos: string[] | null;
  amenities: Equipement[] | null;
  /** Les libellés que la page publie en liste (`Listing.equipementsPublies`),
   *  quand le collecteur les lit ; absent sinon. */
  equipementsPublies?: EquipementPublie[] | null;
};

type Entree = ContenuFiche & { vu: number };
type Fichier = { version: 1; contenus: Record<string, Entree> };

/** Le fichier, à côté de `fiches.json`. */
export function cheminContenu(): string {
  return join(dirname(cheminMemoire()), "fiches-contenu.json");
}

/** Ce qui se garde d'une entrée relue : des chaînes, des adresses, des clés
 *  connues, des libellés publiés non vides. */
export function contenuLu(v: unknown): ContenuFiche | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const description = typeof o.description === "string" && o.description.trim() ? o.description : null;
  const photos = Array.isArray(o.photos)
    ? o.photos.filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u))
    : null;
  const cles = new Set<string>(CLES_EQUIPEMENT);
  const amenities = Array.isArray(o.amenities)
    ? (o.amenities as unknown[]).filter(
        (e): e is Equipement =>
          !!e &&
          typeof e === "object" &&
          cles.has((e as Equipement).cle) &&
          ["oui", "non", "inconnu"].includes((e as Equipement).valeur) &&
          typeof (e as Equipement).libelle === "string",
      )
    : null;
  const publies = equipementsPubliesRelus(o.equipementsPublies);
  if (!description && !photos?.length && !amenities?.length && !publies.length) return null;
  return {
    description,
    photos: photos?.length ? photos : null,
    amenities: amenities?.length ? amenities : null,
    ...(publies.length ? { equipementsPublies: publies } : {}),
  };
}

export class ContenuFiches {
  private contenus = new Map<string, Entree>();
  private lueA: number | null | undefined = undefined;
  readonly chemin: string;
  private readonly dureeMs: number;

  constructor(chemin: string = cheminContenu(), dureeMs: number = DUREE_MEMOIRE_MS) {
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

  private charger(): void {
    const date = this.dateFichier();
    if (date === this.lueA) return;
    this.contenus = new Map();
    this.lueA = date;
    if (date == null) return;
    try {
      const lu = JSON.parse(readFileSync(this.chemin, "utf8")) as Partial<Fichier> | null;
      for (const [cle, e] of Object.entries(lu?.contenus ?? {})) {
        const c = contenuLu(e);
        if (c && typeof (e as Entree).vu === "number") this.contenus.set(cle, { ...c, vu: (e as Entree).vu });
      }
    } catch (err) {
      // Perdue, elle se reconstitue à la lecture suivante des fiches.
      console.warn("[fiches] contenu illisible, reprise à vide :", (err as Error).message);
    }
  }

  /** Le contenu gardé d'une annonce, s'il a moins de trente jours. */
  lire(cle: string | null | undefined, now: number = Date.now()): ContenuFiche | null {
    if (!cle) return null;
    this.charger();
    const e = this.contenus.get(cle);
    if (!e || now - e.vu > this.dureeMs) return null;
    return {
      description: e.description,
      photos: e.photos,
      amenities: e.amenities,
      ...(e.equipementsPublies?.length ? { equipementsPublies: e.equipementsPublies } : {}),
    };
  }

  /** Garde le contenu de fiches lues ; une entrée vide n'efface rien. */
  noter(entrees: readonly { cle: string | null; contenu: ContenuFiche }[], now: number = Date.now()): void {
    this.charger();
    let change = false;
    for (const { cle, contenu } of entrees) {
      const c = cle ? contenuLu(contenu) : null;
      if (!cle || !c) continue;
      this.contenus.set(cle, { ...c, vu: now });
      change = true;
    }
    if (change) this.ecrire(now);
  }

  private ecrire(now: number): void {
    const contenus: Record<string, Entree> = {};
    for (const [cle, e] of this.contenus) if (now - e.vu <= this.dureeMs) contenus[cle] = e;
    mkdirSync(dirname(this.chemin), { recursive: true });
    const temp = `${this.chemin}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify({ version: 1, contenus } satisfies Fichier), "utf8");
    try {
      renameSync(temp, this.chemin);
    } finally {
      try {
        unlinkSync(temp);
      } catch {
        /* déjà renommé */
      }
    }
    this.lueA = this.dateFichier();
  }
}

const g = globalThis as typeof globalThis & { __skitrackContenuFiches__?: ContenuFiches };

/** La mémoire du processus. */
export function contenuFiches(): ContenuFiches {
  return (g.__skitrackContenuFiches__ ??= new ContenuFiches());
}

/* ---------- Ce que les collecteurs en font : noter, reposer ---------- */

/**
 * Ce qu'un collecteur a lu sur la page d'une annonce, à garder trente jours.
 * `cle` : celle de `cleListing` (`poserReleve.ts`). `fiche` : la fiche
 * enrichie (`ficheEnrichie.ts`), d'une source connue (`SourceFiche`), dans la
 * mémoire des fiches. `contenu` : description, galerie et équipements (les
 * douze clés, et les libellés publiés quand le collecteur les lit), ici.
 */
export type LectureAGarder = {
  cle: string | null | undefined;
  fiche?: FicheEnrichie | null;
  contenu?: Partial<ContenuFiche> | null;
};

/**
 * Garde ce que des pages viennent de publier : une écriture par fichier au
 * plus, quel que soit le nombre d'annonces. À appeler une fois par lot de
 * fiches lues, pas une fois par fiche. La lecture la plus récente remplace
 * l'ancienne, entière ; une lecture vide n'efface rien, et une fiche
 * indisponible (403, 429, page retirée) ou d'une source inconnue ne se garde
 * pas (`ficheRelue`). Un disque refusé ne coupe pas le relevé. Rend le nombre
 * d'annonces gardées.
 */
export function garderLectures(lectures: readonly LectureAGarder[], now: number = Date.now()): number {
  const fiches: { cle: string; fiche: FicheEnrichie }[] = [];
  const contenus: { cle: string; contenu: ContenuFiche }[] = [];
  const gardees = new Set<string>();
  for (const l of lectures) {
    if (!l.cle) continue;
    const fiche = ficheRelue(l.fiche);
    if (fiche) {
      fiches.push({ cle: l.cle, fiche });
      gardees.add(l.cle);
    }
    const contenu = contenuLu(l.contenu);
    if (contenu) {
      contenus.push({ cle: l.cle, contenu });
      gardees.add(l.cle);
    }
  }
  try {
    if (fiches.length) memoireFiches().noter(fiches, now);
    if (contenus.length) contenuFiches().noter(contenus, now);
  } catch (err) {
    // Perdue, la lecture se refera à la recherche suivante.
    console.warn("[fiches] lectures non gardées :", (err as Error).message);
  }
  return gardees.size;
}

/** Une fiche lue : présente, et pas `indisponible` (rien n'en a été lu). */
function ficheLue(f: FicheEnrichie | null | undefined): boolean {
  return f != null && f.indisponible !== true;
}

/** Ce que l'annonce dit de ses équipements : rien, si la liste est absente, vide ou toute « inconnu ». */
function equipementsMuets(a: readonly Equipement[] | null | undefined): boolean {
  return !a?.some((e) => e.valeur !== "inconnu");
}

/**
 * Pose sur l'annonce le contenu d'une fiche, là où elle se tait : la
 * description si elle n'en a pas ; les équipements si elle n'en a pas, ou si
 * les siens ne disent rien (`equipementsMuets`) et ceux de la fiche, si ; les
 * libellés publiés si elle n'en porte aucun ; la galerie si elle n'a que sa
 * photo principale, ou si la galerie gardée est plus longue que la sienne
 * (elle la remplace alors). Ne remplace rien d'autre de ce que le relevé a
 * donné. Rend `true`
 * si quelque chose a été posé.
 */
export function poserContenu(
  row: Partial<Pick<Listing, "description" | "amenities" | "equipementsPublies" | "photo" | "photos">>,
  c: Partial<ContenuFiche> | null | undefined,
): boolean {
  if (!c) return false;
  let pose = false;
  if (!row.description?.trim() && c.description) {
    row.description = c.description;
    pose = true;
  }
  const muets = equipementsMuets(row.amenities);
  if (c.amenities?.length && (row.amenities == null || (muets && !equipementsMuets(c.amenities)))) {
    row.amenities = c.amenities;
    pose = true;
  }
  if (!row.equipementsPublies?.length && c.equipementsPublies?.length) {
    row.equipementsPublies = c.equipementsPublies;
    pose = true;
  }
  const galerie = [...new Set([...(row.photo ? [row.photo] : []), ...(row.photos ?? [])])];
  if (galerie.length <= 1 && c.photos?.length) {
    const photos = [...new Set([...galerie, ...c.photos])];
    if (photos.length > galerie.length) {
      row.photos = photos;
      row.photo = row.photo ?? photos[0] ?? null;
      pose = true;
    }
  } else if (c.photos && new Set(c.photos).size > galerie.length) {
    // Une galerie gardée plus longue que celle de la liste : la galerie
    // entière de la fiche (Cozy : 26 photos là où la liste en donne 3, dont
    // les mêmes en vignette). Elle remplace, sans mêler les deux tailles.
    const photos = [...new Set(c.photos)];
    row.photos = photos;
    row.photo = photos[0] ?? row.photo ?? null;
    pose = true;
  }
  return pose;
}

/**
 * Pose sur des annonces ce qu'on a gardé d'elles, sans réseau : leur contenu
 * (`poserContenu`) et, hors Airbnb, leur fiche enrichie quand elles n'en ont
 * pas de lue. La fiche Airbnb passe par `poserMemoire`
 * (`completerFiche.server.ts`), qui a ses règles pour l'écran Prix.
 *
 * Capacité, chambres et point seulement pour une annonce dont l'écran
 * n'ouvre jamais la page (`pageJamaisOuverte` : Travelski, La Plagne…) : son
 * collecteur l'a lue en tâche de fond et noté ses valeurs, et les combler ne
 * coûte aucune lecture (`comblerDepuisMemoire`, seuls les trous, la source
 * gardée, marque « mémoire des fiches »). Ailleurs, jamais : une annonce
 * trouée doit encore ouvrir sa page, elle pose aussi ce que la mémoire ne
 * garde pas (la taxe de séjour d'une centrale, ajoutée au loyer), et une
 * annonce comblée par la mémoire ne l'ouvrirait plus (`poserMemoire`). Ni la
 * fiche ni le contenu ne comptent dans ce qui la fait ouvrir (`trouee`,
 * `raisonDeLaisser`).
 *
 * Rend le nombre d'annonces touchées. Une mémoire illisible ne pose rien.
 */
export function reposerGardees(rows: readonly Listing[], now: number = Date.now()): number {
  let n = 0;
  try {
    const memoire = memoireFiches();
    const contenus = contenuFiches();
    for (const row of rows) {
      const cle = cleListing(row);
      if (!cle) continue;
      let pose = false;
      if (row.source !== "Airbnb" && !ficheLue(row.fiche)) {
        const fiche = memoire.lire(cle, now)?.fiche;
        if (fiche) {
          row.fiche = fiche;
          pose = true;
        }
      }
      if (poserContenu(row, contenus.lire(cle, now))) pose = true;
      if (row.source !== "Airbnb" && pageJamaisOuverte(row.url)) {
        const m = memoire.lire(cle, now);
        if (m && comblerDepuisMemoire(row, m)) {
          if (!row.proven.includes(MARQUE_MEMOIRE)) row.proven = `${row.proven} · ${MARQUE_MEMOIRE}`;
          pose = true;
        }
      }
      // Une description arrivée (contenu, fiche) dit peut-être ses chambres :
      // l'annonce se requalifie, comme après une lecture.
      if (pose && row.source !== "Airbnb") Object.assign(row, qualifierLogement(row));
      if (pose) n += 1;
    }
  } catch (err) {
    console.warn("[fiches] mémoire illisible, rien de reposé :", (err as Error).message);
  }
  return n;
}

/**
 * La page de cette annonce a été lue il y a moins de trente jours, et on en
 * garde une fiche enrichie ou un contenu : la relire coûterait une requête
 * pour rien. `cle` : celle de `cleListing`.
 */
export function dejaGardee(cle: string | null | undefined, now: number = Date.now()): boolean {
  if (!cle) return false;
  try {
    return memoireFiches().lire(cle, now)?.fiche != null || contenuFiches().lire(cle, now) != null;
  } catch {
    return false;
  }
}
