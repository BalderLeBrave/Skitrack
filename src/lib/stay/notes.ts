/**
 * Notes et votes sur ce qu'on a retenu.
 *
 * Une station, un logement : chacun peut porter un fil de notes et un vote par
 * personne. Deux règles tiennent tout le module :
 *
 * 1. **Le vote est réversible.** Recliquer son propre pouce le retire. Voter
 *    deux fois pour n'est pas voter deux fois ; c'est revenir sur son avis, et
 *    une interface qui ne permet pas de revenir enregistre des avis faux.
 * 2. **Le décompte ne montre que ce qui a été voté.** Personne n'est compté
 *    contre parce qu'il n'a rien dit, et aucune majorité n'est déduite d'un
 *    silence. Trois pour et rien d'autre s'écrit « 3 pour », pas « 3 sur 5 ».
 *
 * Réécrit. L'original indexait les votes par **rang de voyageur** dans une
 * liste de voyageurs locale, qui n'existe plus : l'auteur est désormais
 * l'identifiant du compte courant, `useCurrentUser()?.id`. Le magasin est un
 * store zustand persisté, comme le reste de l'application.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NoteKind = "station" | "logement";

/** Pour, ou contre. Le retrait se fait en effaçant l'entrée, pas en votant zéro. */
export type VoteValue = 1 | -1;

export type Note = {
  id: string;
  kind: NoteKind;
  /** Identifiant textuel de la station ou du logement. */
  targetId: string;
  /** `useCurrentUser()?.id`. */
  author: string;
  /** Horodatage ISO de l'écriture. */
  at: string;
  body: string;
};

export type Tally = {
  pour: number;
  contre: number;
  /** Nombre de personnes qui se sont prononcées. Jamais l'effectif du groupe. */
  exprimes: number;
};

/** Clé d'une cible : « logement:abnb-10p ». */
export function targetKey(kind: NoteKind, targetId: string): string {
  return `${kind}:${targetId}`;
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type NotesState = {
  notes: Note[];
  /** Clé de cible, puis identifiant d'auteur. Une voix par personne. */
  votes: Record<string, Record<string, VoteValue>>;
  addNote: (kind: NoteKind, targetId: string, author: string, body: string) => void;
  removeNote: (id: string, author: string) => void;
  /** Pose le vote, ou le retire si c'est le même que celui déjà posé. */
  toggleVote: (kind: NoteKind, targetId: string, author: string, value: VoteValue) => void;
};

export const useSelectionNotes = create<NotesState>()(
  persist(
    (set) => ({
      notes: [],
      votes: {},

      addNote: (kind, targetId, author, body) =>
        set((s) => {
          const texte = body.trim();
          if (!texte || !author) return s;
          return {
            notes: [
              ...s.notes,
              { id: newId(), kind, targetId, author, at: new Date().toISOString(), body: texte },
            ],
          };
        }),

      // On ne retire que ses propres notes : effacer celle d'un autre sans qu'il
      // le sache est la seule façon sûre de perdre sa confiance dans le fil.
      removeNote: (id, author) =>
        set((s) => ({ notes: s.notes.filter((n) => !(n.id === id && n.author === author)) })),

      toggleVote: (kind, targetId, author, value) =>
        set((s) => {
          if (!author) return s;
          const key = targetKey(kind, targetId);
          const cible = { ...(s.votes[key] ?? {}) };
          if (cible[author] === value) delete cible[author];
          else cible[author] = value;
          const votes = { ...s.votes };
          if (Object.keys(cible).length === 0) delete votes[key];
          else votes[key] = cible;
          return { votes };
        }),
    }),
    { name: "skitrack-v1-selection-notes" },
  ),
);

/** Fil d'une cible, du plus ancien au plus récent. */
export function notesFor(
  state: Pick<NotesState, "notes">,
  kind: NoteKind,
  targetId: string,
): Note[] {
  return state.notes.filter((n) => n.kind === kind && n.targetId === targetId);
}

/** Le vote de cette personne, ou `null` si elle ne s'est pas prononcée. */
export function voteOf(
  state: Pick<NotesState, "votes">,
  kind: NoteKind,
  targetId: string,
  author: string | null | undefined,
): VoteValue | null {
  if (!author) return null;
  return state.votes[targetKey(kind, targetId)]?.[author] ?? null;
}

/** Décompte des voix exprimées. Le silence n'y figure pas. */
export function tallyOf(state: Pick<NotesState, "votes">, kind: NoteKind, targetId: string): Tally {
  const cible = Object.values(state.votes[targetKey(kind, targetId)] ?? {});
  const pour = cible.filter((v) => v > 0).length;
  const contre = cible.filter((v) => v < 0).length;
  return { pour, contre, exprimes: pour + contre };
}
