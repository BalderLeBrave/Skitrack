/** État vide honnête : un constat, une issue, au plus une action. */

interface Props {
  title: string
  hint?: string
  action?: { label: string; onClick: () => void; testid?: string }
  testid?: string
  children?: React.ReactNode
}

export function EmptyHonest({ title, hint, action, testid, children }: Props): JSX.Element {
  return (
    <div className="rc-empty" data-testid={testid ?? 'empty-honest'}>
      <svg viewBox="0 0 48 48" aria-hidden="true" className="rc-empty__glyph">
        <path d="M6 38l12-20 8 12 5-7 11 15z" />
        <circle cx="36" cy="12" r="4" />
      </svg>
      <strong className="rc-empty__title">{title}</strong>
      {hint && <p className="rc-empty__hint">{hint}</p>}
      {children}
      {action && (
        <button type="button" className="rc-btn rc-btn--cta" onClick={action.onClick} data-testid={action.testid}>
          {action.label}
        </button>
      )}
    </div>
  )
}
