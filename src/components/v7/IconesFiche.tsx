/**
 * Les pictogrammes de la fiche station, tracés et traits relevés tels quels
 * dans la maquette Airbnb (`Skitrack App.dc.html`, « Fiche station » et
 * `vMore`). Le registre commun (`Icon`) dessine les mêmes idées sur une autre
 * grille et un autre trait ; la fiche reprend ceux de la maquette, à
 * l'identique, comme l'utilisateur l'a demandé.
 */

type Trace = { d: string; trait: number; joint?: boolean };

const TRACES = {
  "chevron-gauche": { d: "m15 18-6-6 6-6", trait: 2.4 },
  "chevron-droite": { d: "m9 18 6-6-6-6", trait: 2.4 },
  "chevron-bas": { d: "m6 9 6 6 6-6", trait: 2.4 },
  coche: { d: "M20 6 9 17l-5-5", trait: 3, joint: true },
  fleche: { d: "M5 12h14M13 6l6 6-6 6", trait: 2.4 },
  externe: { d: "M7 17 17 7M7 7h10v10", trait: 2.4 },
  agrandir: { d: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7", trait: 2 },
  croix: { d: "M18 6 6 18M6 6l12 12", trait: 2.4 },
  plus: { d: "M12 5v14M5 12h14", trait: 2.4 },
  moins: { d: "M5 12h14", trait: 2.4 },
  "tri-haut": { d: "M12 19V5M5 12l7-7 7 7", trait: 2.6 },
  "tri-bas": { d: "M12 5v14M19 12l-7 7-7-7", trait: 2.6 },
  sun: {
    d: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    trait: 1.7,
    joint: true,
  },
  cloud: { d: "M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z", trait: 1.7, joint: true },
  snow: {
    d: "M20 17.6A5 5 0 0 0 18 8h-1.3A8 8 0 1 0 4 16.3M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01",
    trait: 1.7,
    joint: true,
  },
  rain: { d: "M20 17.6A5 5 0 0 0 18 8h-1.3A8 8 0 1 0 4 16.3M8 19v2M12 19v2M16 19v2", trait: 1.7, joint: true },
} satisfies Record<string, Trace>;

export type IconeFiche = keyof typeof TRACES;

export function IconeFiche({ nom, taille, className }: { nom: IconeFiche; taille: number; className?: string }) {
  const t: Trace = TRACES[nom];
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={t.trait}
      strokeLinecap="round"
      strokeLinejoin={t.joint ? "round" : undefined}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={t.d} />
    </svg>
  );
}
