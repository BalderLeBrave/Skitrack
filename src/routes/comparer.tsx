/** Comparer – maquette v7 (`SKITRACK v7 - App.dc.html`, bloc COMPARER).
 *
 *  En haut, la comparaison : stations en colonnes, critères en lignes, la
 *  meilleure valeur en gras, une colonne cochée qui mène aux logements. Puis
 *  la barre des filtres (raccourcis, compteur, tri, jetons actifs, panneau
 *  flottant), et deux colonnes : les cartes de station, la carte des épingles.
 *  Données : `STATIONS` du dépôt, champs d'échelle domaine joints tels quels. */

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { useGo } from "@/components/v6/go";
import { CarteEpingles } from "@/components/v7/CarteEpingles";
import { epingleStation, ETAGE } from "@/components/v7/epingle";
import { useFermeture, useHauteurCollante } from "@/components/v7/fermeture";
import { partagerParBornes, sansPositionLabel, type Bornes } from "@/lib/carte";
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

const LISTE_MAX = 40;

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
  // Rendre les résultats que le cadre a laissés dehors. Relâcher les bornes ne
  // suffit pas : la carte ne recadre que si la clé `cadrage` change, et cette
  // clé suit le résultat des filtres, qui n'a pas bougé. Le compteur la fait
  // changer, et c'est sa seule raison d'être.
  const [recadrages, setRecadrages] = useState(0);
  const revoirTout = useCallback(() => {
    setBornes(null);
    setRecadrages((n) => n + 1);
  }, []);
  // La station que la carte désigne, et que la liste éclaire en retour.
  const [actifCarte, setActifCarte] = useState<string | null>(null);
  // Le panneau de filtres se ferme au clic dehors et à Échap, comme le menu
  // « Plus » et le panneau de séjour. La référence était posée sur le panneau
  // et n'était lue nulle part : le portage s'était arrêté là.
  const panneau = useRef<HTMLDivElement>(null);
  const barre = useRef<HTMLElement>(null);
  const fermerFiltres = useCallback(() => setFiltersOpen(false), []);

  useFermeture(filtersOpen, fermerFiltres, panneau, '[data-panel-btn="filtres"]');
  useHauteurCollante(barre, "--filtres-h");

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

  /* ---------- Le cadre visible : une seule source pour les trois ----------
     Le compteur, la liste et les marqueurs dérivent tous de `dansCadre`. La
     légende de la carte annonçait `list.length`, borné à quarante : elle disait
     « 40 épingles » quelles que soient les trois cents posées à côté. */
  /** Ce que le champ de recherche annonce au survol : ce qu'il retient
   *  aujourd'hui, ou ce qu'il accepte quand il est vide. */
  const parCadre = useMemo(() => partagerParBornes(sorted, bornes), [sorted, bornes]);
  const dansCadre = parCadre.visibles;
  const sansPos = sansPositionLabel(parCadre.sansPosition.length);
  const list = dansCadre.slice(0, LISTE_MAX);

  /** Le compte des résultats, en infobulle du champ : la maquette ne le pose
   *  plus sous la barre. Il dit ce que la liste montre, ce que le cadre laisse
   *  dehors, et ce qui n'a pas de position. */
  const cqLbl = P.q
    ? `${visible.length} station${visible.length > 1 ? "s" : ""} où « ${P.q.trim()} » apparaît dans le nom, le domaine ou le massif${preds.length > 1 ? ", les autres filtres compris" : ""}.`
    : [
        dansCadre.length === 0
          ? visible.length
            ? "Aucune station dans le cadre : dézoomez pour en voir."
            : "Aucune station ne remplit ces critères."
          : `${dansCadre.length} station${dansCadre.length > 1 ? "s" : ""} sur ${visible.length}.`,
        parCadre.horsCadre.length ? `${parCadre.horsCadre.length} hors du cadre.` : null,
        sansPos ? `${sansPos}.` : null,
        "Nom de la station, domaine skiable ou massif.",
      ]
        .filter(Boolean)
        .join(" ");

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
      sorted.map((s) => {
        const comparee = P.cmp.includes(s.id);
        return {
          id: s.id,
          lat: s.lat,
          lon: s.lon,
          nom: s.name,
          epingle: epingleStation(s.name, comparee ? "comparee" : "normale"),
          zIndex: comparee ? ETAGE.comparee : ETAGE.normale,
          etiquette: true,
          // Priorité d'arbitrage des noms : la station cochée gagne, puis
          // l'ordre du tri courant. Une seule table, celle de `sorted`.
          priorite: comparee ? 0 : 1,
          note: s.posRelevee ? undefined : "Position approximative : centre de la commune.",
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
    () => `${recadrages}|${sorted.map((s) => s.id).join(",")}`,
    [sorted, recadrages],
  );

  return (
    <Coquille>
      <main className="v7main v7main--serre" id="s-compare" data-screen-label="1 Comparer">
        <header className="v7tete v7tete--titre">
          <span className="v7surtitre">Étape 1</span>
          <h1>Stations</h1>
        </header>

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
                Voir les logements {aStation(pickName)}
                <Icon name="fleche-droite" taille={16} />
              </button>
            </div>
          </section>
        ) : null}

        <section className="filtres7" ref={barre}>
          <div className="filtres7__barre">
            {/* Le texte cherché était un critère qu'on ne pouvait plus corriger :
                il s'appliquait, il s'écrivait dans l'adresse, il portait un
                jeton — mais aucun champ ne le saisissait hors de l'accueil. La
                maquette en fait le premier élément de cette barre. */}
            <label className="filtres7__champ">
              <Icon name="loupe" taille={16} />
              <input
                value={P.q}
                onChange={(e) => P.setQ(e.target.value)}
                placeholder="Station, domaine skiable ou massif"
                title={cqLbl}
                aria-label="Chercher une station, un domaine skiable ou un massif"
              />
              {P.q ? (
                <button
                  type="button"
                  className="filtres7__vider"
                  title="Effacer la recherche"
                  aria-label="Effacer la recherche"
                  onClick={() => P.setQ("")}
                >
                  <Icon name="croix" taille={11} />
                </button>
              ) : null}
            </label>
            {/* Le panneau s'ancre sous son bouton. Il s'ancrait à gauche de la
                barre, ce qui le mettait sous le champ de recherche depuis que
                celui-ci ouvre la ligne. */}
            <div className="filtres7__groupe">
            <button
              type="button"
              className={`puce puce--encre${filtersOpen ? " puce--on" : ""}`}
              data-panel-btn="filtres"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <Icon name="filtres" taille={14} />
              Filtres
              {preds.length ? <span className="puce__badge">{preds.length}</span> : null}
            </button>
            {filtersOpen ? (
              <div className="pop7 pop7--filtres" ref={panneau}>
                <div className="pop7__tete pop7__tete--ligne">
                  <strong>Filtres</strong>
                  <button type="button" className="v7fermer" aria-label="Fermer" onClick={() => setFiltersOpen(false)}>
                    <Icon name="croix" taille={14} />
                  </button>
                </div>
                {/* Les raccourcis vivent ici, comme dans la maquette : la barre
                    porte déjà le champ, le bouton Filtres, le compteur et le
                    tri, et six pastilles de plus la mettaient sur deux lignes. */}
                <div className="pop7__bloc pop7__bloc--tete">
                  <span className="v7surtitre">Raccourcis</span>
                  <div className="pop7__puces">
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
              <select
                className="select7"
                value={P.sortKey}
                onChange={(e) => P.setSort(e.target.value as SortKey)}
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

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
                    {dansCadre.length - LISTE_MAX} autres stations sont sur la carte. Pour les
                    faire entrer dans cette liste, affinez un filtre, resserrez la carte, ou
                    cherchez un nom.
                  </p>
                ) : null}
              </>
            ) : visible.length ? (
              <Vide
                titre="Aucune station dans ce cadre"
                actions={
                  <button type="button" className="btn7" onClick={revoirTout}>
                    Revoir tous les résultats
                  </button>
                }
              >
                La liste suit la carte : {visible.length} station{visible.length > 1 ? "s" : ""}{" "}
                remplit{visible.length > 1 ? "ent" : ""} vos critères, hors du cadre visible.
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
                    {/* Une position posée au centre de la commune le dit : le
                        lecteur saurait sinon qu'un pin est faux sans savoir
                        lequel. */}
                    {st.posRelevee ? null : (
                      <span className="fc__ligne absent">
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
              legende={
                <>
                  <b>
                    {dansCadre.length} station{dansCadre.length > 1 ? "s" : ""} dans le cadrage
                  </b>
                  {parCadre.horsCadre.length ? (
                    <button type="button" className="carte7__revoir" onClick={revoirTout}>
                      Revoir les {visible.length} résultats →
                    </button>
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
