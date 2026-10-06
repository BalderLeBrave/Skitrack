/**
 * Ce qu'une fiche déjà lue publie et que l'annonce ne porte pas : sa
 * description, sa galerie, ses équipements. Gardé trente jours, à côté de la
 * mémoire des fiches (`memoireFiches.server.ts`), dans `fiches-contenu.json`.
 *
 * Pourquoi une mémoire à part : certains collecteurs ne lisent une fiche
 * qu'une fois (Travelski la lit quand la position manque, puis ne la relit
 * plus). Sans mémoire, la description et la galerie de cette lecture se
 * perdraient au relevé suivant, et les retrouver demanderait une requête de
 * plus par annonce. La mémoire des fiches, elle, ne garde que des nombres
 * datés : y loger du texte en changerait la forme pour tous les collecteurs.
 */

import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Equipement } from "./equipements.ts";
import { CLES_EQUIPEMENT } from "./equipements.ts";
import { cheminMemoire, DUREE_MEMOIRE_MS } from "./memoireFiches.server.ts";

export type ContenuFiche = {
  description: string | null;
  photos: string[] | null;
  amenities: Equipement[] | null;
};

type Entree = ContenuFiche & { vu: number };
type Fichier = { version: 1; contenus: Record<string, Entree> };

/** Le fichier, à côté de `fiches.json`. */
export function cheminContenu(): string {
  return join(dirname(cheminMemoire()), "fiches-contenu.json");
}

/** Ce qui se garde d'une entrée relue : des chaînes, des adresses, des clés connues. */
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
  if (!description && !photos?.length && !amenities?.length) return null;
  return { description, photos: photos?.length ? photos : null, amenities: amenities?.length ? amenities : null };
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
    return { description: e.description, photos: e.photos, amenities: e.amenities };
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
