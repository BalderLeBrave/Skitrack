import { useState } from "react";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import {
  notesFor,
  tallyOf,
  useSelectionNotes,
  voteOf,
  type NoteKind,
  type VoteValue,
} from "@/lib/stay/notes";

/**
 * Notes et votes d'un élément retenu.
 *
 * Une barre par station ou par logement : le fil des notes, le pouce pour, le
 * pouce contre, et la saisie. Le décompte n'affiche que les voix exprimées :
 * « 3 pour » et rien d'autre, jamais « 3 sur 5 », parce que les deux personnes
 * qui n'ont rien dit n'ont pas voté contre.
 *
 * Réécrit : l'original indexait les votes par rang de voyageur dans une liste
 * locale qui n'existe plus. L'auteur est le compte courant.
 */

function ThumbUp() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 10v10H4V10h3zm3 10V9l4.5-6 1.3.9c.4.3.5.8.4 1.2L15.4 9H20a2 2 0 012 2.3l-1.2 7A2 2 0 0118.8 20H10z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThumbDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 14V4H4v10h3zm3-10v11l4.5 6 1.3-.9c.4-.3.5-.8.4-1.2L15.4 15H20a2 2 0 002-2.3l-1.2-7A2 2 0 0018.8 4H10z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

export function SelectionNotes({ kind, targetId }: { kind: NoteKind; targetId: string }) {
  const user = useCurrentUser();
  const author = user?.id ?? null;
  const notes = useSelectionNotes((s) => s.notes);
  const votes = useSelectionNotes((s) => s.votes);
  const addNote = useSelectionNotes((s) => s.addNote);
  const removeNote = useSelectionNotes((s) => s.removeNote);
  const toggleVote = useSelectionNotes((s) => s.toggleVote);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const thread = notesFor({ notes }, kind, targetId);
  const mine = voteOf({ votes }, kind, targetId, author);
  const tally = tallyOf({ votes }, kind, targetId);

  const vote = (value: VoteValue): void => {
    if (author) toggleVote(kind, targetId, author, value);
  };

  const publish = (): void => {
    if (!author) return;
    addNote(kind, targetId, author, draft);
    setDraft("");
    setOpen(false);
  };

  const btn = "flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs";

  return (
    <div className="flex flex-col gap-2" data-testid="selection-notes">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btn}
          onClick={() => setOpen((o) => !o)}
          disabled={author == null}
        >
          {thread.length > 0
            ? `${thread.length} note${thread.length > 1 ? "s" : ""}`
            : "Écrire une note"}
        </button>
        <button
          type="button"
          className={`${btn} ${mine === 1 ? "bg-glacier font-semibold" : ""}`}
          aria-pressed={mine === 1}
          aria-label="Pour"
          onClick={() => vote(1)}
          disabled={author == null}
        >
          <ThumbUp />
          {tally.pour > 0 && <span>{tally.pour}</span>}
        </button>
        <button
          type="button"
          className={`${btn} ${mine === -1 ? "bg-glacier font-semibold" : ""}`}
          aria-pressed={mine === -1}
          aria-label="Contre"
          onClick={() => vote(-1)}
          disabled={author == null}
        >
          <ThumbDown />
          {tally.contre > 0 && <span>{tally.contre}</span>}
        </button>
        {tally.exprimes > 0 && (
          <span className="text-xs text-muted">
            {tally.exprimes} voix exprimée{tally.exprimes > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {thread.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {thread.map((n) => (
            <li key={n.id} className="rounded-md border border-line px-2 py-1.5 text-sm">
              <span className="text-xs text-muted">{dayOf(n.at)}</span>
              <p className="mt-0.5">{n.body}</p>
              {n.author === author && (
                <button
                  type="button"
                  className="mt-1 text-xs text-muted underline"
                  onClick={() => removeNote(n.id, author)}
                >
                  Retirer ma note
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && author != null && (
        <div className="flex flex-col gap-1.5">
          <textarea
            className="min-h-16 rounded-md border border-line bg-panel px-2 py-1.5 text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Note"
            placeholder="Ce que vous voulez retenir de ce choix."
          />
          <div className="flex gap-2">
            <button type="button" className={btn} onClick={publish} disabled={!draft.trim()}>
              Enregistrer
            </button>
            <button type="button" className={btn} onClick={() => setOpen(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {author == null && (
        <p className="text-xs text-muted">
          Les notes et les votes sont attachés à un compte. Connectez-vous pour en écrire.
        </p>
      )}
    </div>
  );
}
