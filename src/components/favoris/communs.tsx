/**
 * Ce que Favoris et Réservation partagent : l'état vide (Skitrack
 * App.dc.html:606, 630, 652), la mosaïque de couverture d'un dossier (610),
 * et la flèche de tri des tableaux.
 */

import { Trace } from "@/components/maquette";
import { tr } from "@/lib/i18n";
import { useVersLogements } from "./outils";

export function VideFavoris({ titre }: { titre: string }) {
  const versLogements = useVersLogements();
  return (
    <div className="fv-vide">
      <b>{titre}</b>
      <button type="button" className="fv-encre" onClick={versLogements}>
        {tr("Voir les logements")}
      </button>
    </div>
  );
}

/** La mosaïque carrée : une grande photo à gauche, deux petites à droite. */
export function Couverture({ photos }: { photos: readonly string[] }) {
  return (
    <span className="fv-couv" aria-hidden>
      {[0, 1, 2].map((k) => (
        <span
          key={k}
          className={`fv-couv__case${k === 0 ? " fv-couv__case--grande" : ""}${photos[k] ? "" : " fv-couv__case--vide"}`}
        >
          {photos[k] ? <img src={photos[k]} alt="" loading="lazy" decoding="async" draggable={false} /> : null}
        </span>
      ))}
    </span>
  );
}

/** Les flèches de tri de la maquette (montante, descendante). */
export function FlecheTri({ sens }: { sens: 1 | -1 }) {
  return <Trace d={sens > 0 ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M19 12l-7 7-7-7"} taille={10} epaisseur={2.6} />;
}
