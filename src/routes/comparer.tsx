/** Stations – maquette Airbnb (Skitrack App.dc.html:235-342, `vStations`).
 *
 * Un bandeau collant porte la rangée de catégories (les raccourcis `CHIPS`)
 * et le bouton « Filtres », qui ouvre la fenêtre des filtres. Dessous : le
 * champ de recherche, le compte, le tri et son sens, les critères actifs,
 * puis la liste en cartes, ou la carte Leaflet fixée à droite avec les prix
 * en pastilles. L'écran s'ouvre sur la carte. La barre de comparaison paraît
 * en bas dès qu'une station est cochée, et ouvre la fenêtre de comparaison.
 *
 * Données : `STATIONS` du dépôt, prédicats de `filtres.ts`, magasin
 * `useParcours`. La fenêtre « Filtres » s'ouvre aussi depuis l'accueil
 * (`ouvrirFiltresStations`) ou par l'adresse `/comparer?filtres=1`. */

import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { useGo } from "@/components/v6/go";
import { BasculeVue, CATEGORIES_STATIONS, PuceCritere, RangeeCategories } from "@/components/maquette";
import { CarteEpingles, type Marqueur } from "@/components/v7/CarteEpingles";
import { echappe, epinglePrix, ETAGE } from "@/components/v7/epingle";
import { partagerParBornes, sansPositionLabel, type Bornes } from "@/lib/carte";
import { appliquer, critereBloquant, usePredicats } from "@/lib/filtres";
import { SensTri } from "@/components/v7/SensTri";
import { parMesure, parTexte } from "@/lib/tri";
import { CarteStation } from "@/components/v7/CarteStation";
import { usePrixStations } from "@/components/v7/usePrixForfait";
import { mentionForfait } from "@/lib/forfaits/prixSejour";
import { prixAdulteSejour, type ContexteSejour } from "@/lib/forfaits/prixStations";
import { montantN } from "@/lib/devises";
import { PartPistes } from "@/components/v7/PartPistes";
import { Chevron, ModaleFiltresStations } from "@/components/stations/ModaleFiltresStations";
import { ModaleComparaison } from "@/components/stations/ModaleComparaison";
import { forfaitAbsent, forfaitTxt } from "@/components/stations/criteres";
import { PARAM_FILTRES, useOuvertureFiltresStations } from "@/components/stations/ouvertureFiltres";
import { fmt, stationPhoto, useParcours, type SortKey } from "@/lib/parcours";
import { lignePistes } from "@/lib/pistesDetail";
import { SKIINFO } from "@/lib/skiinfo";
import { STATIONS, stationById, type Station } from "@/lib/stations";
import { aStation, kmLbl, maxM, minM, sansDomaineLbl, sub, villageLbl, villageM } from "@/lib/v7";
import { aTraduire, langue, tr, trN } from "@/lib/i18n";

export const Route = createFileRoute("/comparer")({ component: Comparer });

const SORTS: { key: SortKey; label: string }[] = [
  { key: "km", label: aTraduire("Tri : km de pistes") },
  { key: "hi", label: aTraduire("Tri : sommet") },
  { key: "lo", label: aTraduire("Tri : bas des pistes") },
  { key: "v", label: aTraduire("Tri : altitude du village") },
  { key: "pass", label: aTraduire("Tri : forfait adulte") },
  { key: "n", label: aTraduire("Tri : nom") },
];

/** La valeur que le tri compare ; `null` quand elle n'est pas relevée, et la
 *  station finit alors en queue, dans les deux sens. */
function sortVal(s: Station, k: Exclude<SortKey, "n">, ctx: ContexteSejour): number | null {
  if (k === "km") return s.pistesKm;
  if (k === "hi") return maxM(s);
  if (k === "lo") return minM(s);
  if (k === "v") return villageM(s);
  return prixAdulteSejour(s.id, ctx)?.prix ?? null;
}

const LISTE_MAX = 40;
/** Ce qu'un clic sur « Afficher … de plus » ajoute à la liste. */
const LISTE_PAS = 30;

