/**
 * La rangée de catégories d'Airbnb (Skitrack App.dc.html:204-211 en sombre sur
 * la couverture, 237-243 et 352-358 en clair dans le bandeau collant) : des
 * pictogrammes en trait fin qui défilent à l'horizontale, l'actif souligné, et
 * le bouton « Filtres » à droite avec le nombre de filtres posés.
 *
 * Chaque catégorie est une bascule (`aria-pressed`) : plusieurs peuvent être
 * actives à la fois, comme les puces de critères qu'elles remplacent.
 */

import { tr, trN } from "@/lib/i18n";
import { IconeReglages, Trace } from "./traces";

export type Categorie = {
  key: string;
  /** Libellé court sous le pictogramme, déjà traduit. */
  label: string;
  /** Infobulle (libellé long), déjà traduite. */
  title?: string;
  /** Le `d` du pictogramme : en général `ICONES[cle]`. */
  iconPath: string;
  on: boolean;
  onToggle: () => void;
};

export function RangeeCategories({
  items,
  variante = "clair",
  nFiltres = 0,
  onFiltres,
  ariaLabel,
  className = "",
}: {
  items: readonly Categorie[];
  /** « clair » : sur le papier (bandeau collant) ; « sombre » : sur la photo de couverture. */
  variante?: "clair" | "sombre";
  /** Pastille du bouton « Filtres » ; 0 la masque. */
  nFiltres?: number;
  /** Absent : pas de bouton « Filtres ». */
  onFiltres?: () => void;
  /** Nom du groupe pour les lecteurs d'écran (défaut : « Catégories »). */
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={`m8-cats m8-cats--${variante} ${className}`}>
      <div className="m8-cats__rail" role="group" aria-label={ariaLabel ?? tr("Catégories")}>
        {items.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`m8-cat${c.on ? " m8-cat--on" : ""}`}
            title={c.title}
            aria-pressed={c.on}
            onClick={c.onToggle}
          >
            <Trace d={c.iconPath} taille={24} epaisseur={1.5} />
            <span>{c.label}</span>
          </button>
        ))}
      </div>
      {onFiltres ? <BoutonFiltres n={nFiltres} onClick={onFiltres} variante={variante} /> : null}
    </div>
  );
}

/** Le bouton « Filtres » seul (styles `sFiltBtn` / `sFiltBtnDark`), avec sa pastille de compte. */
export function BoutonFiltres({
  n = 0,
  onClick,
  variante = "clair",
}: {
  /** Nombre de filtres posés ; 0 masque la pastille. */
  n?: number;
  onClick: () => void;
  variante?: "clair" | "sombre";
}) {
  return (
    <button
      type="button"
      className={`m8-filtres m8-filtres--${variante}`}
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={n > 0 ? trN(n, "Filtres, {n} actif", "Filtres, {n} actifs") : tr("Filtres")}
    >
      <IconeReglages />
      {tr("Filtres")}
      {n > 0 ? (
        <span className="m8-filtres__n" aria-hidden>
          {n}
        </span>
      ) : null}
    </button>
  );
}
