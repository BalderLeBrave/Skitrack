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
import { useEchap, useFermeture, useHauteurCollante } from "@/components/v7/fermeture";
import { partagerParBornes, sansPositionLabel, type Bornes } from "@/lib/carte";
import { appliquer, critereBloquant, SEUILS, UNITES, usePredicats } from "@/lib/filtres";
import { FourchetteCouleur, FourchetteRecherche } from "@/components/v7/FourchettesRecherche";
import { SensTri } from "@/components/v7/SensTri";
import { parMesure, parTexte } from "@/lib/tri";
import { CarteStation } from "@/components/v7/CarteStation";
import { FiabiliteFaible } from "@/components/v7/FiabiliteFaible";
import { usePrixStations } from "@/components/v7/usePrixForfait";
import { montantCents } from "@/lib/devises";
import { echecLbl, libellesForfait, mentionForfait } from "@/lib/forfaits/prixSejour";
import { forfaitsStation, prixAdulteSejour, type ContexteSejour } from "@/lib/forfaits/prixStations";
import { mixLbl } from "@/components/v7/mixLbl";
import { PartPistes } from "@/components/v7/PartPistes";
import { Vide } from "@/components/v7/Vide";
import {
  CMP_MAX,
  COLS,
  fmt,
  useParcours,
  type ChipKey,
  type ColorUnit,
  type SortKey,
} from "@/lib/parcours";
import { domaineNomme } from "@/lib/classeur";
import { lignePistes } from "@/lib/pistesDetail";
import { SKIINFO } from "@/lib/skiinfo";
import { STATIONS, stationById, type Station } from "@/lib/stations";
import {
  altLbl,
  aStation,
  CHIPS,
  glacier,
  kmLbl,
  liftsLbl,
  domaineRelieNom,
  maxM,
  minM,
  sansDomaineLbl,
  sub,
  villageLbl,
  villageM,
} from "@/lib/v7";
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

/** `crit` de la maquette : libellé, texte, valeur comparable, note d'échelle.
 *  Le libellé et la note sont marqués `aTraduire` et se traduisent au rendu. */
type Crit = {
  label: string;
  txt: (s: Station) => string | null;
  num: ((s: Station) => number | null) | null;
  note: string | null;
  /** Mention propre à une cellule, sous sa valeur : la période et le forfait
   *  d'un prix, « Saison 2026-27, sans période publiée · Forfait du domaine
   *  Les 3 Vallées ». */
  sous?: (s: Station) => string | null;
  /** Ce que la cellule écrit quand la valeur manque et que l'absence est
   *  connue ; « non relevé » sinon. */
  absent?: (s: Station) => string | null;
  /** Les raisons d'une valeur peu fiable : la cellule porte alors
   *  l'indicateur discret. */
  faible?: (s: Station) => string | null;
};

/** Le forfait adulte du séjour d'une station, ce qui le remplace sinon. */
const forfaitTxt = (s: Station) => {
  const r = prixAdulteSejour(s.id);
  return r ? montantCents(r.prix, r.devise) : null;
};
const forfaitAbsent = (s: Station) => {
  const f = forfaitsStation(s.id)?.adulte;
  return f && f.statut !== "resolu" ? echecLbl(f) : null;
};

