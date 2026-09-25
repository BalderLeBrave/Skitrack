/**
 * L'entrée « Mise à jour » du menu Plus : une commande réelle.
 *
 * Elle affichait « Mise à jour… » ou « Données à jour » dans un `<span>` que
 * rien ne pouvait actionner, masqué sous 1024 px, et dont la boucle de relevé
 * ne tournait que pendant que le menu était ouvert. Elle lance maintenant une
 * vérification, montre sa progression, dit son résultat et la date de la
 * dernière exécution, et peut être arrêtée.
 */

import { anciennete } from "@/lib/forfaits/age";
import { useMaj } from "@/lib/maj";

export function AutoSync() {
  const etat = useMaj((s) => s.etat);
  const faits = useMaj((s) => s.faits);
  const dernier = useMaj((s) => s.dernier);
  const reste = useMaj((s) => s.reste);
  const cause = useMaj((s) => s.cause);
  const derniereA = useMaj((s) => s.derniereA);
  const lancer = useMaj((s) => s.lancer);
  const arreter = useMaj((s) => s.arreter);

  const encours = etat === "encours";
  const quand = derniereA ? Date.parse(derniereA) : NaN;
  const releves = `${faits} relevé${faits > 1 ? "s" : ""}`;

  return (
    <div className="maj" data-testid="auto-sync" data-running={encours}>
      <div className="maj__ligne">
        <button
          type="button"
          className="maj__bouton"
          onClick={() => void lancer()}
          disabled={encours}
          aria-busy={encours}
        >
          {encours ? "Vérification en cours…" : "Vérifier les mises à jour"}
        </button>
        {encours ? (
          <button type="button" className="lien-doux" onClick={arreter}>
            Arrêter
          </button>
        ) : null}
      </div>
      <span className="maj__etat" aria-live="polite">
        {encours
          ? `${releves}${dernier ? ` · ${dernier}` : ""}`
          : etat === "fait"
            ? faits === 0 && !reste
              ? "Tout est à jour"
              : `${releves}${reste ? " · il en reste à mettre à jour" : " · rien d’autre à mettre à jour"}`
            : etat === "echec"
              ? "Vérification interrompue par une erreur"
              : Number.isFinite(quand)
                ? `Dernière vérification ${anciennete(quand)}`
                : "Jamais vérifié sur cet appareil"}
      </span>
      {etat === "echec" && cause ? (
        <details className="maj__detail">
          <summary>Détail technique</summary>
          <code>{cause}</code>
        </details>
      ) : null}
    </div>
  );
}
