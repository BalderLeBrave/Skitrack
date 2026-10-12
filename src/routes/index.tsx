/** Accueil – maquette Airbnb (Skitrack App.dc.html:119-232, `vHome`).
 *
 *  Une couverture : le titre et l'accroche d'origine, la barre de recherche en
 *  cinq segments dont chacun ouvre son panneau, la phrase qui dit ce que la
 *  loupe fera, les critères actifs, puis la rangée sombre des catégories de
 *  stations et son bouton Filtres. Dessous, « Plus grands domaines » et
 *  « Par massif ». Données : `STATIONS` du dépôt et le catalogue de forfaits.
 *
 *  **La loupe est le seul passage vers l'écran suivant.** Choisir une
 *  suggestion remplit le champ et pose la station ; régler un curseur pose un
 *  seuil ; cliquer une vignette ouvre la fiche de cette station. Aucun de ces
 *  gestes ne quitte l'accueil de sa propre initiative. */

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Coquille } from "@/components/Coquille";
import { CATEGORIES_STATIONS, PuceCritere, RangeeCategories, Trace } from "@/components/maquette";
import { BarreRecherche, type PanneauRecherche } from "@/components/recherche/BarreRecherche";
import { MASSIFS, stationDuTexte } from "@/components/recherche/outils";
import { ModaleFiltresStations } from "@/components/stations/ModaleFiltresStations";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useGo } from "@/components/v6/go";
import { CarteStation } from "@/components/v7/CarteStation";
import { appliquer, usePredicats } from "@/lib/filtres";
import { datesLbl, fmt, nightsBetween, setStayRange, useParcours, useSejour } from "@/lib/parcours";
import { STATIONS, stationById, type Station } from "@/lib/stations";
import { tr, trN } from "@/lib/i18n";

export const Route = createFileRoute("/")({ component: Home });

/**
 * La station qui représente son domaine en vitrine.
 *
 * Le classement se fait aux kilomètres de pistes, qui sont une **valeur de
 * domaine** : les quatorze stations des 3 Vallées annoncent toutes 771 km. Le
 * tri les laissait donc à égalité, et `sort` étant stable, c'est l'ordre
 * alphabétique qui décidait — d'où Brides-les-Bains pour les 3 Vallées,
 * Abondance pour les Portes du Soleil, Aime 2000 pour Paradiski et La Daille
 * pour Tignes-Val d'Isère.
 *
 * Aucune donnée ne désigne l'emblème d'un domaine. Les km et les remontées
 * sont à égalité ; la distance aux pistes, mesurée, met en avant les
 * satellites qui dorment au pied d'un téléski — Reberty pour les 3 Vallées,
 * Arc 1950 pour Paradiski. C'est un choix éditorial, et il s'écrit comme tel :
 * une entrée par domaine, relue, qu'on change en une ligne.
 *
 * Un domaine absent de la table garde l'ordre d'avant.
 */
const VITRINE: Record<string, string> = {
  "Les Trois Vallées": "val-thorens",
  "Portes du Soleil (versant français)": "avoriaz",
  "Paradiski (Les Arcs – La Plagne)": "la-plagne",
  "Serre-Chevalier": "serre-chevalier",
  "Le Grand Massif": "flaine",
  "Tignes - Val d'Isère": "val-disere",
};

/** Une station par domaine relié, par km de pistes décroissants, six. */
function popular(all: Station[]): Station[] {
  const parDomaine = new Map<string, Station[]>();
  for (const s of all) {
    if (!s.domain) continue;
    parDomaine.set(s.domain, [...(parDomaine.get(s.domain) ?? []), s]);
  }
  return [...parDomaine.entries()]
    .sort((a, b) => (b[1][0].pistesKm ?? 0) - (a[1][0].pistesKm ?? 0))
    .slice(0, 6)
    .map(([domaine, stations]) => {
      const choisie = VITRINE[domaine];
      return stations.find((s) => s.id === choisie) ?? stations[0];
    });
}


const TOP = popular(STATIONS);

