/**
 * Le sens du tri, à côté du critère : un bouton qui dit le sens courant et
 * l'inverse au clic. Le même sur tous les écrans, pour que « de la plus grande
 * à la plus petite valeur, et inversement » se trouve toujours au même endroit.
 */

import { inverser, sensLbl, type Sens } from "@/lib/tri";
import { tr } from "@/lib/i18n";

export function SensTri({
  sens,
  onChange,
  alpha = false,
  className,
  variante = "texte",
}: {
  sens: Sens;
  onChange: (s: Sens) => void;
  /** Un tri par nom : « A → Z » plutôt que « Croissant ». */
  alpha?: boolean;
  className?: string;
  /** « rond » : le bouton rond de 44 px de la maquette Airbnb, flèche seule ;
   *  le sens se lit dans son nom et son infobulle. */
  variante?: "texte" | "rond";
}) {
  const lbl = sensLbl(sens, alpha);
  const autre = alpha ? sensLbl(inverser(sens), alpha) : sensLbl(inverser(sens)).toLowerCase();
  if (variante === "rond") {
    return (
      <button
        type="button"
        className={`st-sens${className ? ` ${className}` : ""}`}
        aria-label={tr("Ordre du tri : {sens}. Passer en {autre}", { sens: lbl, autre })}
        title={lbl}
        onClick={() => onChange(inverser(sens))}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={sens === 1 ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M19 12l-7 7-7-7"} />
        </svg>
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`sens7${className ? ` ${className}` : ""}`}
      aria-label={tr("Ordre du tri : {sens}. Passer en {autre}", { sens: lbl, autre })}
      title={tr("Passer en {autre}", { autre })}
      onClick={() => onChange(inverser(sens))}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className={sens === 1 ? "sens7__fleche--haut" : undefined}>
        <path d="M12 5v14M6 13l6 6 6-6" />
      </svg>
      {lbl}
    </button>
  );
}
