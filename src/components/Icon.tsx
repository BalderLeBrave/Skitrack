/**
 * Le pictogramme unique de SKITRACK.
 *
 * Un seul fichier, un seul registre, une seule grille de 24 et un seul trait.
 * Rien d'autre ne dessine d'icône : ni `lucide-react`, ni un `<svg>` écrit dans
 * un composant. Les données dessinées (profil altimétrique, histogramme de
 * neige) ne sont pas des icônes et restent chez elles.
 *
 * La taille et la couleur viennent du contexte. Le SVG ne porte ni `width` ni
 * `height` : les feuilles de style les fixent, comme la maquette v6 le faisait
 * déjà pour ses propres pictogrammes. `taille` force une dimension quand aucune
 * règle ne s'applique.
 */

import type { ReactNode } from "react";

export type IconName =
  | "coche"
  | "plus"
  | "moins"
  | "croix"
  | "chevron-gauche"
  | "chevron-droite"
  | "chevron-bas"
  | "loupe"
  | "filtres"
  | "point"
  | "etoile"
  | "televerser"
  | "soleil"
  | "pluie"
  | "neige"
  | "nuage"
  | "montagne"
  | "carte"
  | "tableau"
  | "corbeille"
  | "alerte";

/** Tracés du registre. Grille de 24, trait ouvert, jamais de remplissage. */
const TRACES: Record<IconName, ReactNode> = {
  coche: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 6v12M6 12h12" />,
  moins: <path d="M6 12h12" />,
  croix: <path d="M6 6l12 12M18 6L6 18" />,
  "chevron-gauche": <path d="M14 6l-6 6 6 6" />,
  "chevron-droite": <path d="M10 6l6 6-6 6" />,
  "chevron-bas": <path d="M6 9l6 6 6-6" />,
  loupe: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  filtres: <path d="M4 6h16M7 12h10M10 18h4" />,
  point: <circle cx="12" cy="12" r="3" />,
  etoile: <path d="M12 4.5l2.3 4.9 5.2.7-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2L4.5 10l5.2-.7z" />,
  televerser: <path d="M12 19V5M7 10l5-5 5 5M5 20h14" />,
  soleil: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </>
  ),
  pluie: (
    <>
      <path d="M7 15a4 4 0 010-8 5 5 0 019.6-1A3.5 3.5 0 0117.5 15H7z" />
      <path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5" />
    </>
  ),
  neige: (
    <>
      <path d="M7 14a4 4 0 010-8 5 5 0 019.6-1A3.5 3.5 0 0117.5 14H7z" />
      <path d="M9 18h.01M12 20h.01M15 18h.01M10.5 21h.01M13.5 17h.01" />
    </>
  ),
  nuage: <path d="M7 18a4.5 4.5 0 010-9 5.5 5.5 0 0110.6-1.2A4 4 0 0117.5 18H7z" />,
  montagne: <path d="M3 19l6.5-11 4 6.5 2.5-4L21 19z" />,
  carte: <path d="M9 4.5L3 7v12.5l6-2.5 6 2.5 6-2.5V4.5L15 7z M9 4.5V17 M15 7v12.5" />,
  tableau: <path d="M4 5h16v14H4z M4 10h16 M10 10v9" />,
  corbeille: <path d="M4 7h16 M9 7V5h6v2 M6.5 7l1 12h9l1-12 M10 11v5M14 11v5" />,
  alerte: <path d="M12 4l9 16H3z M12 10v4M12 17h.01" />,
};

export function Icon({
  name,
  taille,
  className,
  titre,
}: {
  name: IconName;
  /** Côté en pixels, quand aucune règle de style ne fixe la taille. */
  taille?: number;
  className?: string;
  /** Nomme l'icône pour un lecteur d'écran. Sans lui, elle est décorative. */
  titre?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      width={taille}
      height={taille}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={titre ? "img" : undefined}
      aria-hidden={titre ? undefined : true}
    >
      {titre ? <title>{titre}</title> : null}
      {TRACES[name]}
    </svg>
  );
}
