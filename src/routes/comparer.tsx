/** Comparer – maquette v7 (`SKITRACK v7 - App.dc.html`, bloc COMPARER).
 *
 *  En haut, la comparaison : stations en colonnes, critères en lignes, la
 *  meilleure valeur en gras, une colonne cochée qui mène aux logements. Puis
 *  la barre des filtres (raccourcis, compteur, tri, jetons actifs, panneau
 *  flottant), et deux colonnes : les cartes de station, la carte des épingles.
 *  Données : `STATIONS` du dépôt, champs d'échelle domaine joints tels quels. */

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { useGo } from "@/components/v6/go";
import { CarteEpingles, htmlStation } from "@/components/v7/CarteEpingles";
import { partagerParBornes, sansPositionLabel, type Bornes } from "@/lib/carte";
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
  type PisteColor,
  type SortKey,
} from "@/lib/parcours";
import { STATIONS, stationById, type Station } from "@/lib/stations";
import { altLbl, CHIPS, forfaitOf, glacier, kmLbl, liftsLbl, linked, maxM, minM, villageLbl, villageM } from "@/lib/v7";

export const Route = createFileRoute("/comparer")({ component: Comparer });

const SORTS: { key: SortKey; label: string }[] = [
  { key: "km", label: "Tri : km de pistes" },
  { key: "hi", label: "Tri : sommet" },
  { key: "lo", label: "Tri : bas des pistes" },
  { key: "v", label: "Tri : altitude village" },
  { key: "pass", label: "Tri : forfait 6 j" },
  { key: "n", label: "Tri : nom" },
];

/** `RG` de la maquette : clé, libellé, borne, pas, unité. */
const RG: { k: "v" | "lo" | "hi" | "km" | "pass"; label: string; max: number; step: number; unit: string }[] = [
  { k: "v", label: "Altitude du village", max: 2400, step: 100, unit: "m" },
  { k: "lo", label: "Bas des pistes", max: 2200, step: 100, unit: "m" },
  { k: "hi", label: "Sommet", max: 3500, step: 100, unit: "m" },
  { k: "km", label: "Km de pistes, domaine", max: 600, step: 10, unit: "km" },
  { k: "pass", label: "Forfait 6 j adulte, au plus", max: 400, step: 10, unit: "€" },
];

const UNIT: Record<ColorUnit, { max: number; step: number; suf: string; lbl: string }> = {
  pct: { max: 60, step: 5, suf: " %", lbl: "%" },
  n: { max: 200, step: 5, suf: " tronçons", lbl: "tronçons" },
  km: { max: 200, step: 10, suf: " km", lbl: "km" },
};

/** `colVal` : part, tronçons, ou km estimés (part × km du domaine). */
function colVal(s: Station, c: PisteColor, u: ColorUnit): number | null {
  if (!s.colorShare) return null;
  if (u === "pct") return s.colorShare[c];
  if (u === "n") return s.colorCounts ? s.colorCounts[c] : null;
  return s.pistesKm != null ? Math.round((s.pistesKm * s.colorShare[c]) / 100) : null;
}

function sortVal(s: Station, k: SortKey): number {
  if (k === "km") return s.pistesKm ?? -1;
  if (k === "hi") return maxM(s) ?? -1;
  if (k === "lo") return minM(s) ?? -1;
  if (k === "v") return villageM(s) ?? -1;
  return 0;
}

