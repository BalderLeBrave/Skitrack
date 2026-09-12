/** Pictogrammes de la maquette, en SVG en ligne (l. 232, 265, 269, 313–314,
 *  546–547, 587). Les glyphes texte de la maquette (−, +, ✕, ✓, ·, ★) passent
 *  ici aussi, règle 4 de la phase 2 : jamais de glyphe Unicode en icône. */

const base = { viewBox: "0 0 24 24", "aria-hidden": true } as const;

export const IconSearch = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);
export const IconFilters = () => (
  <svg {...base}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </svg>
);
export const IconCheck = () => (
  <svg {...base}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const IconPlus = () => (
  <svg {...base}>
    <path d="M12 6v12M6 12h12" />
  </svg>
);
export const IconMinus = () => (
  <svg {...base}>
    <path d="M6 12h12" />
  </svg>
);
export const IconClose = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconChevronLeft = () => (
  <svg {...base}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);
export const IconChevronRight = () => (
  <svg {...base}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const IconDot = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
  </svg>
);
export const IconStar = () => (
  <svg {...base}>
    <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z" />
  </svg>
);