function Home() {
  const go = useGo();
  const P = useParcours();
  const F = P.filters;
  const { checkIn, checkOut, nights } = useSejour();
  const all = STATIONS;
  // La station retenue, s'il y en a une : c'est elle qui décide de ce que
  // « Rechercher » va ouvrir. Le champ montre son nom quand il est vide, pour
  // que le champ et l'intention ne divergent pas (la fenêtre « Modifier la
  // recherche » retient une station sans écrire son nom dans le texte).
  const retenueChoisie = P.stationId ? stationById(P.stationId) : undefined;
  const q = P.q || (retenueChoisie?.name ?? "");
  // Un nom de station tapé en toutes lettres désigne cette station, même sans
  // passer par une suggestion.
  const retenue = retenueChoisie ?? stationDuTexte(q);

  const [hp, setHp] = useState<PanneauRecherche>(null);
  // Un verrou de navigation : deux Entrée rapides ne partent pas deux fois.
  const enRoute = useRef(false);
  const suite = useRef<HTMLDivElement>(null);

  /** Descendre jusqu'aux sections, sous la barre collante. Animé à la main
   *  (420 ms, quadratique entrante-sortante) ; net sous « mouvement réduit ». */
  const descendre = useCallback(() => {
    const el = suite.current;
    if (!el) return;
    const cible = el.getBoundingClientRect().top + window.scrollY - 68;
    const depart = window.scrollY;
    const delta = cible - depart;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo(0, cible);
      return;
    }
    const t0 = performance.now();
    const pas = (t: number) => {
      const p = Math.min(1, (t - t0) / 420);
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      window.scrollTo(0, depart + delta * e);
      if (p < 1) requestAnimationFrame(pas);
    };
    requestAnimationFrame(pas);
  }, []);

  /* ---------- Critères actifs et compte ----------
     Les mêmes prédicats que l'écran Comparer, pas une seconde écriture. */
  const preds = usePredicats();
  const retenues = useMemo(() => appliquer(all, preds).length, [all, preds]);
  // Le bouton Filtres compte ce que sa fenêtre règle : ni le texte, ni les
  // catégories, qui ont leur propre rangée.
  const nFiltres = preds.filter((p) => p.id !== "q" && !p.id.startsWith("c-")).length;

  /* ---------- Ce que la loupe va faire ----------
     Trois cas, dits avant d'être faits. Une plage de dates inversée se
     répare au lieu de barrer la route. */
  const nuitsLues = nightsBetween(checkIn, checkOut);
  const datesInversees = nuitsLues == null || nuitsLues <= 0;
  const dira = retenue
    ? tr("La recherche ouvrira la fiche de la station {station}.", { station: retenue.name })
    : preds.length
      ? trN(
          retenues,
          "{n} station sur {total} correspond à vos critères.",
          "{n} stations sur {total} correspondent à vos critères.",
          { total: all.length },
        )
      : tr("{total} stations, des plus grands domaines aux plus petits.", { total: all.length });
  const avertissement = datesInversees
    ? tr("Le départ précède l’arrivée : la recherche portera sur une nuit, à partir de l’arrivée.")
    : null;

  const search = () => {
    if (enRoute.current) return;
    setHp(null);
    if (datesInversees) {
      const lendemain = new Date(Date.parse(`${checkIn}T00:00:00Z`) + 86_400_000);
      setStayRange(checkIn, lendemain.toISOString().slice(0, 10));
    }
    enRoute.current = true;
    // a. Une station est nommée : sa fiche.
    if (retenue) {
      P.retain(retenue.id);
      void go("fiche", { id: retenue.id });
      return;
    }
    // b. Au moins un critère : Comparer, liste filtrée.
    if (preds.length) {
      void go("compare");
      return;
    }
    // c. Aucun critère : Comparer, liste complète, les plus grands domaines d'abord.
    P.setSort("km");
    void go("compare");
  };

  // Le verrou ne survit pas à l'écran : revenir par Précédent rend une loupe utilisable.
  useEffect(
    () => () => {
      enRoute.current = false;
    },
    [],
  );

  // La fenêtre Filtres des stations s'ouvre sur l'accueil même, comme dans la
  // maquette ; « Afficher N stations » mène à la liste filtrée.
  const [filtres, setFiltres] = useState(false);
  const ouvrirFiltres = () => {
    setHp(null);
    setFiltres(true);
  };

  return (
    <Coquille>
      <main className="acc" id="s-home" data-screen-label="Accueil">
        <section className="acc-hero">
          <div className="acc-hero__fond">
            <ImageSlot
              shape="rect"
              id="v7app-cover"
              placeholder={tr("Photo de couverture : un domaine en février, au petit matin. Crédit obligatoire.")}
              className="acc-hero__photo"
              src="/hero.jpg"
            />
            <div className="acc-hero__voile" />
          </div>
          {hp ? <div className="acc-hero__dehors" onClick={() => setHp(null)} aria-hidden /> : null}
          <div className="acc-hero__in">
            <h1 className="acc-titre">
              <span>{tr("Comparez les stations,")}</span>
              <span>{tr("puis les logements.")}</span>
            </h1>
            <p className="acc-accroche">
              {tr("Altitude des pistes, forfait 6 jours et prix du séjour, station par station.")}
            </p>

            <div className="acc-hero__barre">
              <BarreRecherche
                idBase="hq"
                q={q}
                onQ={P.setQ}
                onStation={(s) => P.setDestination(s)}
                onMassif={(m) => {
                  P.setDestination(null);
                  P.setQ(m);
                  P.setMassif(m);
                }}
                onRechercher={search}
                labelRecherche={dira}
                hp={hp}
                setHp={setHp}
              />
            </div>

            <p className="acc-dira" aria-live="polite">
              {dira}
              {avertissement ? <span className="acc-dira__avert"> {avertissement}</span> : null}
            </p>

            {preds.length ? (
              <div className="acc-criteres" aria-live="polite">
                <span className="acc-criteres__n">
                  {trN(retenues, "{n} station retenue", "{n} stations retenues")}
                </span>
                {preds.map((pr) => (
                  <PuceCritere key={pr.id} label={pr.label} onRetirer={pr.retirer} variante="verre" />
                ))}
                <button type="button" className="acc-criteres__tout" onClick={() => P.resetFilters()}>
                  {tr("Tout retirer")}
                </button>
              </div>
            ) : null}

            <button type="button" className="acc-descendre" onClick={descendre}>
              {tr("Grands domaines et massifs")}
              <Trace d="M12 5v13M6 13l6 6 6-6" taille={14} epaisseur={2.2} />
            </button>
          </div>

          <div className="acc-cats">
            <RangeeCategories
              variante="sombre"
              className="acc-cats__rangee"
              items={CATEGORIES_STATIONS.map((c) => ({
                key: c.key,
                label: tr(c.court),
                title: tr(c.long),
                iconPath: c.icone,
                on: !!F.chips[c.key],
                onToggle: () => P.setChip(c.key, !F.chips[c.key]),
              }))}
              nFiltres={nFiltres}
              onFiltres={ouvrirFiltres}
            />
          </div>
        </section>

        <div className="acc-suite" ref={suite}>
          <section className="acc-section">
            <header className="acc-section__tete">
              <div>
                <h2>{tr("Plus grands domaines")}</h2>
                <p>
                  {tr(
                    "Une station par domaine, du plus grand au plus petit. Kilomètres et remontées comptent tout le domaine relié.",
                  )}
                </p>
              </div>
              {/* Un lien de vue, pas une remise à zéro. */}
              <a
                href="/comparer"
                className="acc-section__lien"
                onClick={(e) => {
                  e.preventDefault();
                  void go("compare");
                }}
              >
                {tr("Toutes les stations")}
                <Trace d="M5 12h14M13 6l6 6-6 6" taille={14} epaisseur={2.4} />
              </a>
            </header>
            <div className="acc-grille">
              {TOP.map((s) => (
                <CarteStation key={s.id} s={s} variante="accueil" />
              ))}
            </div>
          </section>
          <section className="acc-section">
            <header className="acc-section__tete">
              <div>
                <h2>{tr("Par massif")}</h2>
                <p>{tr("Choisissez un massif, puis lancez la recherche.")}</p>
              </div>
            </header>
            <div className="acc-massifs">
              {MASSIFS.map((x) => {
                const on = P.massif === x.m;
                return (
                  <button
                    key={x.m}
                    type="button"
                    className={`acc-massif${on ? " acc-massif--on" : ""}`}
                    aria-pressed={on}
                    onClick={() => P.setMassif(on ? null : x.m)}
                  >
                    <b>{x.m}</b>
                    <span>
                      {trN(x.n, "{n} station", "{n} stations")} ·{" "}
                      {tr("sommet jusqu’à {altitude} m", { altitude: fmt(x.hi) })}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
        {filtres ? (
          <ModaleFiltresStations
            onFermer={() => setFiltres(false)}
            onAfficher={() => {
              setFiltres(false);
              void go("compare");
            }}
          />
        ) : null}
        <span className="m8-lu-seul">{datesLbl(checkIn, checkOut, nights)}</span>
      </main>
    </Coquille>
  );
}
