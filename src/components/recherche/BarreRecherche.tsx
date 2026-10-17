/**
 * La barre de recherche en pilule (Skitrack App.dc.html:128-190, et la même
 * dans la fenêtre « Modifier la recherche », 51-113) : cinq segments,
 * Destination, Altitude, Arrivée, Départ, Voyageurs, et la loupe ronde. Chaque
 * segment ouvre son panneau sous la barre : suggestions, trois fourchettes
 * d'altitude et leurs repères, calendrier sur deux mois, compteurs.
 *
 * Le texte du champ et ce qu'une suggestion pose sont confiés à l'appelant :
 * l'accueil écrit dans le magasin du parcours, la fenêtre de modification
 * garde son brouillon jusqu'à « Rechercher ». Altitude, dates et voyageurs
 * s'écrivent dans leurs magasins dans les deux cas ; la fenêtre les restaure
 * si on la ferme sans chercher.
 */

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Pastille, Trace } from "@/components/maquette";
import { Calendrier } from "@/components/v7/Calendrier";
import { Compteur } from "@/components/v7/Compteur";
import { FourchetteRecherche } from "@/components/v7/FourchettesRecherche";
import { usePlage } from "@/components/v7/plage";
import { foldName } from "@/lib/carte";
import { SEUILS } from "@/lib/filtres";
import { aTraduire, tr, trN } from "@/lib/i18n";
import { departLbl, dm, useParcours, useSejour } from "@/lib/parcours";
import { plageCourte } from "@/lib/plage";
import type { Station } from "@/lib/stations";
import { AGE_ENFANT } from "@/lib/stay/party";
import { useCommunes } from "./communes";
import { useEurope } from "./europe";
import { suggestions, voyageursLbl } from "./outils";

export type PanneauRecherche = null | "q" | "alt" | "dates" | "guests";

/** Les trois fourchettes d'altitude, tirées de `SEUILS` (`filtres.ts`). */
const ALT_RANGES = SEUILS.filter((r): r is (typeof SEUILS)[number] & { k: "v" | "lo" | "hi" } =>
  r.k === "v" || r.k === "lo" || r.k === "hi",
);

/** Un repère pose « au moins » : la borne basse, la haute au bout de l'échelle. */
const ALT_PRESETS: { label: string; p: Partial<Record<"v" | "lo" | "hi", number>> }[] = [
  { label: aTraduire("Village 1 800 m"), p: { v: 1800 } },
  { label: aTraduire("Sommet 3 000 m"), p: { hi: 3000 } },
  { label: aTraduire("Bas des pistes 1 500 m"), p: { lo: 1500 } },
];

const LOUPE = "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-3.5-3.5";

