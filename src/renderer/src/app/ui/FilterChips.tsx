/** Rangée de pastilles de filtre : état binaire, lisible sans la couleur seule. */

export interface Chip {
  id: string
  label: string
  on: boolean
  onToggle: () => void
  count?: number
}

export function FilterChips({ chips, label, testid }: { chips: Chip[]; label: string; testid?: string }): JSX.Element {
  return (
    <div className="rc-chips" role="group" aria-label={label} data-testid={testid}>
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`rc-chip${c.on ? ' rc-chip--on' : ''}`}
          aria-pressed={c.on}
          data-testid={`chip-${c.id}`}
          onClick={c.onToggle}
        >
          {c.on && (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
          {c.label}
          {c.count != null && <span className="rc-chip__count u-num">{c.count}</span>}
        </button>
      ))}
    </div>
  )
}
