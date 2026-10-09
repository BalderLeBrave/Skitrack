/**
 * La fiche enrichie d'une annonce : description, équipements, avis et
 * conditions, **tels que la source les publie**. Rien ne s'invente : un champ
 * absent est `null` ou une liste vide, et l'écran dit « Non publié par
 * {source} ».
 *
 * Les collecteurs la posent sur l'annonce (`Listing.fiche`). Ce module la lit
 * pour l'écran, les filtres et le tri, et y ramène ce que les annonces
 * portaient déjà avant elle :
 *
 * - la description (`Listing.description`) ;
 * - les équipements des collecteurs existants (`Listing.amenities`, douze
 *   clés), sur la table ouverte (`depuisAmenities`) ;
 * - la note et le nombre d'avis (`Listing.rating`, `reviewCount`), **seulement
 *   quand l'échelle de la source est établie** (`ECHELLE_RELEVEE`) : une note
 *   dont on ignore l'échelle ne s'affiche pas, ne se filtre pas, ne se trie
 *   pas.
 *
 * Toutes les notes sont sur 5 (`noterSur5`, `note.ts`).
 *
 * Module pur, chargé tel quel par `node --experimental-strip-types`.
 */

import type { Listing } from "../listings.ts";
import { echelleNote, noterSur5, type EchelleNote } from "../note.ts";
import { depuisAmenities, normaliserEquipements, type EquipementFiche } from "./equipements.ts";

export type { EquipementFiche } from "./equipements.ts";

/** Un extrait d'avis : la note est sur 5, ou `null` si elle n'est pas publiée. */
export type AvisExtrait = {
  /** Le prénom public, tel que la source l'affiche ; rien de plus. */
  auteur?: string;
  /** La date publiée (ISO ou texte de la source). */
  date?: string;
  noteSur5: number | null;
  /** La note brute de l'extrait, pour contrôle ; jamais affichée. */
  noteSource?: number | null;
  texte: string;
};

export type AvisResume = {
  /** La seule note que lisent l'écran, les filtres et le tri. */
  noteSur5: number | null;
  /** La note brute, pour contrôle ; jamais affichée. */
  noteSource: number | null;
  echelleSource: EchelleNote | null;
  /** Le nombre d'avis publié, tel quel. */
  nombre: number | null;
  /** Les plus récents, cinq au plus. */
  extraits: AvisExtrait[];
  /** La page des avis sur la source. */
  url?: string;
};

export type ConditionsSejour = {
  annulation?: string | null;
  reglement?: string | null;
  animaux?: "oui" | "non" | "sur_demande" | null;
  fumeurs?: "oui" | "non" | null;
  fetes?: "oui" | "non" | null;
  arrivee?: string | null;
  depart?: string | null;
  caution?: string | null;
  paiement?: string | null;
  /** Le texte des conditions tel que la source le publie, quand elle ne les
   *  détaille pas champ par champ. */
  texteSource?: string | null;
};

export type SourceFiche = "airbnb" | "booking" | "ski-planet" | "gites" | "greengo" | "cozy";

export type FicheEnrichie = {
  description?: string | null;
  equipements: EquipementFiche[];
  avis: AvisResume | null;
  conditions: ConditionsSejour | null;
  sourceFiche: SourceFiche;
  /** Date de lecture de la fiche (ISO). */
  recupereLe?: string;
  /** La fiche n'a pas pu être lue (403, 429, page retirée) : rien n'en est
   *  déduit, l'annonce reste telle que la liste l'a donnée. */
  indisponible?: boolean;
};

/** Les extraits que garde une fiche. */
export const EXTRAITS_MAX = 5;