export function BarreRecherche({
  idBase,
  q,
  onQ,
  onStation,
  onMassif,
  onRechercher,
  labelRecherche,
  hp,
  setHp,
  fermerAEchap = true,
  autoFocus = false,
}: {
  /** Préfixe des identifiants du DOM (liste de suggestions). */
  idBase: string;
  /** Le texte du champ Destination. */
  q: string;
  onQ: (texte: string) => void;
  onStation: (s: Station) => void;
  onMassif: (m: string) => void;
  onRechercher: () => void;
  /** Ce que la loupe fera, pour les lecteurs d'écran. */
  labelRecherche: string;
  hp: PanneauRecherche;
  setHp: (p: PanneauRecherche) => void;
  /** Échap ferme le panneau ouvert. Faux quand l'hôte ferme lui-même tout. */
  fermerAEchap?: boolean;
  autoFocus?: boolean;
}) {
  const F = useParcours((s) => s.filters);
  const setFilters = useParcours((s) => s.setFilters);
  const { checkIn, checkOut, trav, rooms, nights } = useSejour();
  const plage = usePlage();
  const [iSugg, setISugg] = useState(-1);

  const ql = foldName(q);
  // Les communes arrivent quand le champ Destination s'ouvre ; `communes`
  // relance le calcul à leur arrivée.
  const communes = useCommunes(hp === "q");
  const europe = useEurope(hp === "q");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sugg = useMemo(() => (hp === "q" ? suggestions(ql) : []), [ql, hp, communes, europe]);

  // Quitter le calendrier oublie une arrivée posée sans départ.
  const resetPlage = plage.reset;
  useEffect(() => {
    if (hp !== "dates") resetPlage();
    // `reset` change d'identité à chaque rendu ; seul le panneau compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hp]);

  // Échap ferme le panneau ouvert, d'où que vienne le focus.
  useEffect(() => {
    if (!fermerAEchap || hp == null) return;
    const echap = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setHp(null);
    };
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [fermerAEchap, hp, setHp]);

  const ouvrirArrivee = () => {
    plage.ouvrirArrivee();
    setHp("dates");
  };
  const ouvrirDepart = () => {
    plage.ouvrirDepart();
    setHp("dates");
  };

  const choisir = (i: number) => {
    const sg = sugg[i];
    if (!sg) return;
    if (sg.type === "massif") onMassif(sg.massif);
    else onStation(sg.station);
    setISugg(-1);
    setHp(null);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && sugg.length) {
      e.preventDefault();
      setISugg((i) => (i + 1) % sugg.length);
      return;
    }
    if (e.key === "ArrowUp" && sugg.length) {
      e.preventDefault();
      setISugg((i) => (i <= 0 ? sugg.length - 1 : i - 1));
      return;
    }
    if (e.key !== "Enter" || e.repeat) return;
    e.preventDefault();
    // Entrée sur une suggestion désignée la choisit ; sinon elle cherche.
    if (iSugg >= 0 && sugg[iSugg]) {
      choisir(iSugg);
      return;
    }
    onRechercher();
  };

  const altActive = ALT_RANGES.filter((r) => F[r.k] != null);
  const altSegLbl = altActive.length
    ? altActive.map((r) => `${tr(r.court)} ${plageCourte(F[r.k], r.b)}`).join(" · ") + " m"
    : tr("Indifférent");
  const repere = (k: "v" | "lo" | "hi", v: number) =>
    [v, ALT_RANGES.find((r) => r.k === k)!.b[1]] as const;

  const seg = (on: boolean, extra = "") => `acc-seg${extra}${on ? " acc-seg--on" : ""}`;
  const idSugg = `${idBase}-sugg`;

  return (
    <div className="acc-hote">
      <div className={`acc-barre${hp ? " acc-barre--ouverte" : ""}`}>
        <label className={seg(hp === "q", " acc-seg--q")} onClick={() => setHp("q")}>
          <span className="acc-seg__k">{tr("Destination")}</span>
          <input
            className="acc-seg__champ"
            value={q}
            onChange={(e) => {
              onQ(e.target.value);
              setHp("q");
              setISugg(-1);
            }}
            onKeyDown={onKey}
            onFocus={() => setHp("q")}
            placeholder={tr("Pays, massif, station")}
            autoComplete="off"
            // L'ouverture de la fenêtre de modification pose le curseur ici.
            autoFocus={autoFocus}
            role="combobox"
            aria-expanded={hp === "q" && sugg.length > 0}
            aria-controls={idSugg}
            aria-autocomplete="list"
            aria-activedescendant={iSugg >= 0 ? `${idBase}-${sugg[iSugg]?.key}` : undefined}
          />
        </label>
        <button type="button" className={seg(hp === "alt", " acc-seg--alt")} onClick={() => setHp("alt")}>
          <span className="acc-seg__k">{tr("Altitude")}</span>
          <span className={`acc-seg__v${altActive.length ? "" : " acc-seg__v--vide"}`}>{altSegLbl}</span>
        </button>
        <button
          type="button"
          className={seg(hp === "dates" && plage.phase === "from", " acc-seg--date")}
          onClick={ouvrirArrivee}
        >
          <span className="acc-seg__k">{tr("Arrivée")}</span>
          <span className="acc-seg__v">{dm(checkIn)}</span>
        </button>
        <button
          type="button"
          className={seg(hp === "dates" && plage.phase === "to", " acc-seg--date")}
          onClick={ouvrirDepart}
        >
          <span className="acc-seg__k">{tr("Départ")}</span>
          <span className="acc-seg__v">{dm(checkOut)}</span>
        </button>
        <div className={seg(hp === "guests", " acc-seg--fin")}>
          <button type="button" className="acc-seg__nu" onClick={() => setHp("guests")}>
            <span className="acc-seg__k">{tr("Voyageurs")}</span>
            <span className="acc-seg__v">{voyageursLbl(trav, rooms)}</span>
          </button>
          {/* La loupe ne se désactive jamais : une plage de dates inversée se
              répare à la recherche au lieu de barrer la route. */}
          <button type="button" className="acc-go" aria-label={labelRecherche} onClick={onRechercher}>
            <Trace d={LOUPE} taille={17} epaisseur={2.8} />
            <span className="acc-go__lbl">{tr("Rechercher")}</span>
          </button>
        </div>
      </div>

      {hp === "q" ? (
        <div className="acc-pop acc-pop--q" id={idSugg} role="listbox" aria-label={tr("Suggestions")}>
          {sugg.length ? (
            <>
              <span className="acc-pop__label">{tr("Suggestions")}</span>
              {sugg.map((sg, i) => (
                <button
                  key={sg.key}
                  id={`${idBase}-${sg.key}`}
                  type="button"
                  role="option"
                  aria-selected={i === iSugg}
                  className={`acc-sugg${i === iSugg ? " acc-sugg--vive" : ""}`}
                  onMouseEnter={() => setISugg(i)}
                  onClick={() => choisir(i)}
                >
                  <span className="acc-sugg__ic">
                    <Trace d={sg.icone} taille={18} epaisseur={1.6} />
                  </span>
                  <span className="acc-sugg__txt">
                    <b>{sg.label}</b>
                    <span>{sg.kind}</span>
                  </span>
                </button>
              ))}
            </>
          ) : (
            <span className="acc-pop__vide">
              {tr("Aucune station ni massif pour « {texte} ».", { texte: q.trim() })}
            </span>
          )}
        </div>
      ) : null}

      {hp === "alt" ? (
        <div className="acc-pop acc-pop--alt">
          <div className="acc-pop__tete">
            <b>{tr("Altitude")}</b>
            <span>{tr("Réglez seulement ce qui compte pour vous.")}</span>
          </div>
          <div className="acc-fourchettes">
            {ALT_RANGES.map((r) => (
              <FourchetteRecherche key={r.k} r={r} />
            ))}
          </div>
          <div className="acc-reperes">
            {ALT_PRESETS.map((ap) => {
              const entrees = Object.entries(ap.p) as ["v" | "lo" | "hi", number][];
              const on = entrees.every(([k, v]) => {
                const pl = F[k];
                const [lo, hi] = repere(k, v);
                return pl != null && pl[0] === lo && pl[1] === hi;
              });
              return (
                <Pastille
                  key={ap.label}
                  on={on}
                  onClick={() =>
                    setFilters(
                      Object.fromEntries(entrees.map(([k, v]) => [k, on ? null : repere(k, v)])) as Partial<
                        typeof F
                      >,
                    )
                  }
                >
                  {tr(ap.label)}
                </Pastille>
              );
            })}
          </div>
          <div className="acc-pop__pied">
            <button
              type="button"
              className="acc-lien"
              onClick={() => setFilters({ v: null, lo: null, hi: null })}
            >
              {tr("Réinitialiser")}
            </button>
            <button type="button" className="acc-encre" onClick={ouvrirArrivee}>
              {tr("Choisir les dates")}
            </button>
          </div>
        </div>
      ) : null}

      {hp === "dates" ? (
        <div className="acc-pop acc-pop--dates">
          <Calendrier
            plage={plage}
            onPose={() => setHp("guests")}
            pied={
              <span className="acc-cal__recap">
                {trN(nights, "{n} nuit", "{n} nuits")} · {departLbl(checkIn)} → {departLbl(checkOut)}
              </span>
            }
          />
        </div>
      ) : null}

      {hp === "guests" ? (
        <div className="acc-pop acc-pop--guests">
          <Compteur k="trav" titre={tr("Voyageurs")} regle={tr("1 à 20 personnes")} />
          {/* Séparés parce que le coût des forfaits comptait tout le monde au
              tarif adulte, tarif enfant relevé ou non. */}
          <Compteur k="enfants" titre={tr("dont enfants")} regle={tr(AGE_ENFANT)} />
          <Compteur k="rooms" titre={tr("Chambres")} regle={tr("0 pour accepter un studio")} />
        </div>
      ) : null}
    </div>
  );
}
