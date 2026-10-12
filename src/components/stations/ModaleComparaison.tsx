/**
 * La fenêtre de comparaison des stations (Skitrack App.dc.html:331-342) :
 * une colonne par station (photo, nom, « Retenir », « Fiche », « Retirer »),
 * une ligne par critère, la meilleure valeur en vert gras, la barre des pistes
 * par couleur, et la bascule « Masquer les critères identiques ». Pied : la
 * limite de quatre stations et le bouton qui mène aux logements de la station
 * retenue.
 *
 * Les critères sont ceux de l'ancien tableau de Comparer (`CRIT`), avec leurs
 * mentions d'échelle en infobulle, leurs absences écrites et l'indicateur de
 * fiabilité du forfait.
 */

import { useRef } from "react";
import { createPortal } from "react-dom";
import { IconeCroix, Interrupteur, useModale } from "@/components/maquette";
import { FiabiliteFaible } from "@/components/v7/FiabiliteFaible";
import { mixLbl } from "@/components/v7/mixLbl";
import { PartPistes } from "@/components/v7/PartPistes";
import { CMP_MAX, COLS, stationPhoto } from "@/lib/parcours";
import { lignePistes } from "@/lib/pistesDetail";
import { SKIINFO } from "@/lib/skiinfo";
import type { Station } from "@/lib/stations";
import { sansDomaineLbl } from "@/lib/v7";
import { tr } from "@/lib/i18n";
import { affiche, CRIT, nIdentiques } from "./criteres";

export function ModaleComparaison({
  cmp,
  pickId,
  masquer,
  onMasquer,
  onRetenir,
  onFiche,
  onRetirer,
  cta,
  onCta,
  onFermer,
}: {
  cmp: readonly Station[];
  /** La station retenue pour les logements. */
  pickId: string | null;
  masquer: boolean;
  onMasquer: () => void;
  onRetenir: (id: string) => void;
  onFiche: (id: string) => void;
  onRetirer: (id: string) => void;
  cta: string;
  onCta: () => void;
  onFermer: () => void;
}) {
  const boite = useRef<HTMLDivElement>(null);
  useModale(boite, onFermer);
  const n = cmp.length;
  const colonnes = { gridTemplateColumns: `190px repeat(${Math.max(n, 1)}, minmax(170px, 1fr))`, minWidth: 190 + Math.max(n, 1) * 170 };
  const nId = nIdentiques(cmp);

  return createPortal(
    <div className="m8-modale-hote m8-modale-hote--filtres">
      <div className="m8-voile" onClick={onFermer} aria-hidden />
      <div
        ref={boite}
        className="m8-modale st-cmp"
        role="dialog"
        aria-modal="true"
        aria-label={tr("Comparaison des stations")}
        tabIndex={-1}
      >
        <header className="st-cmp__tete">
          <button type="button" className="m8-modale__fermer st-cmp__fermer" aria-label={tr("Fermer la comparaison")} onClick={onFermer}>
            <IconeCroix taille={14} epaisseur={2.4} />
          </button>
          {n > 1 ? (
            <button type="button" role="switch" aria-checked={masquer} className="st-cmp__masquer" onClick={onMasquer}>
              <Interrupteur on={masquer} />
              {tr("Masquer les critères identiques ({n})", { n: nId })}
            </button>
          ) : null}
        </header>
        <div className="st-cmp__corps">
          <div className="st-cmp__rangee st-cmp__rangee--tete" style={colonnes}>
            <span />
            {cmp.map((s) => {
              const on = s.id === pickId;
              const src = stationPhoto(s);
              return (
                <div key={s.id} className="st-cmp__col">
                  <div className="st-cmp__photo">{src ? <img src={src} alt="" loading="lazy" /> : null}</div>
                  <b className="st-cmp__nom">{s.name}</b>
                  <div className="st-cmp__actions">
                    <label
                      className={`st-cmp__retenir${on ? " st-cmp__retenir--on" : ""}`}
                      title={tr("Retenir {station} pour les logements", { station: s.name })}
                    >
                      <input
                        type="radio"
                        name="st-cmp-pick"
                        className="m8-lu-seul"
                        checked={on}
                        onChange={() => onRetenir(s.id)}
                        aria-label={tr("Retenir {station} pour les logements", { station: s.name })}
                      />
                      <i aria-hidden />
                      {on ? tr("Retenue") : tr("Retenir")}
                    </label>
                    <a
                      href={`/stations/${s.id}`}
                      className="st-cmp__bouton"
                      onClick={(e) => {
                        e.preventDefault();
                        onFiche(s.id);
                      }}
                    >
                      {tr("Fiche")}
                    </a>
                    <button type="button" className="st-cmp__bouton" onClick={() => onRetirer(s.id)}>
                      {tr("Retirer")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {CRIT.map((c) => {
            const vals = cmp.map((s) => (c.num ? c.num(s) : null));
            const known = vals.filter((v): v is number => v != null);
            // Toutes les valeurs égales : pas de meilleure, rien en vert.
            const best = known.length > 1 && new Set(known).size > 1 ? Math.max(...known) : null;
            const identique = n > 1 && new Set(cmp.map((s) => affiche(c, s))).size === 1;
            if (identique && masquer) return null;
            return (
              <div key={c.label} className="st-cmp__rangee" style={colonnes}>
                <span className="st-cmp__critere" title={c.note ? tr(c.note) : undefined}>
                  {tr(c.label)}
                </span>
                {cmp.map((s, i) => {
                  const v = c.txt(s);
                  const sous = c.sous?.(s) ?? null;
                  const gagne = best != null && vals[i] === best;
                  const faible = v != null ? c.faible?.(s) : null;
                  return (
                    <span
                      key={s.id}
                      className={`st-cmp__cell${gagne ? " st-cmp__cell--best" : ""}${v == null ? " st-cmp__cell--absent" : ""}`}
                      title={sous ?? undefined}
                    >
                      {v ?? c.absent?.(s) ?? tr("non relevé")}
                      {faible ? (
                        <>
                          {" "}
                          <FiabiliteFaible court raisons={faible} />
                        </>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            );
          })}
          <div className="st-cmp__rangee" style={colonnes}>
            <span className="st-cmp__critere" title={tr("OpenSkiMap, à l’échelle du domaine")}>
              {tr("Pistes par couleur")}
            </span>
            {cmp.map((s) => (
              <div key={s.id} className="st-cmp__mix">
                <PartPistes share={s.colorShare} hauteur={8} />
                {/* Les totaux de la fiche Skiinfo, une autre échelle, en infobulle. */}
                <span title={lignePistes(SKIINFO[s.id]) ?? undefined}>
                  {s.colorShare
                    ? `${COLS.map((c) => s.colorShare![c.key]).join(" · ")} %`
                    : (sansDomaineLbl(s) ?? mixLbl(null))}
                </span>
              </div>
            ))}
          </div>
        </div>
        <footer className="m8-modale__pied st-cmp__pied">
          <span className="st-cmp__note">
            {n >= CMP_MAX ? tr("{n} stations maximum.", { n: CMP_MAX }) : ""}
          </span>
          <button type="button" className="m8-bouton-encre" onClick={onCta} disabled={!pickId}>
            {cta}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