/**
 * L'échelle de `Listing.rating`, par source, **quand le collecteur l'établit**.
 * Il refuse une note au-dessus de cette échelle :
 *
 * - Airbnb : `avgRating` et « 4,92 sur 5 » (`scrape/airbnb.server.ts`, `ratingOf`) ;
 * - Booking : la tuile, seulement quand elle écrit « / 10 » (`scrape/booking/map.py`,
 *   `note_de_tuile`) — un badge sans échelle n'est pas repris ;
 * - Travelski : `averageRating` (`agences/travelski.ts`) ;
 * - Ovo Network : `review_rating` (`agences/ovo.ts`) ;
 * - Mountain Collection : `avis.note` (`agences/mountainCollection.ts`) ;
 * - HomeToGo : `starMessage` « sur 5 », ou `starValue` quand `maxStarValue` vaut 5
 *   (`scrape/hometogo.ts`, `noteDe`) — un « 8,0 » sans échelle n'est pas repris ;
 *
 * Les autres (GreenGo `averageGlobalRating`, Maeva `note`) recopient la note
 * sans borne : leur échelle n'est pas établie, leur note n'est pas lue.
 */
const ECHELLE_RELEVEE: Partial<Record<Listing["source"], EchelleNote>> = {
  Airbnb: 5,
  Booking: 10,
  Travelski: 5,
  "Ovo Network": 5,
  "Mountain Collection": 5,
  HomeToGo: 5,
};

