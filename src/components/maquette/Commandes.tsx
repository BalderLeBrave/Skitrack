/**
 * Les petites commandes de la maquette Airbnb : interrupteur (`sw()`), groupe
 * d'onglets en pilule (`seg2()` : unitTabs, pmTabs, prixTabs, favTabs),
 * pastille de filtre (`pill()`) et puce de critère actif (avec sa croix, ou
 * verrouillée par la recherche). Skitrack App.dc.html:256, 364, 823, 970-971.
 */

import type { ReactNode } from "react";
import { tr } from "@/lib/i18n";
import { IconeCadenas, IconeCroix } from "./traces";

/**
 * L'interrupteur de 40 × 24. Avec `onToggle`, c'est un bouton `role="switch"` ;
 * sans, un simple dessin à poser dans une commande qui porte déjà le clic
 * (voir `LigneInterrupteur`).
 */
export function Interrupteur({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle?: () => void;
  /** Nom accessible, obligatoire quand l'interrupteur est cliquable seul. */
  label?: string;
}) {
  const dessin = (
    <span className={`m8-inter${on ? " m8-inter--on" : ""}`} aria-hidden>
      <i />
    </span>
  );
  if (!onToggle) return dessin;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="m8-inter-bouton"
      onClick={onToggle}
    >
      {dessin}
    </button>
  );
}

/** Une ligne pleine largeur : libellé, sous-ligne grise, interrupteur à droite
 *  (« Fiabilité des données », Skitrack App.dc.html:438). Toute la ligne bascule. */
export function LigneInterrupteur({
  label,
  sous,
  on,
  onToggle,
}: {
  label: string;
  /** Deuxième ligne grise (un compte), facultative. */
  sous?: ReactNode;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="m8-ligne-inter"
      onClick={onToggle}
    >
      <span className="m8-ligne-inter__txt">
        <span className="m8-ligne-inter__lbl">{label}</span>
        {sous != null ? <span className="m8-ligne-inter__sous">{sous}</span> : null}
      </span>
      <Interrupteur on={on} />
    </button>
  );
}

export type Onglet<K extends string> = { key: K; label: string };

/** Groupe d'onglets en pilule sur fond gris : l'actif sur fond clair, ombré. */
export function Onglets<K extends string>({
  items,
  valeur,
  onChoisir,
  ariaLabel,
  className = "",
}: {
  items: readonly Onglet<K>[];
  valeur: K;
  onChoisir: (k: K) => void;
  /** Nom du groupe (« Unité », « Prix », « Affichage »). */
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={`m8-onglets ${className}`}>
      {items.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={o.key === valeur}
          className={`m8-onglet${o.key === valeur ? " m8-onglet--on" : ""}`}
          onClick={() => onChoisir(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Pastille de filtre de 38 px : bord encre et fond gris quand elle est choisie. */
export function Pastille({
  on,
  onClick,
  compte,
  title,
  children,
  className = "",
}: {
  on: boolean;
  onClick: () => void;
  /** Un compte gris après le libellé (« Sources » : nombre d'annonces). */
  compte?: ReactNode;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      className={`m8-pastille${on ? " m8-pastille--on" : ""}${compte != null ? " m8-pastille--compte" : ""} ${className}`}
      onClick={onClick}
    >
      {children}
      {compte != null ? <span className="m8-pastille__compte">{compte}</span> : null}
    </button>
  );
}

/**
 * La puce d'un critère actif. Trois aspects :
 * - « clair » (défaut) : bordée, sur le papier, avec son rond × (Stations, Logements) ;
 * - « verre » : sur la photo de couverture de l'accueil, sans bord ;
 * - `verrou` : fixée par la recherche, grise avec un cadenas et sans croix.
 */
export function PuceCritere({
  label,
  onRetirer,
  verrou = false,
  variante = "clair",
  title,
}: {
  label: ReactNode;
  /** Absent (ou `verrou`) : pas de croix. */
  onRetirer?: () => void;
  verrou?: boolean;
  variante?: "clair" | "verre";
  /** Infobulle ; défaut pour une puce verrouillée : « Fixé par votre recherche ». */
  title?: string;
}) {
  if (verrou) {
    return (
      <span className="m8-puce m8-puce--verrou" title={title ?? tr("Fixé par votre recherche")}>
        <IconeCadenas />
        {label}
      </span>
    );
  }
  return (
    <span
      className={`m8-puce m8-puce--${variante}${onRetirer ? "" : " m8-puce--seule"}`}
      title={title}
    >
      {label}
      {onRetirer ? (
        <button
          type="button"
          className="m8-puce__x"
          aria-label={tr("Retirer le critère")}
          title={tr("Retirer le critère")}
          onClick={onRetirer}
        >
          <IconeCroix taille={10} epaisseur={2.8} />
        </button>
      ) : null}
    </span>
  );
}