/** Pose la hauteur d'un élément dans une propriété CSS de la racine. */
function useHauteur(lire: () => HTMLElement | null, propriete: string) {
  useEffect(() => {
    const el = lire();
    if (!el) return;
    const racine = document.documentElement;
    const mesurer = () => racine.style.setProperty(propriete, `${Math.round(el.getBoundingClientRect().height)}px`);
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => {
      ro.disconnect();
      racine.style.removeProperty(propriete);
    };
    // `lire` est une fonction en ligne ; la mesure se pose au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propriete]);
}

function Comparer() {
  const go = useGo();
  const P = useParcours();
  const F = P.filters;
  const all = STATIONS;

  /* ---------- Fenêtre « Filtres » ----------
     Ouverte ici, depuis l'accueil (drapeau du magasin), ou par l'adresse
     `?filtres=1`. L'état du routeur garde le paramètre même après que
     `useCriteresUrl` a réécrit l'adresse. */
  const filtresOuverts = useOuvertureFiltresStations((s) => s.ouvert);
  const ouvrirFiltres = useOuvertureFiltresStations((s) => s.ouvrir);
  const fermerFiltres = useOuvertureFiltresStations((s) => s.fermer);
  const filtresUrl = useRouterState({
    select: (s) => (s.location.search as Record<string, unknown>)[PARAM_FILTRES] != null,
  });
  useEffect(() => {
    if (filtresUrl) ouvrirFiltres();
  }, [filtresUrl, ouvrirFiltres]);
  // Quitter l'écran referme la fenêtre : elle ne doit pas reparaître au retour.
  useEffect(() => () => fermerFiltres(), [fermerFiltres]);

  /* ---------- Vue : carte par défaut ---------- */
  const [vue, setVue] = useState<"liste" | "carte">("carte");

  // Le cadre visible de la carte : la liste, le compteur et les pastilles
  // disent la même chose que ce qu'on voit. En liste, pas de cadre.
  const [bornes, setBornes] = useState<Bornes | null>(null);
  // Rendre les résultats que le cadre a laissés dehors : la carte ne recadre
  // que si la clé `cadrage` change, et ce compteur la fait changer.
  const [recadrages, setRecadrages] = useState(0);
  const revoirTout = useCallback(() => {
    setBornes(null);
    setRecadrages((n) => n + 1);
  }, []);
  const basculer = () => {
    setBornes(null);
    setVue((v) => (v === "liste" ? "carte" : "liste"));
  };
  // La station que la carte désigne, et que la liste éclaire en retour.
  const [actifCarte, setActifCarte] = useState<string | null>(null);

  const bandeau = useRef<HTMLDivElement>(null);
  useHauteur(() => document.querySelector<HTMLElement>(".v7haut"), "--st-haut");
  useHauteur(() => bandeau.current, "--st-bandeau");

  /* ---------- Prédicats actifs ----------
     Les mêmes que l'accueil, écrits une seule fois (`filtres.ts`). */
  const preds = usePredicats();
  const prixStations = usePrixStations();

  const visible = useMemo(() => appliquer(all, preds), [all, preds]);
  const sorted = useMemo(() => {
    const k = P.sortKey;
    // À égalité de km (un même domaine relié), la plus haute d'abord.
    const egalite = (a: Station, b: Station) => (k === "km" ? parMesure(villageM(a), villageM(b), -1) : 0);
    return [...visible].sort((a, b) =>
      k === "n"
        ? parTexte(a.name, b.name, P.sortDir)
        : parMesure(sortVal(a, k, prixStations.ctx), sortVal(b, k, prixStations.ctx), P.sortDir) || egalite(a, b),
    );
  }, [visible, P.sortKey, P.sortDir, prixStations.ctx]);

  /* ---------- Le cadre visible : une seule source pour les trois ---------- */
  const parCadre = useMemo(
    () => partagerParBornes(sorted, vue === "carte" ? bornes : null),
    [sorted, bornes, vue],
  );
  const dansCadre = parCadre.visibles;
  const sansPos = sansPositionLabel(parCadre.sansPosition.length);
  const [limite, setLimite] = useState(LISTE_MAX);
  const list = dansCadre.slice(0, limite);
  const reste = dansCadre.length - limite;
  const pasSuivant = Math.min(LISTE_PAS, reste);

  /** Le compte des résultats, en infobulle du champ et du compteur. */
  const cqLbl = P.q
    ? trN(
        visible.length,
        "{n} station où « {texte} » apparaît dans le nom, le domaine ou le massif{autres}.",
        "{n} stations où « {texte} » apparaît dans le nom, le domaine ou le massif{autres}.",
        { texte: P.q.trim(), autres: preds.length > 1 ? tr(", les autres filtres compris") : "" },
      )
    : [
        dansCadre.length === 0
          ? visible.length
            ? tr("Aucune station dans le cadre : dézoomez pour en voir.")
            : tr("Aucune station ne remplit ces critères.")
          : trN(dansCadre.length, "{n} station sur {total}.", "{n} stations sur {total}.", { total: visible.length }),
        parCadre.horsCadre.length ? tr("{n} hors du cadre.", { n: parCadre.horsCadre.length }) : null,
        sansPos ? `${sansPos}.` : null,
        tr("Nom de la station, domaine skiable ou massif."),
      ]
        .filter(Boolean)
        .join(" ");

  /* ---------- État vide : quel filtre bloque ---------- */
  const bloquant = !visible.length && preds.length ? critereBloquant(all, preds) : null;

  /* ---------- Comparaison ----------
     Par identifiant **résolu** : un identifiant retiré ouvre la station qui
     l'a remplacé, et deux colonnes ne montrent jamais la même station. */
  const cmp = [
    ...new Map(
      P.cmp
        .map((id) => stationById(id))
        .filter((s): s is Station => !!s)
        .map((s) => [s.id, s] as const),
    ).values(),
  ];
  const cmpIds = new Set(cmp.map((s) => s.id));
  const pickResolu = P.pick ? (stationById(P.pick)?.id ?? null) : null;
  const pickId = pickResolu && cmpIds.has(pickResolu) ? pickResolu : (cmp[0]?.id ?? null);
  const [masquerIdentiques, setMasquerIdentiques] = useState(false);
  const [tableauOuvert, setTableauOuvert] = useState(false);
  const pickName = pickId ? stationById(pickId)?.name : "";
  const retain = (id: string) => {
    P.retain(id);
    void go("lodging");
  };

  const categories = CATEGORIES_STATIONS.map((c) => {
    const on = !!F.chips[c.key];
    return {
      key: c.key,
      label: tr(c.court),
      title: tr(c.long),
      iconPath: c.icone,
      on,
      onToggle: () => P.setChip(c.key, !on),
    };
  });
  const sortLbl = tr(SORTS.find((s) => s.key === P.sortKey)?.label ?? SORTS[0].label);

  /**
   * Les pastilles de la carte : le forfait adulte du séjour, comme les prix
   * d'Airbnb. Une station sans prix garde la pastille ronde. Les pastilles
   * qui se chevauchent se réduisent à un point (`compacter`).
   */
  const marqueurs = useMemo<Marqueur[]>(
    () =>
      sorted.map((s) => {
        const comparee = cmpIds.has(s.id);
        const r = prixAdulteSejour(s.id, prixStations.ctx);
        // Des euros ronds sur la carte, comme la maquette (`eur()`).
        const prix = r ? montantN(Math.round(r.prix), r.devise) : null;
        return {
          id: s.id,
          lat: s.lat,
          lon: s.lon,
          nom: s.name,
          epingle: prix
            ? epinglePrix(prix, s.name, comparee ? "retenue" : "normale")
            : {
                html: `<div class="st-point${comparee ? " st-point--cmp" : ""}" aria-label="${echappe(s.name)}"></div>`,
                taille: [1, 1],
                ancre: [0, 0],
              },
          // Les points passent sous les prix : un prix reste lisible.
          zIndex: (comparee ? ETAGE.comparee : ETAGE.normale) + (prix ? 0 : ETAGE.repere),
          note: s.posRelevee ? undefined : tr("Position approximative : centre de la commune."),
        };
      }),
    // Le contenu change quand les identifiants, la comparaison ou les prix changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted.map((s) => s.id).join(","), [...cmpIds].join(","), prixStations.ctx],
  );

  /** La clé de recadrage suit le **résultat des filtres**, pas le contenu du
   *  cadre : sinon recadrer changerait la liste, qui recadrerait sans fin. */
  const cadrage = useMemo(() => `${recadrages}|${sorted.map((s) => s.id).join(",")}`, [sorted, recadrages]);

  const grille = list.length ? (
    <>
      <div className={`st-grille st-grille--${vue}`}>
        {list.map((s) => (
          <CarteStation key={s.id} s={s} variante="liste" vif={actifCarte === s.id} surSurvol={setActifCarte} />
        ))}
      </div>
      {dansCadre.length > limite ? (
        <div className="st-plus">
          <button type="button" className="st-bouton st-bouton--contour" onClick={() => setLimite((n) => n + LISTE_PAS)}>
            {trN(pasSuivant, "Afficher {n} station de plus", "Afficher {n} stations de plus")}
          </button>
          <span>
            {trN(reste, "{n} autre station est dans ce cadrage.", "{n} autres stations sont dans ce cadrage.")}
          </span>
        </div>
      ) : null}
    </>
  ) : visible.length ? (
    <div className="st-vide">
      <b>{tr("Aucune station dans ce cadrage")}</b>
      <span>{tr("La liste suit la carte. Dézoomez, déplacez-la, ou revenez au cadrage des résultats.")}</span>
      <div className="st-vide__actions">
        <button type="button" className="st-bouton st-bouton--encre" onClick={revoirTout}>
          {tr("Revoir tous les résultats")}
        </button>
      </div>
    </div>
  ) : (
    <div className="st-vide">
      <b>
        {bloquant
          ? tr("Aucune station avec « {filtre} »", { filtre: bloquant.pred.label })
          : tr("Aucune station ne correspond")}
      </b>
      {bloquant ? (
        <span>{trN(bloquant.restantes, "{n} station sans ce filtre.", "{n} stations sans ce filtre.")}</span>
      ) : null}
      <div className="st-vide__actions">
        {bloquant ? (
          <button type="button" className="st-bouton st-bouton--encre" onClick={bloquant.pred.retirer}>
            {tr("Retirer ce filtre")}
          </button>
        ) : null}
        <button type="button" className="st-bouton st-bouton--contour" onClick={() => P.resetFilters()}>
          {tr("Tout réinitialiser")}
        </button>
      </div>
    </div>
  );

  return (
    <Coquille>
      <main className={`st-ecran st-ecran--${vue}`} id="s-compare" data-screen-label="1 Comparer">
        <h1 className="m8-lu-seul">{tr("Stations")}</h1>
        <div className="st-bandeau" ref={bandeau}>
          <RangeeCategories
            className="st-bandeau__rang"
            items={categories}
            variante="clair"
            nFiltres={preds.length}
            onFiltres={ouvrirFiltres}
          />
        </div>

        <div className={`st-corps st-corps--${vue}`}>
          <div className="st-outils">
            <label className="st-recherche" title={cqLbl}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={P.q}
                onChange={(e) => P.setQ(e.target.value)}
                placeholder={tr("Station, domaine skiable ou massif")}
                aria-label={tr("Chercher une station, un domaine skiable ou un massif")}
              />
              {P.q ? (
                <button
                  type="button"
                  className="st-recherche__vider"
                  title={tr("Effacer la recherche")}
                  aria-label={tr("Effacer la recherche")}
                  onClick={() => P.setQ("")}
                >
                  <Icon name="croix" taille={11} />
                </button>
              ) : null}
            </label>
            <span className="st-compte" title={cqLbl}>
              {trN(dansCadre.length, "{n} station", "{n} stations")}
            </span>
            <label className="st-tri">
              {sortLbl}
              <select value={P.sortKey} onChange={(e) => P.setSort(e.target.value as SortKey)} aria-label={tr("Tri des stations")}>
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {tr(s.label)}
                  </option>
                ))}
              </select>
              <Chevron />
            </label>
            <SensTri variante="rond" sens={P.sortDir} alpha={P.sortKey === "n"} onChange={P.setSortDir} />
          </div>

          {preds.length ? (
            <div className="st-actifs">
              <span className="st-actifs__lbl">{tr("Actifs")}</span>
              {preds.map((p) => (
                <PuceCritere
                  key={p.id}
                  label={p.label}
                  onRetirer={p.retirer}
                  title={bloquant?.pred === p ? tr("Ce filtre ne laisse aucune station") : undefined}
                />
              ))}
              <button type="button" className="m8-lien-fort st-actifs__tout" onClick={() => P.resetFilters()}>
                {tr("Tout réinitialiser")}
              </button>
            </div>
          ) : null}

          {grille}
        </div>

        {vue === "carte" ? (
          <div className="st-carte">
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
                        <span>{tr("Village")}</span>
                        <b className={villageLbl(st) ? undefined : "absent"}>{villageLbl(st) ?? tr("non relevé")}</b>
                      </div>
                      <div>
                        <span>{tr("Sommet")}</span>
                        <b className={maxM(st) != null ? undefined : "absent"}>
                          {maxM(st) != null ? `${fmt(maxM(st))} m` : (sansDomaineLbl(st) ?? tr("non relevé"))}
                        </b>
                      </div>
                      <div>
                        <span>{tr("Pistes, domaine")}</span>
                        <b className={kmLbl(st) ? undefined : "absent"}>
                          {kmLbl(st) ?? sansDomaineLbl(st) ?? tr("km non publié")}
                        </b>
                      </div>
                      <div>
                        <span>{tr("Forfait {jours} j", { jours: prixStations.jours ?? 6 })}</span>
                        <b
                          className={forfaitTxt(st) ? undefined : "absent"}
                          title={prixAdulteSejour(st.id) ? mentionForfait(prixAdulteSejour(st.id)!) : undefined}
                        >
                          {forfaitTxt(st) ?? forfaitAbsent(st) ?? tr("non relevé")}
                        </b>
                      </div>
                    </div>
                    <PartPistes share={st.colorShare} />
                    {lignePistes(SKIINFO[st.id]) ? <span className="fc__ligne">{lignePistes(SKIINFO[st.id])}</span> : null}
                    {st.posRelevee ? null : (
                      <span className="fc__ligne absent">{tr("Position approximative : centre de la commune.")}</span>
                    )}
                  </div>
                );
              }}
              actionsDe={(id) => {
                const st = stationById(id);
                if (!st) return null;
                const dedans = cmpIds.has(st.id);
                return (
                  <>
                    <button type="button" className="btn7 btn7--fantome" onClick={() => void go("fiche", { id: st.id })}>
                      {tr("Voir la fiche station")}
                    </button>
                    <button
                      type="button"
                      className={`btn7${dedans ? " btn7--fantome" : ""}`}
                      aria-pressed={dedans}
                      onClick={() => P.toggleCmp(st.id)}
                    >
                      {dedans ? tr("Retirer de la comparaison") : tr("Ajouter à la comparaison")}
                    </button>
                  </>
                );
              }}
              legende={
                /* Le compte est déjà dans la rangée d'outils ; la légende ne
                   garde que le retour à tous les résultats. */
                parCadre.horsCadre.length ? (
                    <button type="button" className="carte7__revoir" onClick={revoirTout}>
                      {visible.length > 1 ? tr("Revoir les {n} résultats", { n: visible.length }) : tr("Revoir le résultat")}
                      <Icon name="fleche-droite" taille={14} />
                    </button>
                ) : null
              }
            />
          </div>
        ) : null}

        <BasculeVue vue={vue} onBasculer={basculer} surelevee={cmp.length > 0} />

        {cmp.length ? (
          <div className="st-barre-cmp" role="region" aria-label={tr("Stations à comparer")}>
            <div className="st-barre-cmp__vignettes">
              {cmp.map((s) => {
                const src = stationPhoto(s);
                return (
                  <span key={s.id} className="st-barre-cmp__vignette" title={s.name}>
                    {src ? <img src={src} alt="" loading="lazy" /> : null}
                  </span>
                );
              })}
            </div>
            <span className="st-barre-cmp__n" title={cmp.map((s) => s.name).join(" · ")}>
              {trN(cmp.length, "{n} station", "{n} stations")}
            </span>
            <button type="button" className="st-barre-cmp__retirer" onClick={() => P.clearCmp()}>
              {tr("Tout retirer")}
            </button>
            <button
              type="button"
              className={`st-barre-cmp__go${cmp.length >= 2 ? " st-barre-cmp__go--pret" : ""}`}
              onClick={() => setTableauOuvert(true)}
            >
              {tr("Comparer")}
            </button>
          </div>
        ) : null}
      </main>

      {filtresOuverts ? <ModaleFiltresStations onFermer={fermerFiltres} /> : null}

      {cmp.length && tableauOuvert ? (
        <ModaleComparaison
          cmp={cmp}
          pickId={pickId}
          masquer={masquerIdentiques}
          onMasquer={() => setMasquerIdentiques((v) => !v)}
          onRetenir={(id) => P.setPick(id)}
          onFiche={(id) => void go("fiche", { id })}
          onRetirer={(id) => P.toggleCmp(id)}
          cta={tr("Voir les logements {lieu}", { lieu: langue() === "en" ? (pickName ?? "") : aStation(pickName) })}
          onCta={() => pickId && retain(pickId)}
          onFermer={() => setTableauOuvert(false)}
        />
      ) : null}
    </Coquille>
  );
}
