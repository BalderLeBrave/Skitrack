/**
 * La fenêtre « Filtres » de Logements (Skitrack App.dc.html:394-442) : type de
 * logement en tuiles, fourchette de prix sur son histogramme, chambres et
 * lits, distance aux remontées, périmètre de recherche, équipements, sources,
 * note des avis et fiabilité des données.
 *
 * Elle ne filtre rien elle-même : l'écran lui passe chaque réglage, sa valeur
 * et sa façon de le poser. Les filtres s'appliquent en direct ; le bouton du
 * pied dit combien de logements restent.
 */

import {
  Histogramme,
  LigneInterrupteur,
  ModaleFiltres,
  Onglets,
  Pastille,
  SectionFiltre,
  Trace,
} from "@/components/maquette";
import type { ReactNode } from "react";
import { Fourchette } from "@/components/v7/Fourchette";
import { tr, trN } from "@/lib/i18n";
import type { Echelle, Plage } from "@/lib/plage";

/** Une fourchette prête à rendre. */
export type RegleFourchette = {
  lbl: string;
  bornes: Echelle;
  valeur: readonly [number, number] | null;
  pas: number;
  unite: string;
  resume: string;
  onPoser: (which: 0 | 1, v: number, exact: boolean) => void;
};

export type ModePrix = "budget" | "pp";

type Choix<K> = { key: K; label: string; on: boolean; n?: number; icone?: string; title?: string };

function Tuile({
  on,
  icone,
  label,
  onClick,
  compte,
  variante,
}: {
  on: boolean;
  icone: string;
  label: string;
  onClick: () => void;
  compte?: number;
  variante: "type" | "equip";
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`lg-tuile lg-tuile--${variante}${on ? " lg-tuile--on" : ""}`}
      onClick={onClick}
    >
      <Trace d={icone} taille={variante === "type" ? 26 : 20} epaisseur={1.5} />
      <span className="lg-tuile__lbl">{label}</span>
      {compte != null ? <span className="lg-tuile__n">{compte}</span> : null}
    </button>
  );
}