const CRIT: Crit[] = [
  {
    label: aTraduire("Altitude des pistes"),
    txt: (s) => altLbl(s),
    num: (s) => maxM(s),
    // La Bourboule, détachée de Super Besse, porte 0 m en bas et en haut des
    // pistes : `altLbl` ne les lit pas comme une mesure, et il n'y a pas de
    // pistes alpines à relever.
    absent: sansDomaineLbl,
    /* L'altitude ne vient jamais de la mesure de domaine : `minM` et `maxM`
       sont lus sur la fiche de la station — le dépôt Skiinfo d'abord, France
       Montagnes ensuite —, là où les km et les remontées viennent d'
       OpenSkiMap à l'échelle du domaine. C'est ce qui fait que Courchevel
       annonce 1 100 – 2 738 m et Le Praz 1 110 – 3 223 m sur le même domaine :
       deux fiches, deux façons de compter. Sans la mention, cela se lisait
       comme une contradiction. */
    note: aTraduire("valeur de la station"),
  },
  { label: aTraduire("Village"), txt: (s) => villageLbl(s), num: (s) => villageM(s), note: null },
  {
    label: aTraduire("Kilomètres de pistes"),
    txt: (s) => kmLbl(s),
    num: (s) => s.pistesKm,
    note: aTraduire("valeur du domaine"),
    absent: sansDomaineLbl,
  },
  {
    label: aTraduire("Remontées"),
    txt: (s) => liftsLbl(s),
    num: (s) => s.lifts,
    note: aTraduire("valeur du domaine"),
    absent: sansDomaineLbl,
  },
  {
    // Le forfait du séjour : ses dates fixent la durée et la période. La
    // source varie d'une station à l'autre (page officielle, catalogue,
    // agrégateur) : elle se lit dans la fiche, la fiabilité ici.
    label: aTraduire("Forfait adulte"),
    txt: forfaitTxt,
    num: (s) => {
      const r = prixAdulteSejour(s.id);
      return r ? -r.prix : null;
    },
    note: aTraduire("pour les dates du séjour"),
    sous: (s) => {
      const r = prixAdulteSejour(s.id);
      return r ? mentionForfait(r) : null;
    },
    absent: forfaitAbsent,
    faible: (s) => {
      const r = prixAdulteSejour(s.id);
      const l = r ? libellesForfait(r) : null;
      return l?.faible ? l.raisons : null;
    },
  },
  { label: aTraduire("Glacier"), txt: (s) => (glacier(s) ? tr("Oui") : tr("Non")), num: null, note: null },
  {
    label: aTraduire("Domaine relié"),
    // Le grand domaine relié de la table (`grandsDomaines.ts`), ou « Non » :
    // la table est complète, une station qui n'y est pas n'est reliée à
    // aucune autre, et on le sait.
    txt: (s) => domaineRelieNom(s) ?? tr("Non"),
    num: null,
    note: null,
  },
  {
    label: aTraduire("Massif · département"),
    txt: (s) => [s.massif, s.dept].filter(Boolean).join(" · "),
    num: null,
    note: null,
  },
];

