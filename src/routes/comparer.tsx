/** Comparer – maquette v7 (`SKITRACK v7 - App.dc.html`, bloc COMPARER).
 *
 *  En tête, « Étape 1 · Stations » sur une ligne, puis le bandeau figé :
 *  recherche (nom, domaine skiable, massif), Filtres et Tri, collés sous la
 *  barre du haut pendant tout le défilement. Vient ensuite la comparaison —
 *  stations en colonnes, critères en lignes, la meilleure valeur en gras, une
 *  colonne cochée qui mène aux logements — mais seulement à partir de la
 *  première case cochée. Puis les jetons actifs, et deux colonnes : les cartes
 *  de station, la carte des épingles.
 *
 *  Les six raccourcis vivent dans le panneau Filtres, en tête : sur la ligne,
 *  ils prenaient toute la largeur pour des critères que le panneau porte déjà.
 *
 *  Données : `STATIONS` du dépôt, champs d'échelle domaine joints tels quels. */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { useGo } from "@/components/v6/go";
import { CarteEpingles } from "@/components/v7/CarteEpingles";
import { epingleStation, ETAGE } from "@/components/v7/epingle";
import { useFermeturePanneau } from "@/components/v7/fermeture";
import { partagerParBornes, type Bornes } from "@/lib/carte";
import { appliquer, critereBloquant, SEUILS, UNITES, usePredicats } from "@/lib/filtres";
import { CarteStation } from "@/components/v7/CarteStation";
import { mixLbl, PartPistes } from "@/components/v7/PartPistes";
import { Vide } from "@/components/v7/Vide";
import {
  CMP_MAX,
  COLS,
  eurN,
  fmt,
  useParcours,
  type ChipKey,
  type ColorUnit,
  type SortKey,
} from "@/lib/parcours";
import { STATIONS, stationById, type Station } from "@/lib/stations";
import {
  altLbl,
  aStation,
  CHIPS,
  forfaitOf,
  glacier,
  kmLbl,
  liftsLbl,
  linked,
  maxM,
  minM,
  sub,
  villageLbl,
  villageM,
} from "@/lib/v7";

export const Route = createFileRoute("/comparer")({ component: Comparer });

const SORTS: { key: SortKey; label: string }[] = [
  { key: "km", label: "Tri : km de pistes" },
  { key: "hi", label: "Tri : sommet" },
  { key: "lo", label: "Tri : bas des pistes" },
  { key: "v", label: "Tri : altitude village" },
  { key: "pass", label: "Tri : forfait 6 j" },
  { key: "n", label: "Tri : nom" },
];

function sortVal(s: Station, k: SortKey): number {
  if (k === "km") return s.pistesKm ?? -1;
  if (k === "hi") return maxM(s) ?? -1;
  if (k === "lo") return minM(s) ?? -1;
  if (k === "v") return villageM(s) ?? -1;
  return 0;
}

/** `crit` de la maquette : libellé, texte, valeur comparable, note d'échelle. */
type Crit = {
  label: string;
  txt: (s: Station) => string | null;
  num: ((s: Station) => number | null) | null;
  note: string | null;
};

const CRIT: Crit[] = [
  { label: "Altitude des pistes", txt: (s) => altLbl(s), num: (s) => maxM(s), note: null },
  { label: "Village", txt: (s) => villageLbl(s), num: (s) => villageM(s), note: null },
  { label: "Km de pistes", txt: (s) => kmLbl(s), num: (s) => s.pistesKm, note: "valeur du domaine" },
  { label: "Remontées", txt: (s) => liftsLbl(s), num: (s) => s.lifts, note: "valeur du domaine" },
  {
    label: "Forfait 6 j adulte",
    txt: (s) => eurN(forfaitOf(s)?.j6),
    num: (s) => (forfaitOf(s)?.j6 != null ? -(forfaitOf(s)!.j6 as number) : null),
    note: "relevé sur le site du domaine",
  },
  { label: "Glacier", txt: (s) => (glacier(s) ? "Oui" : "Non"), num: null, note: null },
  { label: "Forfait relié", txt: (s) => (linked(s) ? s.domain : null), num: null, note: null },
  {
    label: "Massif · département",
    txt: (s) => [s.massif, s.dept].filter(Boolean).join(" · "),
    num: null,
    note: null,
  },
];