export function ModaleFiltresLogements({
  onFermer,
  onEffacer,
  nResultat,
  types,
  onType,
  modePrix,
  onModePrix,
  prixValeurs,
  prixEchelle,
  prixPlage,
  fourchettePrix,
  fourchettesTaille,
  lits,
  onLits,
  paliers,
  onPalier,
  fourchetteDist,
  rayons,
  onRayon,
  aideRayon,
  equipements,
  onEquipement,
  sources,
  onSource,
  notes,
  onNote,
  fiabilite,
  onFiabilite,
}: {
  onFermer: () => void;
  onEffacer: () => void;
  /** Le nombre de logements qui restent, pour le bouton du pied. */
  nResultat: number;
  types: readonly Choix<string>[];
  onType: (k: string) => void;
  modePrix: ModePrix;
  onModePrix: (m: ModePrix) => void;
  /** Les prix des annonces que les autres filtres laissent, dans l'unité du mode. */
  prixValeurs: readonly number[];
  prixEchelle: Echelle;
  prixPlage: Plage;
  /** La fourchette du mode de prix choisi (budget partagé, ou prix par personne). */
  fourchettePrix: ReactNode;
  /** Capacité puis chambres. */
  fourchettesTaille: readonly RegleFourchette[];
  lits: readonly Choix<number>[];
  onLits: (n: number) => void;
  paliers: readonly Choix<number | null>[];
  onPalier: (m: number | null) => void;
  fourchetteDist: RegleFourchette;
  rayons: readonly Choix<number>[];
  onRayon: (km: number) => void;
  /** Infobulle de « Distance au centre ». */
  aideRayon: string;
  equipements: readonly Choix<string>[];
  onEquipement: (id: string) => void;
  sources: readonly Choix<string>[];
  onSource: (src: string) => void;
  notes: readonly Choix<number | null>[];
  onNote: (seuil: number | null) => void;
  fiabilite: readonly Choix<string>[];
  onFiabilite: (k: string) => void;
}) {
  const fourchette = (r: RegleFourchette) => (
    <Fourchette
      key={r.lbl}
      lbl={r.lbl}
      bornes={r.bornes}
      valeur={r.valeur}
      pas={r.pas}
      unite={r.unite}
      resume={r.resume}
      onPoser={r.onPoser}
    />
  );
  return (
    <ModaleFiltres
      onFermer={onFermer}
      onEffacer={onEffacer}
      cta={trN(nResultat, "Afficher {n} logement", "Afficher {n} logements")}
    >
      <SectionFiltre titre={tr("Type de logement")} ecart={18}>
        <div className="lg-tuiles lg-tuiles--types">
          {types.map((t) => (
            <Tuile
              key={t.key}
              variante="type"
              on={t.on}
              icone={t.icone ?? ""}
              label={t.label}
              onClick={() => onType(t.key)}
            />
          ))}
        </div>
      </SectionFiltre>

      <SectionFiltre
        titre={tr("Fourchette de prix")}
        ecart={16}
        aside={
          <Onglets<ModePrix>
            ariaLabel={tr("Prix")}
            items={[
              { key: "budget", label: tr("Séjour") },
              { key: "pp", label: tr("Par personne") },
            ]}
            valeur={modePrix}
            onChoisir={onModePrix}
          />
        }
      >
        <Histogramme valeurs={prixValeurs} bornes={prixEchelle} plage={prixPlage} bins={32} hauteur={72} />
        {fourchettePrix}
      </SectionFiltre>

      <SectionFiltre titre={tr("Chambres et lits")}>
        <div className="lg-deux">{fourchettesTaille.map(fourchette)}</div>
        <div className="lg-groupe">
          <span className="lg-groupe__lbl">{tr("Lits")}</span>
          <div className="lg-pastilles">
            {lits.map((b) => (
              <Pastille key={b.key} on={b.on} onClick={() => onLits(b.key)} className="lg-pastille--lit">
                {b.label}
              </Pastille>
            ))}
          </div>
        </div>
      </SectionFiltre>

      <SectionFiltre titre={tr("Distance aux remontées")} ecart={18}>
        <div className="lg-pastilles">
          {paliers.map((p) => (
            <Pastille key={String(p.key)} on={p.on} onClick={() => onPalier(p.key)}>
              {p.label}
            </Pastille>
          ))}
        </div>
        {fourchette(fourchetteDist)}
      </SectionFiltre>

      <SectionFiltre titre={tr("Périmètre de recherche")} ecart={14}>
        <span className="lg-groupe__lbl" title={aideRayon}>
          {tr("Distance au centre")}
        </span>
        <div className="lg-pastilles">
          {rayons.map((r) => (
            <Pastille key={r.key} on={r.on} onClick={() => onRayon(r.key)}>
              {r.label}
            </Pastille>
          ))}
        </div>
      </SectionFiltre>

      {equipements.length ? (
        <SectionFiltre titre={tr("Équipements")} ecart={18} infobulle={tr("Listés par la source")}>
          <div className="lg-tuiles lg-tuiles--equip">
            {equipements.map((e) => (
              <Tuile
                key={e.key}
                variante="equip"
                on={e.on}
                icone={e.icone ?? ""}
                label={e.label}
                compte={e.n}
                onClick={() => onEquipement(e.key)}
              />
            ))}
          </div>
        </SectionFiltre>
      ) : null}

      <SectionFiltre titre={tr("Sources")} ecart={18}>
        <div className="lg-pastilles">
          {sources.map((s) => (
            <Pastille key={s.key} on={s.on} onClick={() => onSource(s.key)} compte={s.n}>
              {s.label}
            </Pastille>
          ))}
        </div>
      </SectionFiltre>

      <SectionFiltre titre={tr("Note des avis")} ecart={18}>
        <div className="lg-pastilles">
          {notes.map((p) => (
            <Pastille key={String(p.key)} on={p.on} onClick={() => onNote(p.key)} compte={p.n}>
              {p.label}
            </Pastille>
          ))}
        </div>
      </SectionFiltre>

      <SectionFiltre titre={tr("Fiabilité des données")} ecart={4} className="lg-fiabilite">
        {fiabilite.map((o) => (
          <LigneInterrupteur
            key={o.key}
            label={o.label}
            sous={o.n != null ? trN(o.n, "{n} logement", "{n} logements") : undefined}
            on={o.on}
            onToggle={() => onFiabilite(o.key)}
          />
        ))}
      </SectionFiltre>
    </ModaleFiltres>
  );
}
