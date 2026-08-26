/**
 * Notes et votes d'un élément retenu.
 *
 * Une barre par domaine ou par logement de « Ma sélection » : le fil des notes,
 * le pouce pour, le pouce contre, et le formulaire de saisie.
 *
 * Deux choix qui méritent d'être dits :
 *
 *  * **Le vote réutilise `state.votes`.** Il est déjà indexé par clé d'objet et
 *    par rang de votant, ce qui est exactement le modèle de `selection_votes`
 *    (cible, votant, valeur). En ouvrir un second aurait donné deux comptes de
 *    votes dans la même application.
 *  * **Le votant est le voyageur courant** (`state.voter`), pas un compte
 *    distant. Il n'y a pas de multi-utilisateur réseau ici : les
 *    « collaborateurs » sont les voyageurs du groupe, enregistrés en local.
 */

import { useState } from 'react'
import type { SelectionKind } from '@/state/appState'
import { selectionVoteKey, useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'

/** Initiales d'un voyageur, pour la pastille du fil. */
function initialsOf(first: string, last: string): string {
  return `${first.slice(0, 1)}${last.slice(0, 1)}`.toUpperCase() || '—'
}

export function SelectionNotes({ kind, targetId }: { kind: SelectionKind; targetId: number }): JSX.Element {
  const { state, patch } = useApp()
  const derived = useDerived()
  const { fmtDate } = useFormat()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const key = selectionVoteKey(kind, targetId)
  const thread = state.selNotes.filter((n) => n.kind === kind && n.targetId === targetId)
  const mine = derived.voteOf(key, state.voter)
  const tally = state.votes[key] ?? []
  const up = tally.filter((v) => v > 0).length
  const down = tally.filter((v) => v < 0).length

  /** Un même appui retire le vote : voter deux fois pour n'est pas voter deux fois. */
  const vote = (value: number): void => {
    const next = (state.votes[key] ?? []).slice()
    next[state.voter] = next[state.voter] === value ? 0 : value
    patch({ votes: { ...state.votes, [key]: next } })
  }

  const publish = (): void => {
    const body = draft.trim()
    if (!body) return
    const id = state.selNotes.reduce((max, n) => Math.max(max, n.id), 0) + 1
    patch({
      selNotes: [
        ...state.selNotes,
        {
          id,
          kind,
          targetId,
          // `-1` quand le groupe n'est pas renseigné : la note existe quand même,
          // elle n'est simplement attribuée à personne.
          authorId: state.people[state.voter]?.id ?? -1,
          createdAt: new Date().toISOString(),
          body
        }
      ]
    })
    setDraft('')
    setOpen(false)
  }

  return (
    <div className="selnote">
      <div className="selnote__head">
        <button type="button" className="selnote__toggle" onClick={() => setOpen((o) => !o)}>
          {thread.length > 0
            ? t('sel_note_count').replace('{n}', String(thread.length))
            : t('sel_note_add')}
        </button>
        <button
          type="button"
          className="selnote__vote"
          aria-pressed={mine > 0}
          aria-label={t('sel_vote_for')}
          title={t('sel_vote_for')}
          onClick={() => vote(1)}
        >
          👍{up > 0 && <span className="selnote__tally u-num">{up}</span>}
        </button>
        <button
          type="button"
          className="selnote__vote"
          aria-pressed={mine < 0}
          aria-label={t('sel_vote_against')}
          title={t('sel_vote_against')}
          onClick={() => vote(-1)}
        >
          👎{down > 0 && <span className="selnote__tally u-num">{down}</span>}
        </button>
      </div>

      {thread.map((n) => {
        const who = state.people.find((p) => p.id === n.authorId)
        return (
          <div className="selnote__row" key={n.id}>
            <span className="selnote__av" aria-hidden>
              {who ? initialsOf(who.first, who.last) : '—'}
            </span>
            <span className="selnote__body">
              <span className="selnote__meta">
                <b>{who ? who.first : '—'}</b> · {fmtDate(n.createdAt.slice(0, 10))}
              </span>
              {n.body}
            </span>
          </div>
        )
      })}

      {open && (
        <div className="selnote__form">
          <textarea
            className="selnote__ta"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('sel_note_placeholder')}
            aria-label={t('sel_note_add')}
          />
          <div className="selnote__actions">
            <button type="button" className="btn btn--primary btn--small" onClick={publish}>
              {t('sel_note_publish')}
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                setOpen(false)
                setDraft('')
              }}
            >
              {t('sel_note_cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