const LISTE_MAX = 40;
/** Ce qu'un clic sur « Afficher … de plus » ajoute à la liste. */
const LISTE_PAS = 30;

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
      // « domaine non nommé (OpenStreetMap) » ne désigne pas un domaine : il
      // réunissait Beille, Névache et Saint-Colomban, de 44 à 471 km l'une
      // de l'autre.
      [...new Set(domPool.map((s) => s.domain).filter(domaineNomme))].sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [domPool],
  );

  /* ---------- Prédicats actifs ----------
     Les mêmes que l'accueil, écrits une seule fois (`filtres.ts`). */
  const preds = usePredicats();
  // Les prix de forfait du séjour : la liste, le tri et le tableau se
  // redessinent quand les grilles arrivent ou que les dates changent.
  const prixStations = usePrixStations();

  const visible = useMemo(() => appliquer(all, preds), [all, preds]);
  const sorted = useMemo(() => {
    const k = P.sortKey;
    // Les stations d'un même domaine relié annoncent toutes ses km : à
    // égalité, la plus haute d'abord, plutôt que l'ordre alphabétique qui
    // mettait Brides-les-Bains (585 m) en tête des 3 Vallées.
    const egalite = (a: Station, b: Station) => (k === "km" ? parMesure(villageM(a), villageM(b), -1) : 0);
    return [...visible].sort((a, b) =>
      k === "n"
        ? parTexte(a.name, b.name, P.sortDir)
        : parMesure(sortVal(a, k, prixStations.ctx), sortVal(b, k, prixStations.ctx), P.sortDir) || egalite(a, b),
    );
  }, [visible, P.sortKey, P.sortDir, prixStations.ctx]);

  /* ---------- Le cadre visible : une seule source pour les trois ----------
     Le compteur, la liste et les marqueurs dérivent tous de `dansCadre`. La
     légende de la carte annonçait `list.length`, borné à quarante : elle disait
     « 40 épingles » quelles que soient les trois cents posées à côté. */
  /** Ce que le champ de recherche annonce au survol : ce qu'il retient
   *  aujourd'hui, ou ce qu'il accepte quand il est vide. */
  const parCadre = useMemo(() => partagerParBornes(sorted, bornes), [sorted, bornes]);
  const dansCadre = parCadre.visibles;
  const sansPos = sansPositionLabel(parCadre.sansPosition.length);
  /* La liste s'arrêtait à quarante et renvoyait à la carte pour les 290
     autres : il fallait filtrer pour les voir. Elle s'allonge maintenant sur
     demande. */
  const [limite, setLimite] = useState(LISTE_MAX);
  const list = dansCadre.slice(0, limite);
  const reste = dansCadre.length - limite;
  const pasSuivant = Math.min(LISTE_PAS, reste);

  /** Le compte des résultats, en infobulle du champ : la maquette ne le pose
   *  plus sous la barre. Il dit ce que la liste montre, ce que le cadre laisse
   *  dehors, et ce qui n'a pas de position. */
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
  const empty: { title: string; hint: string; fix: (() => void) | null } | null = visible.length
    ? null
    : preds.length
      ? bloquant
        ? {
            title: tr("Le filtre « {filtre} » ne laisse aucune station", { filtre: bloquant.pred.label }),
            hint: trN(
              bloquant.restantes,
              "Sans lui, {n} station reste avec les autres critères.",
              "Sans lui, {n} stations restent avec les autres critères.",
            ),
            fix: bloquant.pred.retirer,
          }
        : {
            title: tr("Aucune station ne remplit ces critères"),
            hint: tr(
              "La liste complète compte {total} stations françaises. Retirer un seul filtre ne suffit pas : réinitialisez tout.",
              { total: all.length },
            ),
            fix: null,
          }
      : null;

  /* ---------- Comparaison ---------- */
  // Par identifiant **résolu** : « praloup-04226 », retiré le 26 septembre
  // 2026, ouvre Praloup. Une comparaison qui portait les deux montrait deux
  // colonnes Praloup sous la même clé ; la liste, elle, ne cochait pas la
  // station affichée. Tout ce qui suit lit `cmp` et `cmpIds`, jamais `P.cmp`.
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
  /* Trois stations d'un même domaine partagent six lignes sur neuf. Les
     masquer laisse voir ce qui les sépare vraiment ; la bascule ne s'affiche
     que s'il y a quelque chose à masquer. */
  const [masquerIdentiques, setMasquerIdentiques] = useState(false);
  /* Le tableau s'insérait au-dessus de la liste et la poussait de six cents
     pixels : la vignette qu'on venait de cocher sortait de l'écran au premier
     clic. Il s'ouvre maintenant par-dessus, depuis le tiroir, et la liste ne
     bouge pas d'un pixel. */
  const [tableauOuvert, setTableauOuvert] = useState(false);
  const volet = useRef<HTMLElement>(null);
  useEchap(tableauOuvert, () => setTableauOuvert(false));
  // Identiques au texte affiché : « sans domaine alpin » et « non relevé »
  // valent tous deux null, mais ne disent pas la même chose.
  const affiche = (c: Crit, s: Station) => c.txt(s) ?? c.absent?.(s) ?? null;
  const nIdentiques =
    cmp.length > 1
      ? CRIT.filter((c) => new Set(cmp.map((s) => affiche(c, s))).size === 1).length
      : 0;
  const pickName = pickId ? stationById(pickId)?.name : "";
  const retain = (id: string) => {
    P.retain(id);
    void go("lodging");
  };

  const chips = (Object.keys(CHIPS) as ChipKey[]).map((k) => ({
    k,
    label: tr(CHIPS[k].label),
    on: !!F.chips[k],
  }));
  const seeLbl = visible.length
    ? trN(visible.length, "Voir {n} station", "Voir {n} stations")
    : tr("Aucune station : assouplir les filtres");

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
        const comparee = cmpIds.has(s.id);
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
          note: s.posRelevee ? undefined : tr("Position approximative : centre de la commune."),
        };
      }),
    // Le contenu change quand les identifiants ou la comparaison changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted.map((s) => s.id).join(","), [...cmpIds].join(",")],
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
      <main
        className={`v7main v7main--serre${cmp.length ? " v7main--tiroir" : ""}`}
        id="s-compare"
        data-screen-label="1 Comparer"
      >
        <header className="v7tete v7tete--titre">
          <span className="v7surtitre">{tr("Étape 1")}</span>
          <h1>{tr("Stations")}</h1>
        </header>

        {cmp.length && tableauOuvert ? (
          <>
            <div className="volet7__fond" onClick={() => setTableauOuvert(false)} />
            <section
              className="cmp7 cmp7--volet"
              role="dialog"
              aria-modal="true"
              aria-label={tr("Comparaison des stations")}
              ref={volet}
            >
              <div className="cmp7__tete">
                <strong>{trN(cmp.length, "{n} station comparée", "{n} stations comparées")}</strong>
                <button
                  type="button"
                  className="v7fermer"
                  aria-label={tr("Fermer la comparaison")}
                  onClick={() => setTableauOuvert(false)}
                >
                  <Icon name="croix" taille={14} />
                </button>
              </div>
            <div className="cmp7__defil">
              <table className="cmp7__table">
                <thead>
                  <tr>
                    <th className="cmp7__critere-tete">
                      {tr("Critère")}
                      {/* Le bouton rond en tête de colonne n'annonçait rien :
                          on ne comprenait qu'après l'avoir essayé qu'il
                          désigne la station qui mène aux logements. */}
                      <span>{tr("Le rond retient la station pour les logements")}</span>
                    </th>
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
                            aria-label={tr("Retenir {station} pour les logements", { station: s.name })}
                            title={tr("Retenir {station} pour les logements", { station: s.name })}
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
                            {tr("Fiche")}
                          </a>
                          <a
                            href="#"
                            className="cmp7__retirer"
                            onClick={(e) => {
                              e.preventDefault();
                              P.toggleCmp(s.id);
                            }}
                          >
                            {tr("Retirer")}
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
                    // Le gras dit « la meilleure ». Quand toutes les valeurs
                    // sont la même — trois stations d'un même domaine
                    // partagent km, remontées, forfait et couleurs — il n'y a
                    // pas de meilleure, et tout mettre en gras ne désignait
                    // plus rien.
                    const ecart = new Set(known).size > 1;
                    const best = known.length > 1 && ecart ? Math.max(...known) : null;
                    const textes = cmp.map((s) => c.txt(s));
                    const identique =
                      textes.length > 1 && new Set(cmp.map((s) => affiche(c, s))).size === 1;
                    if (identique && masquerIdentiques) return null;
                    return (
                      <tr key={c.label}>
                        <th className="cmp7__critere">
                          {tr(c.label)}
                          {c.note ? <span>{tr(c.note)}</span> : null}
                        </th>
                        {cmp.map((s, i) => {
                          const v = textes[i];
                          const sous = c.sous?.(s) ?? null;
                          const gagne = best != null && vals[i] === best;
                          return (
                            <td
                              key={s.id}
                              className={`cmp7__cell${s.id === pickId ? " cmp7__col--pick" : ""}${v == null ? " cmp7__cell--absent" : ""}${gagne ? " cmp7__cell--best" : ""}`}
                            >
                              {v ?? c.absent?.(s) ?? tr("non relevé")}
                              {v != null && c.faible?.(s) ? (
                                <>
                                  {" "}
                                  <FiabiliteFaible court raisons={c.faible(s)!} />
                                </>
                              ) : null}
                              {sous ? <span className="cmp7__sous">{sous}</span> : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr>
                    <th className="cmp7__critere">
                      {tr("Pistes par couleur")}
                      <span>{tr("OpenSkiMap, à l’échelle du domaine")}</span>
                    </th>
                    {cmp.map((s) => (
                      <td key={s.id} className={`cmp7__cell${s.id === pickId ? " cmp7__col--pick" : ""}`}>
                        <div className="cmp7__mix">
                          <PartPistes share={s.colorShare} hauteur={8} />
                          <span>
                            {s.colorShare
                              ? mixLbl(s.colorShare)
                              : (sansDomaineLbl(s) ?? mixLbl(null))}
                          </span>
                          {/* Les totaux de la fiche Skiinfo, sous la barre du
                              domaine : une autre échelle, qu'elle dit. */}
                          {lignePistes(SKIINFO[s.id]) ? <span>{lignePistes(SKIINFO[s.id])}</span> : null}
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="cmp7__pied">
              <span>
                {tr(
                  "Une valeur manquante est marquée « non relevé ». En gras : la meilleure valeur, quand les stations en annoncent de différentes.",
                )}{" "}
                {CMP_MAX === 4 ? tr("Quatre stations au plus.") : tr("{n} stations au plus.", { n: CMP_MAX })}
              </span>
              {nIdentiques ? (
                <label className="cmp7__bascule">
                  <input
                    type="checkbox"
                    checked={masquerIdentiques}
                    onChange={() => setMasquerIdentiques((v) => !v)}
                  />
                  {tr("Masquer les critères identiques ({n})", { n: nIdentiques })}
                </label>
              ) : null}
              <button
                type="button"
                className="btn7 btn7--grand"
                onClick={() => pickId && retain(pickId)}
              >
                {tr("Voir les logements {lieu}", { lieu: langue() === "en" ? (pickName ?? "") : aStation(pickName) })}
                <Icon name="fleche-droite" taille={16} />
              </button>
            </div>
            </section>
          </>
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
                placeholder={tr("Station, domaine skiable ou massif")}
                title={cqLbl}
                aria-label={tr("Chercher une station, un domaine skiable ou un massif")}
              />
              {P.q ? (
                <button
                  type="button"
                  className="filtres7__vider"
                  title={tr("Effacer la recherche")}
                  aria-label={tr("Effacer la recherche")}
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
              {tr("Filtres")}
              {preds.length ? <span className="puce__badge">{preds.length}</span> : null}
            </button>
            {filtersOpen ? (
              <div className="pop7 pop7--filtres" ref={panneau}>
                <div className="pop7__tete pop7__tete--ligne">
                  <strong>{tr("Filtres")}</strong>
                  <button type="button" className="v7fermer" aria-label={tr("Fermer")} onClick={() => setFiltersOpen(false)}>
                    <Icon name="croix" taille={14} />
                  </button>
                </div>
                {/* Les raccourcis vivent ici, comme dans la maquette : la barre
                    porte déjà le champ, le bouton Filtres, le compteur et le
                    tri, et six pastilles de plus la mettaient sur deux lignes. */}
                <div className="pop7__bloc pop7__bloc--tete">
                  <span className="v7surtitre">{tr("Raccourcis")}</span>
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
                <div className="fourchettes7">
                  {SEUILS.map((r) => (
                    <FourchetteRecherche key={r.k} r={r} />
                  ))}
                </div>
                <label className="champ7">
                  <span>{tr("Massif")}</span>
                  <select
                    className="select7 select7--champ"
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
                </label>
                <label className="champ7">
                  <span>{tr("Domaine skiable")}</span>
                  <select
                    className="select7 select7--champ"
                    value={F.dom}
                    onChange={(e) => P.setFilters({ dom: e.target.value })}
                  >
                    <option value="">{tr("Tous")}</option>
                    <option value="__none">{tr("Non renseigné")}</option>
                    {doms.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="pop7__bloc">
                  <div className="pop7__ligne">
                    <span className="pop7__stitre">{tr("Répartition par couleur")}</span>
                    <span className="segments">
                      {(Object.keys(UNITES) as ColorUnit[]).map((u) => (
                        <button
                          key={u}
                          type="button"
                          className={P.unit === u ? "on" : undefined}
                          onClick={() => P.setUnit(u)}
                        >
                          {tr(UNITES[u].lbl)}
                        </button>
                      ))}
                    </span>
                  </div>
                  <div className="pop7__deux pop7__deux--fourchettes">
                    {COLS.map((c) => (
                      <FourchetteCouleur key={c.key} c={c.key} />
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
                    {tr("Réinitialiser")}
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
                    {tr(s.label)}
                  </option>
                ))}
              </select>
              <SensTri sens={P.sortDir} alpha={P.sortKey === "n"} onChange={P.setSortDir} />
            </div>
          </div>

          {preds.length ? (
            <div className="jetons7">
              <span className="jetons7__label">{tr("Actifs")}</span>
              {preds.map((p) => {
                const bloque = empty?.fix === p.retirer;
                return (
                  <span key={p.id} className={`jeton${bloque ? " jeton--bloque" : ""}`}>
                    {p.label}
                    <button type="button" aria-label={tr("Retirer le critère {critere}", { critere: p.label })} onClick={p.retirer}>
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
                {tr("Tout réinitialiser")}
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
                {dansCadre.length > limite ? (
                  <div className="v7deux__plus">
                    <button
                      type="button"
                      className="btn7 btn7--fantome"
                      onClick={() => setLimite((n) => n + LISTE_PAS)}
                    >
                      {trN(pasSuivant, "Afficher {n} station de plus", "Afficher {n} stations de plus")}
                    </button>
                    <span>
                      {trN(reste, "{n} autre station est dans ce cadrage.", "{n} autres stations sont dans ce cadrage.")}
                    </span>
                  </div>
                ) : null}
              </>
            ) : visible.length ? (
              <Vide
                titre={tr("Aucune station dans ce cadrage")}
                actions={
                  <button type="button" className="btn7" onClick={revoirTout}>
                    {tr("Revoir tous les résultats")}
                  </button>
                }
              >
                {tr("La liste suit la carte. Dézoomez, déplacez-la, ou revenez au cadrage des résultats.")}
              </Vide>
            ) : empty ? (
              <Vide
                titre={empty.title}
                actions={
                  <>
                    {empty.fix ? (
                      <button type="button" className="btn7" onClick={empty.fix}>
                        {tr("Retirer ce filtre")}
                      </button>
                    ) : null}
                    <button type="button" className="btn7 btn7--fantome" onClick={() => P.resetFilters()}>
                      {tr("Tout réinitialiser")}
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
                        <span>{tr("Village")}</span>
                        <b className={villageLbl(st) ? undefined : "absent"}>
                          {villageLbl(st) ?? tr("non relevé")}
                        </b>
                      </div>
                      <div>
                        <span>{tr("Sommet")}</span>
                        <b className={maxM(st) != null ? undefined : "absent"}>
                          {maxM(st) != null
                            ? `${fmt(maxM(st))} m`
                            : (sansDomaineLbl(st) ?? tr("non relevé"))}
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
                    {lignePistes(SKIINFO[st.id]) ? (
                      <span className="fc__ligne">{lignePistes(SKIINFO[st.id])}</span>
                    ) : null}
                    {/* Une position posée au centre de la commune le dit : le
                        lecteur saurait sinon qu'un pin est faux sans savoir
                        lequel. */}
                    {st.posRelevee ? null : (
                      <span className="fc__ligne absent">
                        {tr("Position approximative : centre de la commune.")}
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
                const dedans = cmpIds.has(st.id);
                return (
                  <>
                    <button
                      type="button"
                      className="btn7 btn7--fantome"
                      onClick={() => void go("fiche", { id: st.id })}
                    >
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
                <>
                  <b>{trN(dansCadre.length, "{n} station dans le cadrage", "{n} stations dans le cadrage")}</b>
                  {parCadre.horsCadre.length ? (
                    <button type="button" className="carte7__revoir" onClick={revoirTout}>
                      {visible.length > 1 ? tr("Revoir les {n} résultats", { n: visible.length }) : tr("Revoir le résultat")}
                      <Icon name="fleche-droite" taille={14} />
                    </button>
                  ) : null}
                </>
              }
            />
          </div>
        </div>
      </main>

      {/* Le tiroir : il dit ce qui est coché et ouvre le tableau, sans rien
          pousser. Il ne paraît que lorsqu'il y a quelque chose à comparer. */}
      {cmp.length ? (
        <div className="tiroir7" role="region" aria-label={tr("Stations à comparer")}>
          <div className="tiroir7__dit">
            <strong>{trN(cmp.length, "{n} station sur {max}", "{n} stations sur {max}", { max: CMP_MAX })}</strong>
            <span>{cmp.map((s) => s.name).join(" · ")}</span>
          </div>
          <button type="button" className="lien-doux" onClick={() => P.clearCmp()}>
            {tr("Tout retirer")}
          </button>
          <button type="button" className="btn7" onClick={() => setTableauOuvert(true)}>
            {tr("Comparer")}
          </button>
        </div>
      ) : null}
    </Coquille>
  );
}