/** Un prédicat actif, avec son jeton et la façon de le retirer. */
type Pred = { id: string; label: string; fn: (s: Station) => boolean; remove: () => void };

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
  // Le cadre de la carte, et s'il compte. Décoché par défaut.
  const [suivi, setSuivi] = useState(false);
  const [bornes, setBornes] = useState<Bornes | null>(null);
  const panneau = useRef<HTMLDivElement>(null);

  const massifs = useMemo(() => [...new Set(all.map((s) => s.massif))].sort(), [all]);
  const domPool = P.massif ? all.filter((s) => s.massif === P.massif) : all;
  const doms = useMemo(
    () =>
      [...new Set(domPool.map((s) => s.domain).filter((d): d is string => !!d))].sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [domPool],
  );

  /* ---------- Prédicats actifs ---------- */
  const preds: Pred[] = [];
  const ql = P.q.trim().toLowerCase();
  if (ql)
    preds.push({
      id: "q",
      label: `« ${P.q.trim()} »`,
      fn: (s) =>
        s.name.toLowerCase().includes(ql) ||
        s.massif.toLowerCase().includes(ql) ||
        (s.domain ?? "").toLowerCase().includes(ql),
      remove: () => P.setQ(""),
    });
  if (P.massif)
    preds.push({
      id: "massif",
      label: P.massif,
      fn: (s) => s.massif === P.massif,
      remove: () => P.setMassif(null),
    });
  for (const r of RG) {
    const v = F[r.k];
    if (!v) continue;
    if (r.k === "pass")
      preds.push({
        id: r.k,
        label: `Forfait ≤ ${fmt(v)} €`,
        fn: (s) => forfaitOf(s)?.j6 != null && (forfaitOf(s)!.j6 as number) <= v,
        remove: () => P.setFilters({ pass: 0 }),
      });
    else {
      const lire = { v: villageM, lo: minM, hi: maxM, km: (s: Station) => s.pistesKm }[r.k];
      preds.push({
        id: r.k,
        label: `${r.label} ≥ ${fmt(v)} ${r.unit}`,
        fn: (s) => (lire(s) ?? 0) >= v,
        remove: () => P.setFilters({ [r.k]: 0 }),
      });
    }
  }
  for (const c of COLS) {
    const v = F.col[c.key];
    if (!v) continue;
    preds.push({
      id: "col-" + c.key,
      label: `${c.label} ≥ ${fmt(v)}${UNIT[P.unit].suf}`,
      fn: (s) => (colVal(s, c.key, P.unit) ?? -1) >= v,
      remove: () => P.setColFilter(c.key, 0),
    });
  }
  if (F.dom)
    preds.push({
      id: "dom",
      label: F.dom === "__none" ? "Domaine non renseigné" : F.dom,
      fn: (s) => (F.dom === "__none" ? !s.domain : s.domain === F.dom),
      remove: () => P.setFilters({ dom: "" }),
    });
  for (const k of Object.keys(CHIPS) as ChipKey[]) {
    if (!F.chips[k]) continue;
    preds.push({ id: "c-" + k, label: CHIPS[k].label, fn: CHIPS[k].fn, remove: () => P.setChip(k, false) });
  }

  const applyAll = (ps: Pred[]) => all.filter((s) => ps.every((p) => p.fn(s)));
  const visible = applyAll(preds);
  const sorted = [...visible].sort((a, b) =>
    P.sortKey === "n"
      ? a.name.localeCompare(b.name, "fr")
      : P.sortKey === "pass"
        ? (forfaitOf(a)?.j6 ?? 9e9) - (forfaitOf(b)?.j6 ?? 9e9)
        : sortVal(b, P.sortKey) - sortVal(a, P.sortKey),
  );
  // Le cadre s'applique AVANT la tranche, sinon il ne filtrerait que les
  // quarante premières par kilomètres — toutes alpines — et un cadrage sur les
  // Pyrénées ne rendrait rien.
  const cadre = suivi ? bornes : null;
  const parCadre = partagerParBornes(sorted, cadre);
  const dansCadre = parCadre.visibles;
  const sansPos = sansPositionLabel(parCadre.sansPosition.length);
  const list = dansCadre.slice(0, LISTE_MAX);

  /* ---------- État vide : quel filtre bloque ---------- */
  let empty: { title: string; hint: string; fix: (() => void) | null } | null = null;
  if (!visible.length && preds.length) {
    let best: { p: Pred; n: number } | null = null;
    for (const p of preds) {
      const n = applyAll(preds.filter((x) => x !== p)).length;
      if (!best || n > best.n) best = { p, n };
    }
    empty =
      best && best.n > 0
        ? {
            title: `Le filtre « ${best.p.label} » ne laisse aucune station`,
            hint: `Sans lui, ${best.n} station${best.n > 1 ? "s" : ""} rest${best.n > 1 ? "ent" : "e"} avec les autres critères.`,
            fix: best.p.remove,
          }
        : {
            title: "Aucune station ne remplit ces critères",
            hint: `Le référentiel couvre ${all.length} stations françaises. Retirer un seul filtre ne suffit pas : réinitialisez.`,
            fix: null,
          };
  }

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

  const marqueurs = useMemo(
    () =>
      list.map((s) => ({
        id: s.id,
        lat: s.lat,
        lon: s.lon,
        html: htmlStation(s.name, P.cmp.includes(s.id)),
        zIndex: P.cmp.includes(s.id) ? 100 : 0,
      })),
    // La liste change de contenu quand ses identifiants ou la comparaison changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list.map((s) => s.id).join(","), P.cmp.join(",")],
  );

  return (
    <Coquille>
      <main className="v7main" id="s-compare" data-screen-label="1 Comparer">
        <header className="v7tete">
          <span className="v7surtitre">Étape 1 · Station</span>
          <h1>Comparer les stations</h1>
          <p>
            Cochez des stations dans la liste, lisez-les côte à côte, puis ouvrez les logements de
            celle que vous retenez. Dates et voyageurs suivent.
          </p>
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
                Voir les logements à {pickName}
                <Icon name="fleche-droite" taille={16} />
              </button>
            </div>
          </section>
        ) : (
          <Vide compact titre="Aucune station cochée">
            Cochez « Comparer » sur deux stations de la liste pour les lire côte à côte.
          </Vide>
        )}

        <section className="filtres7">
          <div className="filtres7__barre">
            <button
              type="button"
              className={`puce puce--encre${filtersOpen ? " puce--on" : ""}`}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <Icon name="filtres" taille={14} />
              Filtres
              {preds.length ? <span className="puce__badge">{preds.length}</span> : null}
            </button>
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
            <span className="filtres7__espace" />
            <span className="filtres7__compte">
              {dansCadre.length} station{dansCadre.length > 1 ? "s" : ""} sur {all.length}
              {suivi && parCadre.horsCadre.length
                ? ` · ${parCadre.horsCadre.length} hors du cadre`
                : ""}
              {sansPos ? ` · ${sansPos}` : ""}
            </span>
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

          {preds.length ? (
            <div className="jetons7">
              <span className="jetons7__label">Actifs</span>
              {preds.map((p) => {
                const bloque = empty?.fix === p.remove;
                return (
                  <span key={p.id} className={`jeton${bloque ? " jeton--bloque" : ""}`}>
                    {p.label}
                    <button type="button" title="Retirer" onClick={p.remove}>
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

          {filtersOpen ? (
            <div className="pop7 pop7--filtres" ref={panneau}>
              <div className="pop7__tete pop7__tete--ligne">
                <strong>Filtres</strong>
                <button type="button" className="v7fermer" aria-label="Fermer" onClick={() => setFiltersOpen(false)}>
                  <Icon name="croix" taille={14} />
                </button>
              </div>
              {RG.map((r) => (
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
                    {(Object.keys(UNIT) as ColorUnit[]).map((u) => (
                      <button
                        key={u}
                        type="button"
                        className={P.unit === u ? "on" : undefined}
                        onClick={() => P.setUnit(u)}
                      >
                        {UNIT[u].lbl}
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
                          {F.col[c.key] ? `≥ ${fmt(F.col[c.key])}${UNIT[P.unit].suf}` : "Indifférent"}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={UNIT[P.unit].max}
                        step={UNIT[P.unit].step}
                        value={F.col[c.key]}
                        onChange={(e) => P.setColFilter(c.key, +e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <span className="pop7__note">
                  Tronçons par couleur : OpenSkiMap, à l'échelle du domaine. Les km par couleur sont
                  estimés (part × km du domaine).
                </span>
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
        </section>

        <div className="v7deux">
          <div className="v7deux__liste">
            {list.length ? (
              <>
                <div className="grille7-2">
                  {list.map((s) => (
                    <CarteStation key={s.id} s={s} variante="liste" />
                  ))}
                </div>
                {dansCadre.length > LISTE_MAX ? (
                  <p className="v7deux__plus">
                    {dansCadre.length - LISTE_MAX} autres stations : affinez un filtre, resserrez la
                    carte, ou cherchez un nom.
                  </p>
                ) : null}
              </>
            ) : suivi && visible.length ? (
              <Vide
                titre="Aucune station dans ce cadre"
                actions={
                  <button type="button" className="btn7" onClick={() => setSuivi(false)}>
                    Revoir les {visible.length} stations
                  </button>
                }
              >
                La liste suit la carte. Déplacez-la, élargissez-la, ou décochez « Rechercher quand
                je déplace la carte » pour retrouver les résultats des filtres.
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
              cadrage={list.map((s) => s.id).join(",")}
              suivi={suivi}
              surSuivi={setSuivi}
              surBornes={setBornes}
              surClic={(id) => void go("fiche", { id })}
              legende={
                <>
                  <b>
                    {list.length} épingle{list.length > 1 ? "s" : ""}
                  </b>
                  <span>Une par station affichée ; le cadrage suit les résultats. Fond OpenStreetMap.</span>
                </>
              }
            />
          </div>
        </div>
      </main>
    </Coquille>
  );
}
