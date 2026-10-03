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
}: {
  sens: Sens;
  onChange: (s: Sens) => void;
  /** Un tri par nom : « A → Z » plutôt que « Croissant ». */
  alpha?: boolean;
  className?: string;
}) {
  const lbl = sensLbl(sens, alpha);
  const autre = alpha ? sensLbl(inverser(sens), alpha) : sensLbl(inverser(sens)).toLowerCase();
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