/** Ce que la liste et la carte portent au plus. Au-delà, une colonne de
 *  vignettes ne se parcourt plus ; le compte restant est annoncé. */
const LISTE_MAX = 60;

/** L'aide du champ de recherche, en infobulle : elle tenait sous le champ et
 *  poussait le bandeau d'une ligne entière. */
const RECHERCHE_AIDE =
  "Nom de la station, domaine skiable (Les 3 Vallées, Paradiski) ou massif (Vanoise, Vosges). La liste et la carte suivent.";

function Comparer() {
  const go = useGo();
  const P = useParcours();
  const F = P.filters;
  const all = STATIONS;
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Le cadre visible de la carte. Il compte toujours : la liste, le compteur et
  // les pastilles rendues disent la même chose que ce qu'on voit. Une case
  // « Rechercher quand je déplace la carte » le gouvernait, décochée par
  // défaut ; zoomer sur trois stations laissait alors le compteur à 320.
  const [bornes, setBornes] = useState<Bornes | null>(null);
  // Un compteur de recadrages : il entre dans la clé `cadrage`, donc le lien
  // « Revoir les N résultats » oublie le cadre **et** redemande à la carte de
  // se poser sur l'ensemble. Sans lui, la liste revenait mais la carte restait
  // zoomée là où l'utilisateur l'avait laissée.
  const [recadrages, setRecadrages] = useState(0);
  const revoirTout = () => {
    setBornes(null);
    setRecadrages((n) => n + 1);
  };
  // La station que la carte désigne, et que la liste éclaire en retour.
  const [actifCarte, setActifCarte] = useState<string | null>(null);
  const panneau = useRef<HTMLDivElement>(null);
  // L'ancre porte le bouton, le tri et le panneau : un clic dedans le laisse
  // ouvert, un clic dehors le ferme.
  const ancre = useRef<HTMLDivElement>(null);
  useFermeturePanneau(filtersOpen, () => setFiltersOpen(false), ancre);
  // La hauteur de la barre figée, publiée en variable CSS sur le `main` : la
  // carte se cale exactement dessous. Une valeur écrite en dur se décalait dès
  // que le champ de recherche passait à la ligne.
  const barre = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = barre.current;
    const cible = el?.closest("main");
    if (!el || !cible) return;
    const mesurer = () =>
      cible.style.setProperty("--barre-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const massifs = useMemo(() => [...new Set(all.map((s) => s.massif))].sort(), [all]);
  const domPool = P.massif ? all.filter((s) => s.massif === P.massif) : all;
  const doms = useMemo(
    () =>
      [...new Set(domPool.map((s) => s.domain).filter((d): d is string => !!d))].sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [domPool],
  );

  /* ---------- Prédicats actifs ----------
     Les mêmes que l'accueil, écrits une seule fois (`filtres.ts`). */
  const preds = usePredicats();

  const visible = useMemo(() => appliquer(all, preds), [all, preds]);
  const sorted = useMemo(
    () =>
      [...visible].sort((a, b) =>
        P.sortKey === "n"
          ? a.name.localeCompare(b.name, "fr")
          : P.sortKey === "pass"
            ? (forfaitOf(a)?.j6 ?? 9e9) - (forfaitOf(b)?.j6 ?? 9e9)
            : sortVal(b, P.sortKey) - sortVal(a, P.sortKey),
      ),
    [visible, P.sortKey],
  );

  /* ---------- Le cadre visible : une seule source pour les deux ----------
     La liste et le compte de la légende dérivent tous deux de `dansCadre`. La
     légende annonçait `list.length`, borné : elle disait « 40 épingles »
     quelles que soient les trois cents posées à côté. */
  const parCadre = useMemo(() => partagerParBornes(sorted, bornes), [sorted, bornes]);
  const dansCadre = parCadre.visibles;
  const list = dansCadre.slice(0, LISTE_MAX);

  /* ---------- État vide : quel filtre bloque ---------- */
  const bloquant = !visible.length && preds.length ? critereBloquant(all, preds) : null;
  const empty: { title: string; hint: string; fix: (() => void) | null } | null = visible.length
    ? null
    : preds.length
      ? bloquant
        ? {
            title: `Le filtre « ${bloquant.pred.label} » ne laisse aucune station`,
            hint: `Sans lui, ${bloquant.restantes} station${bloquant.restantes > 1 ? "s" : ""} rest${bloquant.restantes > 1 ? "ent" : "e"} avec les autres critères.`,
            fix: bloquant.pred.retirer,
          }
        : {
            title: "Aucune station ne remplit ces critères",
            hint: `Le référentiel couvre ${all.length} stations françaises. Retirer un seul filtre ne suffit pas : réinitialisez.`,
            fix: null,
          }
      : null;

  /* ---------- Comparaison ---------- */
  const cmp = P.cmp.map((id) => stationById(id)).filter((s): s is Station => !!s);
  const pickId = cmp.some((s) => s.id === P.pick) ? P.pick : (cmp[0]?.id ?? null);
  const pickName = pickId ? stationById(pickId)?.name : "";
  const retain = (id: string) => {
    P.retain(id);
    void go("lodging");
  };

  const chips = (Object.keys(CHIPS) as ChipKey[]).map((k) => ({
    k,
    label: CHIPS[k].label,
    on: !!F.chips[k],
  }));
  const seeLbl = visible.length
    ? `Voir ${visible.length} station${visible.length > 1 ? "s" : ""}`
    : "Aucune station : assouplir";

  /**
   * **La carte porte toutes les stations du cadre, la liste en montre quarante.**
   *
   * La liste est bornée parce qu'une colonne de vignettes ne se parcourt pas
   * au-delà ; une carte, si. Les épingles suivaient pourtant la même tranche,
   * si bien que trois cent vingt stations sans filtre n'en montraient que
   * quarante, toutes alpines puisque le tri par défaut est le kilométrage.
   *
   * Toutes les pastilles sont identiques : elles ne portent ni nom, ni prix, ni
   * altitude, et leur taille ne dépend de rien. Ce que chacune désigne se lit
   * dans la fiche qui s'ouvre au survol, au focus clavier, ou au clic.
   */
  const marqueurs = useMemo(
    () =>
      // Toutes les stations du résultat, pas la seule tranche de la liste : une
      // carte se parcourt au-delà de soixante vignettes, et le désencombrement
      // se charge de ne montrer que les noms qui tiennent.
      sorted.map((s, rang) => {
        const comparee = P.cmp.includes(s.id);
        return {
          id: s.id,
          lat: s.lat,
          lon: s.lon,
          nom: s.name,
          epingle: epingleStation(s.name, comparee ? "comparee" : "normale"),
          zIndex: comparee ? ETAGE.comparee : ETAGE.normale,
          etiquette: s.name,
          // Qui garde son nom quand deux se chevauchent : les stations de la
          // comparaison d'abord, puis l'ordre du tri.
          priorite: comparee ? rang - sorted.length : rang,
        };
      }),
    // Le contenu change quand les identifiants ou la comparaison changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted.map((s) => s.id).join(","), P.cmp.join(",")],
  );

  /** La clé de recadrage suit le **résultat des filtres**, pas le contenu du
   *  cadre : calculée sur le cadre, recadrer aurait changé la liste, qui aurait
   *  changé la clé, qui aurait recadré — sans fin. */
  const cadrage = useMemo(
    () => `${recadrages}#${sorted.map((s) => s.id).join(",")}`,
    [sorted, recadrages],
  );

  return (
    <Coquille>
      <main className="v7main v7main--serre" id="s-compare" data-screen-label="1 Comparer">
        <header className="v7tete v7tete--compacte">
          <span className="v7surtitre">Étape 1</span>
          <h1>Stations</h1>
        </header>

        {/* Recherche, Filtres et Tri sur une ligne, collée sous la barre du
            haut : ils restent atteignables tout le long du défilement. */}
        <section className="barre7" ref={barre}>
          <div className="barre7__ligne">
            <label className="rech7">
              <Icon name="loupe" taille={16} />
              <input
                value={P.q}
                onChange={(e) => P.setQ(e.target.value)}
                placeholder="Station, domaine skiable ou massif"
                title={RECHERCHE_AIDE}
                aria-label="Rechercher une station"
              />
              {P.q ? (
                <button
                  type="button"
                  className="rech7__effacer"
                  title="Effacer la recherche"
                  aria-label="Effacer la recherche"
                  onClick={() => P.setQ("")}
                >
                  <Icon name="croix" taille={11} />
                </button>
              ) : null}
            </label>
            <div className="filtres7__ancre" ref={ancre}>
              <button
                type="button"
                data-panel-btn="filters"
                className={`puce puce--encre${filtersOpen ? " puce--on" : ""}`}
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((v) => !v)}
              >
                <Icon name="filtres" taille={14} />
                Filtres
                {preds.length ? <span className="puce__badge">{preds.length}</span> : null}
              </button>
              <select
                className="select7"
                value={P.sortKey}
                onChange={(e) => P.setSort(e.target.value as SortKey)}
                aria-label="Trier les stations"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              {filtersOpen ? (
                <div className="pop7 pop7--filtres" ref={panneau}>
                  <div className="pop7__tete pop7__tete--ligne">
                    <strong>Filtres</strong>
                    <button type="button" className="v7fermer" aria-label="Fermer" onClick={() => setFiltersOpen(false)}>
                      <Icon name="croix" taille={14} />
                    </button>
                  </div>
                  {/* Les six raccourcis ont quitté la ligne au-dessus des
                      stations, où ils prenaient toute la largeur, pour la tête
                      du panneau : mêmes critères, moins d'écran mangé. */}
                  <div className="pop7__bloc pop7__bloc--raccourcis">
                    <span className="pop7__stitre">Raccourcis</span>
                    <div className="pop7__presets">
                      {chips.map((ch) => (
                        <button
                          key={ch.k}
                          type="button"
                          className={`puce${ch.on ? " puce--on" : ""}`}
                          aria-pressed={ch.on}
                          onClick={() => P.setChip(ch.k, !ch.on)}
                        >
                          {ch.on ? <Icon name="coche" taille={13} /> : null}
                          {ch.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {SEUILS.map((r) => (
                    <label key={r.k} className="curseur">
                      <span className="curseur__lab">
                        <span>{r.label}</span>
                        <span className="curseur__val">
                          {F[r.k]
                            ? r.k === "pass"
                              ? `≤ ${fmt(F[r.k])} €`
                              : `≥ ${fmt(F[r.k])} ${r.unit}`
                            : "Indifférent"}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={r.max}
                        step={r.step}
                        value={F[r.k]}
                        onChange={(e) => P.setFilters({ [r.k]: +e.target.value })}
                      />
                    </label>
                  ))}
                  <label className="champ7">
                    <span>Massif</span>
                    <select
                      className="select7 select7--champ"
                      value={P.massif ?? ""}
                      onChange={(e) => {
                        P.setMassif(e.target.value || null);
                        P.setFilters({ dom: "" });
                      }}
                    >
                      <option value="">Tous</option>
                      {massifs.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="champ7">
                    <span>Domaine skiable</span>
                    <select
                      className="select7 select7--champ"
                      value={F.dom}
                      onChange={(e) => P.setFilters({ dom: e.target.value })}
                    >
                      <option value="">Tous</option>
                      <option value="__none">Non renseigné</option>
                      {doms.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="pop7__bloc">
                    <div className="pop7__ligne">
                      <span className="pop7__stitre">Répartition par couleur, au minimum</span>
                      <span className="segments">
                        {(Object.keys(UNITES) as ColorUnit[]).map((u) => (
                          <button
                            key={u}
                            type="button"
                            className={P.unit === u ? "on" : undefined}
                            onClick={() => P.setUnit(u)}
                          >
                            {UNITES[u].lbl}
                          </button>
                        ))}
                      </span>
                    </div>
                    <div className="pop7__deux">
                      {COLS.map((c) => (
                        <label key={c.key} className="curseur">
                          <span className="curseur__lab curseur__lab--petit">
                            <span className="curseur__couleur">
                              <i style={{ background: c.token }} />
                              {c.label}
                            </span>
                            <span className="curseur__val">
                              {F.col[c.key] ? `≥ ${fmt(F.col[c.key])}${UNITES[P.unit].suf}` : "Indifférent"}
                            </span>
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={UNITES[P.unit].max}
                            step={UNITES[P.unit].step}
                            value={F.col[c.key]}
                            onChange={(e) => P.setColFilter(c.key, +e.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="pop7__pied pop7__pied--trait">
                    <a
                      href="#"
                      className="lien-doux"
                      onClick={(e) => {
                        e.preventDefault();
                        P.resetFilters();
                      }}
                    >
                      Réinitialiser
                    </a>
                    <button type="button" className="btn7" onClick={() => setFiltersOpen(false)}>
                      {seeLbl}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {cmp.length ? (
          <section className="cmp7">
            <div className="cmp7__defil">
              <table className="cmp7__table">
                <thead>
                  <tr>
                    <th className="cmp7__critere-tete">Critère</th>
                    {cmp.map((s) => (
                      <th
                        key={s.id}
                        className={`cmp7__col${s.id === pickId ? " cmp7__col--pick" : ""}`}
                      >
                        <label className="cmp7__pick">
                          <input
                            type="radio"
                            name="pick"
                            checked={s.id === pickId}
                            onChange={() => P.setPick(s.id)}
                          />
                          <span>{s.name}</span>
                        </label>
                        <div className="cmp7__liens">
                          <a
                            href={`/stations/${s.id}`}
                            onClick={(e) => {
                              e.preventDefault();
                              void go("fiche", { id: s.id });
                            }}
                          >
                            Fiche
                          </a>
                          <a
                            href="#"
                            className="cmp7__retirer"
                            onClick={(e) => {
                              e.preventDefault();
                              P.toggleCmp(s.id);
                            }}
                          >
                            Retirer
                          </a>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CRIT.map((c) => {
                    const vals = cmp.map((s) => (c.num ? c.num(s) : null));
                    const known = vals.filter((v): v is number => v != null);
                    const best = known.length > 1 ? Math.max(...known) : null;
                    return (
                      <tr key={c.label}>
                        <th className="cmp7__critere">
                          {c.label}
                          {c.note ? <span>{c.note}</span> : null}
                        </th>
                        {cmp.map((s, i) => {
                          const v = c.txt(s);
                          const gagne = best != null && vals[i] === best;
                          return (
                            <td
                              key={s.id}
                              className={`cmp7__cell${s.id === pickId ? " cmp7__col--pick" : ""}${v == null ? " cmp7__cell--absent" : ""}${gagne ? " cmp7__cell--best" : ""}`}
                            >
                              {v ?? "non relevé"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr>
                    <th className="cmp7__critere">
                      Pistes par couleur<span>OpenSkiMap, échelle domaine</span>
                    </th>
                    {cmp.map((s) => (
                      <td key={s.id} className={`cmp7__cell${s.id === pickId ? " cmp7__col--pick" : ""}`}>
                        <div className="cmp7__mix">
                          <PartPistes share={s.colorShare} hauteur={8} />
                          <span>{mixLbl(s.colorShare)}</span>
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="cmp7__pied">
              <span>
                Une valeur absente est dite absente. En gras : la meilleure valeur du critère.{" "}
                {CMP_MAX === 4 ? "Quatre" : CMP_MAX} stations au plus.
              </span>
              <button
                type="button"
                className="btn7 btn7--grand"
                onClick={() => pickId && retain(pickId)}
              >
                Voir les logements {aStation(pickName ?? "")}
                <Icon name="fleche-droite" taille={16} />
              </button>
            </div>
          </section>
        ) : null}
        {/* Rien avant la première case cochée : le rectangle « Aucune station
            cochée » occupait le haut de l'écran pour ne rien apprendre. Le
            tableau apparaît dès qu'une station entre dans la comparaison. */}

        <section className="filtres7">
          {preds.length ? (
            <div className="jetons7">
              <span className="jetons7__label">Actifs</span>
              {preds.map((p) => {
                const bloque = empty?.fix === p.retirer;
                return (
                  <span key={p.id} className={`jeton${bloque ? " jeton--bloque" : ""}`}>
                    {p.label}
                    <button type="button" aria-label={`Retirer le critère ${p.label}`} onClick={p.retirer}>
                      <Icon name="croix" taille={11} />
                    </button>
                  </span>
                );
              })}
              <a
                href="#"
                className="lien-doux"
                onClick={(e) => {
                  e.preventDefault();
                  P.resetFilters();
                }}
              >
                Tout réinitialiser
              </a>
            </div>
          ) : null}

        </section>

        <div className="v7deux">
          <div className="v7deux__liste">
            {list.length ? (
              <>
                <div className="grille7-2">
                  {list.map((s) => (
                    <CarteStation
                      key={s.id}
                      s={s}
                      variante="liste"
                      vif={actifCarte === s.id}
                      surSurvol={setActifCarte}
                    />
                  ))}
                </div>
                {dansCadre.length > LISTE_MAX ? (
                  <p className="v7deux__plus">
                    {dansCadre.length - LISTE_MAX} autres stations : affinez un filtre ou cherchez
                    un nom.
                  </p>
                ) : null}
              </>
            ) : visible.length ? (
              <Vide titre="Aucune station dans ce cadre">
                La liste suit la carte : {visible.length} station{visible.length > 1 ? "s" : ""}{" "}
                remplit{visible.length > 1 ? "ent" : ""} vos critères, hors du cadre visible.
                Dézoomez ou déplacez la carte pour les retrouver.
              </Vide>
            ) : empty ? (
              <Vide
                titre={empty.title}
                actions={
                  <>
                    {empty.fix ? (
                      <button type="button" className="btn7" onClick={empty.fix}>
                        Retirer ce filtre
                      </button>
                    ) : null}
                    <button type="button" className="btn7 btn7--fantome" onClick={() => P.resetFilters()}>
                      Tout réinitialiser
                    </button>
                  </>
                }
              >
                {empty.hint}
              </Vide>
            ) : null}
          </div>
          <div className="v7deux__carte">
            <CarteEpingles
              marqueurs={marqueurs}
              cadrage={cadrage}
              surBornes={setBornes}
              actif={actifCarte}
              surActif={setActifCarte}
              ficheDe={(id) => {
                const st = stationById(id);
                if (!st) return null;
                return (
                  <div className="fc__texte">
                    <strong className="fc__titre">{st.name}</strong>
                    <span className="fc__ligne">{sub(st)}</span>
                    <div className="fc__faits">
                      <div>
                        <span>Village</span>
                        <b className={villageLbl(st) ? undefined : "absent"}>
                          {villageLbl(st) ?? "non relevé"}
                        </b>
                      </div>
                      <div>
                        <span>Sommet</span>
                        <b className={maxM(st) != null ? undefined : "absent"}>
                          {maxM(st) != null ? `${fmt(maxM(st))} m` : "non relevé"}
                        </b>
                      </div>
                      <div>
                        <span>Pistes, domaine</span>
                        <b className={kmLbl(st) ? undefined : "absent"}>
                          {kmLbl(st) ?? "km non publié"}
                        </b>
                      </div>
                      <div>
                        <span>Forfait 6 j</span>
                        <b className={eurN(forfaitOf(st)?.j6) ? undefined : "absent"}>
                          {eurN(forfaitOf(st)?.j6) ?? "non relevé"}
                        </b>
                      </div>
                    </div>
                    <PartPistes share={st.colorShare} />
                    {/* Une épingle posée au centre de la commune le dit : sans
                        cela, elle laisse croire qu'elle désigne le village. */}
                    {st.posRelevee ? null : (
                      <span className="fc__note">
                        Position approximative : centre de la commune.
                      </span>
                    )}
                  </div>
                );
              }}
              /* Les actions n'apparaissent que sur la fiche épinglée : celle du
                 survol est informative et ne reçoit pas les clics. */
              actionsDe={(id) => {
                const st = stationById(id);
                if (!st) return null;
                const dedans = P.cmp.includes(st.id);
                return (
                  <>
                    <button
                      type="button"
                      className="btn7 btn7--fantome"
                      onClick={() => void go("fiche", { id: st.id })}
                    >
                      Voir la fiche station
                    </button>
                    <button
                      type="button"
                      className={`btn7${dedans ? " btn7--fantome" : ""}`}
                      aria-pressed={dedans}
                      onClick={() => P.toggleCmp(st.id)}
                    >
                      {dedans ? "Retirer de la comparaison" : "Ajouter à la comparaison"}
                    </button>
                  </>
                );
              }}
              /* La légende ne garde que le compte et le retour au cadrage des
                 résultats : le reste — « une par station », « survolez-en une »,
                 le fond de carte — se voit ou se lit dans l'attribution. */
              legende={
                <>
                  <b>
                    {dansCadre.length} station{dansCadre.length > 1 ? "s" : ""} dans le cadrage
                  </b>
                  {dansCadre.length < visible.length ? (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        revoirTout();
                      }}
                    >
                      Revoir les {visible.length} résultats →
                    </a>
                  ) : null}
                </>
              }
            />
          </div>
        </div>
      </main>
    </Coquille>
  );
}
