/** Icônes en SVG inline. Pas de police d'icônes ni de sprite : il y en a dix,
 *  elles héritent de `currentColor`, et un fichier de plus coûterait plus cher
 *  à maintenir que ces quelques chemins. */

export function LogoIcon({ size = 22, fill = 'currentColor' }: { size?: number; fill?: string }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="SKITRACK"
      style={{ flex: '0 0 auto' }}
    >
      <path d="M2 27 L11 9 L16.5 19 L20 13 L30 27 Z" fill={fill} />
      <rect x="0" y="20.4" width="32" height="2.1" fill="var(--accent)" />
    </svg>
  )
}

export function CloseIcon(): JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export function ExternalIcon(): JSX.Element {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      aria-hidden="true"
      style={{ verticalAlign: '-1px', marginLeft: 2 }}
    >
      <path
        d="M3 9L9 3M4.8 3H9v4.2"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SearchIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: '0 0 auto', color: 'var(--muted)' }}>
      <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M10.6 10.6L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function SunIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" role="img" aria-label="soleil">
      <circle cx="8" cy="8" r="3.4" fill="var(--accent)" />
      <g stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round">
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13" />
      </g>
    </svg>
  )
}

export function CloudIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" role="img" aria-label="nuageux">
      <path d="M4.5 12a3 3 0 010-6 4 4 0 017.7 1.1A2.5 2.5 0 0111.5 12z" fill="var(--dim)" />
    </svg>
  )
}

export function SnowIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" role="img" aria-label="neige">
      <path d="M8 2v12M2.8 5l10.4 6M13.2 5L2.8 11" stroke="var(--link)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function RainIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" role="img" aria-label="pluie">
      <path d="M4.5 10a3 3 0 010-6 4 4 0 017.7 1.1A2.5 2.5 0 0111.5 10z" fill="var(--dim)" />
      <g stroke="var(--link)" strokeWidth="1.2" strokeLinecap="round">
        <path d="M5.5 12l-.7 2M8 12l-.7 2M10.5 12l-.7 2" />
      </g>
    </svg>
  )
}

export function TrendIcon(): JSX.Element {
  return (
    <svg width="44" height="44" viewBox="0 0 32 32" style={{ color: 'var(--dim)' }} aria-hidden="true">
      <polyline
        points="3,24 10,15 15,19 22,8 29,17"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="22" cy="8" r="3" fill="var(--accent)" />
    </svg>
  )
}

/**
 * Dégradé partagé par tous les profils altimétriques : bleu glacier en haut,
 * vert vallée en bas. Défini une fois dans le document, référencé par `url(#…)`.
 */
export function SvgDefs(): JSX.Element {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a90d9" />
          <stop offset="55%" stopColor="var(--link)" />
          <stop offset="100%" stopColor="#1c6d46" />
        </linearGradient>
      </defs>
    </svg>
  )
}