function texte(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function entierPositif(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}

/** Le prénom seul : la source peut écrire « Marie D. » ou un nom entier. */
function prenom(v: unknown): string | undefined {
  const t = texte(v);
  return t ? t.split(/\s+/)[0] : undefined;
}

/**
 * Un résumé d'avis relu : la note sur 5 recalculée depuis la note brute et son
 * échelle quand elles sont là (une fiche enregistrée sous une règle plus
 * ancienne ne passe pas telle quelle), cinq extraits au plus, chacun avec sa
 * note sur 5 ou aucune. `null` quand il ne reste ni note ni nombre ni extrait.
 */
export function avisRelu(a: AvisResume | null | undefined): AvisResume | null {
  if (!a) return null;
  const echelle = echelleNote(a.echelleSource);
  const noteSur5 =
    a.noteSource != null
      ? noterSur5(a.noteSource, echelle)
      : echelle == null
        ? null
        : noterSur5(a.noteSur5, 5);
  const nombre = entierPositif(a.nombre);
  const extraits = (a.extraits ?? [])
    .map((x): AvisExtrait | null => {
      const t = texte(x?.texte);
      if (!t) return null;
      const n =
        x.noteSource != null && echelle != null
          ? noterSur5(x.noteSource, echelle)
          : noterSur5(x.noteSur5, 5);
      return {
        ...(prenom(x.auteur) ? { auteur: prenom(x.auteur) } : {}),
        ...(texte(x.date) ? { date: texte(x.date)! } : {}),
        noteSur5: n,
        ...(x.noteSource != null ? { noteSource: x.noteSource } : {}),
        texte: t,
      };
    })
    .filter((x): x is AvisExtrait => x != null)
    .slice(0, EXTRAITS_MAX);
  if (noteSur5 == null && (nombre == null || nombre === 0) && !extraits.length) return null;
  return {
    noteSur5: nombre === 0 ? null : noteSur5,
    noteSource: typeof a.noteSource === "number" ? a.noteSource : null,
    echelleSource: echelle,
    nombre,
    extraits,
    ...(texte(a.url) ? { url: texte(a.url)! } : {}),
  };
}

/**
 * Les avis de l'annonce : ceux de sa fiche, sinon sa note et son nombre
 * d'avis d'avant la fiche, quand l'échelle de la source est établie.
 */
export function avisDe(l: Listing): AvisResume | null {
  if (l.fiche?.avis) return avisRelu(l.fiche.avis);
  const echelle = ECHELLE_RELEVEE[l.source] ?? null;
  const nombre = entierPositif(l.reviewCount);
  const noteSur5 =
    echelle != null && l.rating != null && nombre !== 0 ? noterSur5(l.rating, echelle) : null;
  if (noteSur5 == null) return null;
  return {
    noteSur5,
    noteSource: l.rating ?? null,
    echelleSource: echelle,
    nombre,
    extraits: [],
    ...(l.url ? { url: l.url } : {}),
  };
}

/** La note sur 5 de l'annonce, la seule que lisent les filtres et le tri. */
export function noteSur5De(l: Listing): number | null {
  return avisDe(l)?.noteSur5 ?? null;
}

/** La description publiée, ou `null`. */
export function descriptionDe(l: Listing): string | null {
  return texte(l.fiche?.description) ?? texte(l.description);
}

/**
 * Les équipements de l'annonce : ceux de sa fiche, sinon ceux des collecteurs
 * existants. `null` quand aucune liste n'a été lue — ce qui ne dit pas que le
 * logement n'a rien.
 */
export function equipementsDe(l: Listing): EquipementFiche[] | null {
  // Une fiche lue décide seule : sans liste publiée, rien — pas les
  // équipements qu'un collecteur aurait déduits d'un texte.
  if (l.fiche && !l.fiche.indisponible) {
    const es = normaliserEquipements(l.fiche.equipements ?? []);
    return es.length ? es : null;
  }
  return depuisAmenities(l.amenities);
}

/** Les conditions publiées, ou `null` quand la fiche n'en dit rien. */
export function conditionsDe(l: Listing): ConditionsSejour | null {
  return conditionsRelues(l.fiche?.conditions);
}

/** Des conditions relues : textes non vides, valeurs fermées reconnues. */
export function conditionsRelues(brut: unknown): ConditionsSejour | null {
  const c = brut != null && typeof brut === "object" ? (brut as Record<string, unknown>) : null;
  if (!c) return null;
  const out: ConditionsSejour = {};
  for (const k of [
    "annulation",
    "reglement",
    "arrivee",
    "depart",
    "caution",
    "paiement",
    "texteSource",
  ] as const) {
    const t = texte(c[k]);
    if (t) out[k] = t;
  }
  if (c.animaux === "oui" || c.animaux === "non" || c.animaux === "sur_demande")
    out.animaux = c.animaux;
  if (c.fumeurs === "oui" || c.fumeurs === "non") out.fumeurs = c.fumeurs;
  if (c.fetes === "oui" || c.fetes === "non") out.fetes = c.fetes;
  return Object.keys(out).length ? out : null;
}

/* ---------- Filtres ---------- */

/**
 * L'annonce a-t-elle cet équipement **listé comme présent** ? Une annonce
 * dont les équipements n'ont pas été lus, ou qui ne le mentionne pas, ne
 * passe pas : l'inconnu n'est pas un oui.
 */
export function aEquipement(l: Listing, id: string): boolean {
  return equipementsDe(l)?.some((e) => e.id === id && e.present) === true;
}

/** Une note sur 5 au moins égale au seuil. Une annonce sans note ne passe pas,
 *  et ne compte pas comme un zéro. */
export function noteAuMoins(l: Listing, seuilSur5: number): boolean {
  const n = noteSur5De(l);
  return n != null && n >= seuilSur5;
}

/* ---------- Texte ---------- */

/**
 * Un texte coupé proprement au plus près de `max` caractères : à la fin d'une
 * phrase si elle tombe dans le dernier tiers, sinon au dernier mot entier,
 * suivi d'une ellipse. Un texte plus court revient tel quel.
 */
export function tronquer(t: string, max: number): string {
  const s = t.trim();
  if (s.length <= max) return s;
  const coupe = s.slice(0, max);
  const phrase = Math.max(
    coupe.lastIndexOf(". "),
    coupe.lastIndexOf("! "),
    coupe.lastIndexOf("? "),
  );
  if (phrase >= (max * 2) / 3) return coupe.slice(0, phrase + 1);
  const mot = coupe.lastIndexOf(" ");
  return `${(mot > 0 ? coupe.slice(0, mot) : coupe).replace(/[\s,;:–-]+$/, "")}…`;
}

/* ---------- Depuis un collecteur ---------- */

/**
 * La fiche telle qu'un collecteur la rend (worker Python, page lue) :
 * libellés bruts, note brute et son échelle. Tout passe ici, pour que
 * chaque source soit normalisée de la même façon (`normaliserEquipements`,
 * `noterSur5`) : aucun collecteur ne convertit une note de son côté.
 */
export type FicheBrute = {
  description?: unknown;
  equipements?: unknown;
  conditions?: unknown;
  avis?: unknown;
};

function objet(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function nombreOuNull(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^\s*\d+([.,]\d+)?\s*$/.test(v)) return Number(v.replace(",", "."));
  return null;
}

/** Une fiche brute, ou `null` quand il n'en reste rien de publié. */
export function ficheDepuisBrut(
  brut: unknown,
  sourceFiche: SourceFiche,
  opts: { url?: string | null; recupereLe?: string } = {},
): FicheEnrichie | null {
  const b = objet(brut);
  if (!b) return null;
  const description = texte(b.description);
  const items = Array.isArray(b.equipements) ? b.equipements : [];
  const equipements = normaliserEquipements(
    items
      .map((x) => objet(x))
      .filter((x): x is Record<string, unknown> => x != null && typeof x.libelle === "string")
      .map((x) => ({
        libelle: x.libelle as string,
        present: typeof x.present === "boolean" ? x.present : null,
        groupe: texte(x.groupe),
      })),
  );
  const a = objet(b.avis);
  let avis: AvisResume | null = null;
  if (a) {
    const echelle = echelleNote(nombreOuNull(a.echelleSource));
    const noteSource = nombreOuNull(a.noteSource);
    const extraits = (Array.isArray(a.extraits) ? a.extraits : [])
      .map((x) => objet(x))
      .filter((x): x is Record<string, unknown> => x != null)
      .map((x) => {
        const ns = nombreOuNull(x.noteSource);
        return {
          ...(texte(x.auteur) ? { auteur: texte(x.auteur)! } : {}),
          ...(texte(x.date) ? { date: texte(x.date)! } : {}),
          noteSur5: noterSur5(ns, echelle),
          ...(ns != null ? { noteSource: ns } : {}),
          texte: texte(x.texte) ?? "",
        };
      });
    avis = avisRelu({
      noteSur5: noterSur5(noteSource, echelle),
      noteSource,
      echelleSource: echelle,
      nombre: entierPositif(nombreOuNull(a.nombre)),
      extraits,
      ...((texte(a.url) ?? opts.url) ? { url: (texte(a.url) ?? opts.url)! } : {}),
    });
  }
  const conditions = conditionsRelues(b.conditions);
  if (!description && !equipements.length && !avis && !conditions) return null;
  return {
    description,
    equipements,
    avis,
    conditions,
    sourceFiche,
    ...(opts.recupereLe ? { recupereLe: opts.recupereLe } : {}),
  };
}

const SOURCES_FICHE: readonly SourceFiche[] = [
  "airbnb",
  "booking",
  "ski-planet",
  "gites",
  "greengo",
  "cozy",
];

/**
 * Une fiche enregistrée (mémoire des fiches, relevé), relue : source connue,
 * équipements renormalisés, avis et conditions revalidés. Une fiche
 * indisponible ne se garde pas : elle ne dit rien. `null` s'il n'en reste rien.
 */
export function ficheRelue(brut: unknown): FicheEnrichie | null {
  const b = objet(brut);
  if (!b || b.indisponible === true) return null;
  const source = SOURCES_FICHE.find((s) => s === b.sourceFiche);
  if (!source) return null;
  const description = texte(b.description);
  const equipements = normaliserEquipements(
    (Array.isArray(b.equipements) ? b.equipements : [])
      .map((x) => objet(x))
      .filter((x): x is Record<string, unknown> => x != null && typeof x.libelle === "string")
      .map((x) => ({
        libelle: x.libelle as string,
        present: typeof x.present === "boolean" ? x.present : null,
        groupe: texte(x.groupe),
      })),
  );
  const avis = avisRelu(objet(b.avis) as AvisResume | null);
  const conditions = conditionsRelues(b.conditions);
  if (!description && !equipements.length && !avis && !conditions) return null;
  return {
    description,
    equipements,
    avis,
    conditions,
    sourceFiche: source,
    ...(texte(b.recupereLe) ? { recupereLe: texte(b.recupereLe)! } : {}),
  };
}
