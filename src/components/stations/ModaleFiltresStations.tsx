/**
 * La fenêtre « Filtres » des stations (Skitrack App.dc.html:299-329) :
 * Altitude (trois fourchettes et trois raccourcis), Domaine (km, massif,
 * domaine skiable), Forfait adulte du séjour (histogramme et fourchette),
 * Répartition par couleur (unité, quatre fourchettes). Pied : « Tout effacer »
 * et « Afficher N stations ».
 *
 * Elle ne tient aucun état : chaque commande écrit dans `useParcours`, et les
 * critères s'appliquent en direct (`filtres.ts`), comme dans l'ancien panneau.
 * L'accueil peut la poser telle quelle, avec `onAfficher` qui mène à l'écran
 * Stations.
 */

import { useMemo } from "react";
import { Histogramme, ModaleFiltres, Onglets, Pastille, SectionFiltre } from "@/components/maquette";
import { FourchetteCouleur, FourchetteRecherche } from "@/components/v7/FourchettesRecherche";
import { usePrixStations } from "@/components/v7/usePrixForfait";
import { domaineNomme } from "@/lib/classeur";
import { memeDevise } from "@/lib/devises";
import { appliquer, DEVISE_SEUIL, SEUILS, UNITES, usePredicats } from "@/lib/filtres";
import { prixAdulteSejour } from "@/lib/forfaits/prixStations";
import { COLS, ECHELLES, useParcours, type ColorUnit } from "@/lib/parcours";
import { STATIONS } from "@/lib/stations";
import { aTraduire, tr, trN } from "@/lib/i18n";

/** Les raccourcis d'altitude (`ALT_PRESETS`) : « au moins » cette valeur. */
const RACCOURCIS_ALTITUDE: { label: string; k: "v" | "hi" | "lo"; v: number }[] = [
  { label: aTraduire("Village 1 800 m"), k: "v", v: 1800 },
  { label: aTraduire("Sommet 3 000 m"), k: "hi", v: 3000 },
  { label: aTraduire("Bas des pistes 1 500 m"), k: "lo", v: 1500 },
];

const SEUIL = (k: string) => SEUILS.find((r) => r.k === k)!;

export function ModaleFiltresStations({
  onFermer,
  onAfficher,
}: {
  /** Croix, Échap, fond. */
  onFermer: () => void;
  /** « Afficher N stations » ; défaut : ferme la fenêtre. */
  onAfficher?: () => void;
}) {
  const P = useParcours();
  const F = P.filters;
  const preds = usePredicats();
  const { ctx } = usePrixStations();
  const n = useMemo(() => appliquer(STATIONS, preds).length, [preds]);

  const massifs = useMemo(() => [...new Set(STATIONS.map((s) => s.massif))].sort(), []);
  const doms = useMemo(() => {
    const pool = P.massif ? STATIONS.filter((s) => s.massif === P.massif) : STATIONS;
    // « domaine non nommé (OpenStreetMap) » ne désigne pas un domaine.
    return [...new Set(pool.map((s) => s.domain).filter(domaineNomme))].sort((a, b) => a.localeCompare(b, "fr"));
  }, [P.massif]);

  /** Les forfaits du séjour, en euros : ce que la fourchette compare. */
  const prix = useMemo(
    () =>
      STATIONS.flatMap((s) => {
        const r = prixAdulteSejour(s.id, ctx);
        return r && memeDevise(r.devise, DEVISE_SEUIL) ? [r.prix] : [];
      }),
    [ctx],
  );

  const unites = (Object.keys(UNITES) as ColorUnit[]).map((u) => ({ key: u, label: tr(UNITES[u].lbl) }));

  return (
    <ModaleFiltres
      onFermer={onFermer}
      onEffacer={() => P.resetFilters()}
      cta={trN(n, "Afficher {n} station", "Afficher {n} stations")}
      onCta={onAfficher ?? onFermer}
    >
      <SectionFiltre titre={tr("Altitude")}>
        <div className="st-filtres__grille st-filtres__grille--200">
          {SEUILS.slice(0, 3).map((r) => (
            <FourchetteRecherche key={r.k} r={r} />
          ))}
        </div>
        <div className="st-filtres__puces">
          {RACCOURCIS_ALTITUDE.map((a) => {
            const b1 = ECHELLES[a.k].b[1];
            const pl = F[a.k];
            const on = !!pl && pl[0] === a.v && pl[1] === b1;
            return (
              <Pastille key={a.k} on={on} onClick={() => P.setFilters({ [a.k]: on ? null : [a.v, b1] })}>
                {tr(a.label)}
              </Pastille>
            );
          })}
        </div>
      </SectionFiltre>

      <SectionFiltre titre={tr("Domaine")}>
        <FourchetteRecherche r={SEUIL("km")} />
        <div className="st-filtres__grille st-filtres__grille--220">
          <label className="st-select-champ">
            <span>{tr("Massif")}</span>
            <select
              value={P.massif ?? ""}
              onChange={(e) => {
                P.setMassif(e.target.value || null);
                P.setFilters({ dom: "" });
              }}
            >
              <option value="">{tr("Tous")}</option>
              {massifs.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <Chevron />
          </label>
          <label className="st-select-champ">
            <span>{tr("Domaine skiable")}</span>
            <select value={F.dom} onChange={(e) => P.setFilters({ dom: e.target.value })}>
              <option value="">{tr("Tous")}</option>
              <option value="__none">{tr("Non renseigné")}</option>
              {doms.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <Chevron />
          </label>
        </div>
      </SectionFiltre>

      <SectionFiltre titre={tr("Forfait adulte du séjour")} ecart={16}>
        <div className="st-filtres__hist">
          <Histogramme valeurs={prix} bornes={ECHELLES.pass.b} plage={F.pass} bins={20} hauteur={64} />
        </div>
        <FourchetteRecherche r={SEUIL("pass")} />
      </SectionFiltre>

      <SectionFiltre
        titre={tr("Répartition par couleur")}
        aside={<Onglets items={unites} valeur={P.unit} onChoisir={P.setUnit} ariaLabel={tr("Unité")} />}
      >
        <div className="st-filtres__grille st-filtres__grille--260">
          {COLS.map((c) => (
            <FourchetteCouleur key={c.key} c={c.key} />
          ))}
        </div>
      </SectionFiltre>
    </ModaleFiltres>
  );
}

export function Chevron() {
  return (
    <svg
      className="st-chevron"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
