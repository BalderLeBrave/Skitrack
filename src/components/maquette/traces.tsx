/**
 * Les petits pictogrammes en trait de la maquette Airbnb, tracés tels que le
 * design les écrit (viewBox 24, `stroke="currentColor"`, bouts arrondis).
 * Les icônes de catégorie et d'équipement viennent de `icones.ts`.
 */

import { ICONES, type CleIcone } from "./icones";

type Props = { taille?: number; epaisseur?: number; className?: string };

/** Un tracé en trait fin : une clé de `ICONES`, ou un `d` donné tel quel. */
export function Trace({
  icone,
  d,
  taille = 24,
  epaisseur = 1.5,
  className,
}: Props & { icone?: CleIcone; d?: string }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={epaisseur}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={d ?? (icone ? ICONES[icone] : "")} />
    </svg>
  );
}

export const IconeCroix = (p: Props) => (
  <Trace
    d="M18 6 6 18M6 6l12 12"
    taille={p.taille ?? 14}
    epaisseur={p.epaisseur ?? 2.4}
    className={p.className}
  />
);
export const IconeGauche = (p: Props) => (
  <Trace
    d="m15 18-6-6 6-6"
    taille={p.taille ?? 12}
    epaisseur={p.epaisseur ?? 2.6}
    className={p.className}
  />
);
export const IconeDroite = (p: Props) => (
  <Trace
    d="m9 18 6-6-6-6"
    taille={p.taille ?? 12}
    epaisseur={p.epaisseur ?? 2.6}
    className={p.className}
  />
);
export const IconePlus = (p: Props) => (
  <Trace
    d="M12 5v14M5 12h14"
    taille={p.taille ?? 14}
    epaisseur={p.epaisseur ?? 2.6}
    className={p.className}
  />
);
export const IconeCoche = (p: Props) => (
  <Trace
    d="M20 6 9 17l-5-5"
    taille={p.taille ?? 14}
    epaisseur={p.epaisseur ?? 3}
    className={p.className}
  />
);
/** Les trois traits du bouton « Filtres ». */
export const IconeReglages = (p: Props) => (
  <Trace
    d="M4 6h16M7 12h10M10 18h4"
    taille={p.taille ?? 15}
    epaisseur={p.epaisseur ?? 2}
    className={p.className}
  />
);

/** Le cadenas d'une puce verrouillée. */
export function IconeCadenas({ taille = 12, className }: Props) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** L'étoile pleine de la note. */
export function IconeEtoile({ taille = 12, className }: Props) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1Z" />
    </svg>
  );
}

/** Le cœur de la carte : remplissage et bord posés par la feuille (`.m8-coeur`). */
export function IconeCoeur({ taille = 24, className }: Props) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      strokeWidth={2}
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}
