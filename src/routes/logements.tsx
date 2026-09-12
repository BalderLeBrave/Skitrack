/** Logements – `#s-lodging` (maquette l. 408–435 ; script l. 639–678).
 *  Ordre du DOM : contrat § 3.4. Données : annonces relevées du dépôt
 *  (`listingsForStay`) et recherche en direct (`searchStay`), telles que la
 *  route existante les chargeait – le code de collecte n'est pas touché.
 *
 *  La maquette fabrique six annonces d'exemple (`seedLodges`) ; rien de tel
 *  ici : un champ qu'aucune annonce ne porte (type de bien, note, avis,
 *  annulation) n'est pas affiché, comme la maquette omet elle-même les
 *  remontées ou la distance quand elles manquent. */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bouton } from "@/components/base/Bouton";
import { Etat } from "@/components/base/Etat";
import { Tableau } from "@/components/base/Tableau";
import { Carte } from "@/components/Carte";
import { Icon } from "@/components/Icon";
import { getSnowPair, type SnowPair } from "@/lib/snow/api";
import { Coquille } from "@/components/Coquille";
import { useGo } from "@/components/v6/go";
import { LodgeCompare } from "@/components/LodgeCompare";
import { listingsForStay, type Listing } from "@/lib/listings";
import { applyFilter, droppedLabel } from "@/lib/stay/lodgingFilter";
import { datesLbl, eur, fmt, groupLbl, useParcours, useSejour } from "@/lib/parcours";
import { searchStay } from "@/lib/searchStay";
import { stationById, type Station } from "@/lib/stations";
import { useStay } from "@/lib/stay";

export const Route = createFileRoute("/logements")({ component: Logements });

type LodgeSort = "pp" | "total" | "dist" | "note";

/** `LF` (l. 639). Le curseur s'arrête à 5 000 (maquette), mais cette butée
 *  vaut « tous » : aucun plafond, décision du 12 septembre 2026. */
const BUDGET_MAX = 5000;
const LF_INITIAL = {
  budget: BUDGET_MAX,
  type: "",
  near: false,
  cancel: false,
  sort: "pp" as LodgeSort,
};

/** Recherche en direct, telle que la route précédente la lançait. */
function useLiveSearch(station: Station | undefined, frozen: Listing[]) {
  const stationId = useStay((s) => s.stationId);
  const checkIn = useStay((s) => s.checkIn);
  const checkOut = useStay((s) => s.checkOut);
  const guests = useStay((s) => s.guests);
  const bedrooms = useStay((s) => s.bedrooms);
  const searchNonce = useStay((s) => s.searchNonce);
  const setLive = useStay((s) => s.setLive);
  const mergeLive = useStay((s) => s.mergeLive);
  const setSearching = useStay((s) => s.setSearching);

  useEffect(() => {
    if (!station) return;
    let cancelled = false;
    let pending = 3;
    setLive(null, [], true);
    const payload = {
      stationId,
      stationName: station.name,
      lat: station.lat,
      lon: station.lon,
      checkIn,
      checkOut,
      guests,
      bedrooms,
    };
    const finish = () => {
      pending -= 1;
      if (!cancelled && pending <= 0) setSearching(false);
    };
    const run = (part: "airbnb" | "gites" | "cozy") => {
      void searchStay({ data: { ...payload, part } })
        .then((res) => {
          if (cancelled) return;
          mergeLive(res.listings, res.sources);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const error = err instanceof Error ? err.message : String(err);
          if (part === "airbnb") {
            mergeLive(
              frozen.filter((l) => l.source === "Airbnb"),
              [{ source: "Airbnb", ok: false, count: 0, ms: 0, error }],
            );
          } else if (part === "gites") {
            mergeLive(
              frozen.filter((l) => l.source === "Gîtes de France"),
              [{ source: "Gîtes de France", ok: false, count: 0, ms: 0, error }],
            );
          } else {
            mergeLive(
              frozen.filter((l) => l.source === "Abritel" || l.source === "Booking"),
              [
                { source: "Abritel", ok: false, count: 0, ms: 0, error },
                { source: "Booking", ok: false, count: 0, ms: 0, error },
              ],
            );
          }
        })
        .finally(finish);
    };
    run("airbnb");
    run("gites");
    run("cozy");
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, checkIn, checkOut, guests, bedrooms, searchNonce, station?.name]);
}

/** La première ligne d'un message d'erreur, bornée : un échec de recherche
 *  rend parfois la trace complète d'un outil, avec ses cadres et ses conseils
 *  d'installation, qui n'ont rien à faire sur l'écran. */
function messageCourt(m: string | null | undefined): string {
  if (!m) return "sans message";
  const ligne = m.split(/\r?\n|[╔═╗║╚╝]/)[0].trim();
  return ligne.length > 140 ? `${ligne.slice(0, 137)}…` : ligne || "sans message";
}

/** Neige au sol au village et au sommet, du service du dépôt. Absente tant que
 *  rien ne répond : la bande le dit, elle n'écrit pas zéro à la place. */
function useNeige(s: Station | undefined): SnowPair | null {
  const [neige, setNeige] = useState<SnowPair | null>(null);
  useEffect(() => {
    if (!s) return;
    let annule = false;
    void getSnowPair({ data: { lat: s.lat, lon: s.lon, villageM: s.villageM, summitM: s.maxM } })
      .then((r) => {
        if (!annule) setNeige(r);
      })
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, [s]);
  return neige;
}

function Logements() {
  const go = useGo();
  const P = useParcours();
  const { checkIn, checkOut, trav, rooms, nights } = useSejour();
  const s = P.stationId ? stationById(P.stationId) : undefined;
  const liveListings = useStay((x) => x.liveListings);
  const liveSources = useStay((x) => x.liveSources);
  const searching = useStay((x) => x.searching);
  /* Les sources qui n'ont pas répondu : l'écran le dit, avec le message, au
     lieu de montrer le relevé gelé comme s'il venait d'être fait. */
  const sourcesEnEchec = liveSources.filter((x) => !x.ok);
  const bedrooms = useStay((x) => x.bedrooms);
  const frozen = useMemo(
    () => (P.stationId ? listingsForStay(P.stationId, trav, bedrooms) : []),
    [P.stationId, trav, bedrooms],
  );
  useLiveSearch(s, frozen);
  const lodges = useMemo(() => {
    if (liveListings == null) return frozen;
    const reported = new Set(liveSources.map((x) => x.source));
    return [...frozen.filter((l) => !reported.has(l.source)), ...liveListings];
  }, [liveListings, liveSources, frozen]);

  const [LF, setLF] = useState(LF_INITIAL);
  const [cmpOpen, setCmpOpen] = useState(false);
  const shortlist = useStay((x) => x.shortlist);
  const toggleShort = useStay((x) => x.toggleShort);
  /* Les annonces retenues, dans l'ordre où elles ont été cochées. Elles sont
     cherchées dans `lodges`, pas dans la liste filtrée : une annonce retenue
     puis écartée par un filtre reste comparable — sinon la comparaison se
     viderait au moindre mouvement du curseur de budget. */
  const compares = useMemo(
    () => shortlist.map((id) => lodges.find((l) => l.id === id)).filter((l): l is Listing => !!l),
    [shortlist, lodges],
  );

  /* Filtre et tri.
   *
   *  La version précédente écartait une annonce dès que `l.guests` était nul :
   *  `(l.guests ?? -1) >= trav`. Or **les 21 annonces Airbnb relevées en
   *  direct ne publient pas de capacité** — Airbnb ne l'écrit pas sur ses
   *  vignettes. Les 21 disparaissaient donc sans un mot, et l'écran affichait
   *  « 73 logements sur 94 » sans dire où étaient passés les 21 autres.
   *
   *  `applyFilter` (`stay/lodgingFilter.ts`) tient la règle : « non annoncé »
   *  n'est pas « ne convient pas ». Une capacité absente laisse passer,
   *  `includeUnannounced` le dit explicitement, et `droppedLabel` nomme ce qui
   *  a été écarté au lieu de laisser un compte inexpliqué. */
  const { ls, dropped, distDropped, autreDomaine } = useMemo(() => {
    const out = applyFilter(lodges, {
      travelers: trav,
      rooms: bedrooms,
      stay: { checkIn, checkOut },
      budgetMin: 0,
      budgetMax: LF.budget,
      budgetCeiling: BUDGET_MAX,
      includeUnannounced: true,
    });
    const tous = out.kept.map((l) => ({ l, total: l.total, dist: l.distToLiftM ?? null }));
    /* Une annonce dont le domaine le plus proche n'est pas celui-ci n'est pas un
       logement de cette station. `domainFit` rendait déjà ce verdict, mais rien
       ne s'en servait pour filtrer : une recherche en direct ramenait des biens
       à des centaines de kilomètres, que l'écran affichait avec leur distance
       au repère de la station, lue comme une distance aux pistes. Elles sont
       écartées, et comptées avec les autres exclusions plutôt que disparues. */
    const rows = tous.filter((x) => x.l.domainFit !== "other");
    const autreDomaine = tous.length - rows.length;
    // La distance aux remontées n'est pas dans `applyFilter` : elle vient de
    // l'accès calculé, pas de l'annonce. Elle se compte à part.
    const near = LF.near ? rows.filter((x) => x.dist != null && x.dist <= 500) : rows;
    const key: Record<LodgeSort, (x: { total: number; dist: number | null }) => number> = {
      pp: (x) => x.total / trav,
      total: (x) => x.total,
      dist: (x) => x.dist ?? Number.POSITIVE_INFINITY,
      note: () => 0,
    };
    return {
      ls: [...near].sort((a, b) => key[LF.sort](a) - key[LF.sort](b)),
      dropped: out.dropped,
      distDropped: rows.length - near.length,
      autreDomaine,
    };
  }, [lodges, LF, trav, bedrooms, checkIn, checkOut]);

  const [apercu, setApercu] = useState<string | null>(null);
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  const [carteOuverte, setCarteOuverte] = useState(false);
  const neige = useNeige(s);
  // Toutes les annonces ne publient pas leur position : la carte le dit plutôt
  // que de laisser croire qu'elle montre toute la liste.
  const surCarte = ls.filter(({ l }) => l.lat != null && l.lon != null).length;
  const chosen = lodges.find((l) => l.id === P.lodgeId);

  // `syncFoot` (l. 664–668)
  useEffect(() => {
    if (P.lodgeId && !chosen && lodges.length) P.chooseLodge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, lodges.length]);

  /* Sans station retenue, l'écran ne rendait qu'une `section` vide : la page
     était entièrement blanche sous la barre de navigation, alors que l'onglet
     « 2 Logements » y mène. L'étape dit maintenant ce qu'elle attend. */
  if (!s) {
    return (
      <Coquille>
        <section className="screen on" id="s-lodging" data-screen-label="2 Logements">
          <div className="scroll">
            <div className="wrap">
              <span className="eyebrow">Étape 2 · Logement</span>
              <h1 className="h1 h1--xl">Choisissez d’abord une station</h1>
              <Etat
                sorte="vide"
                titre="Aucune station retenue"
                cause="Les logements sont relevés station par station, aux dates du séjour. Retenez une station et sa liste s’affiche ici."
                action={<Bouton onClick={() => go("compare")}>Comparer les stations</Bouton>}
              />
              <p className="muted">
                <span className="rel js-dates">{datesLbl(checkIn, checkOut, nights)}</span> ·{" "}
                <span className="rel js-group">{groupLbl(trav, rooms)}</span>
              </p>
            </div>
          </div>
        </section>
      </Coquille>
    );
  }

  return (
    <Coquille>
      <section className="screen on" id="s-lodging" data-screen-label="2 Logements">
        <div className="scroll">
          <div className="wrap lodging__wrap">
            {/* Le haut de l'écran suit le commit 2d960d5 : deux lignes et un
                bandeau. Fil d'Ariane et séjour sur la première, outils sur la
                seconde, avec les filtres repliés derrière « Filtres » et la
                carte derrière « Afficher la carte ». Puis neige, remontées et
                altitudes sur une bande. Il faisait 463 px, il en fait cent. */}
            <div className="lodging__tete">
              <div className="lodging__fil">
                <span className="lodging__fil-gauche">
                  <a className="lodging__retour" onClick={() => go("compare")}>
                    <Icon name="chevron-gauche" /> Comparer
                  </a>
                  <strong className="lodging__station" id="lo-title">
                    {s.name}
                  </strong>
                  {s.minM != null ? (
                    <span className="rel muted">
                      {fmt(s.minM)} – {fmt(s.maxM)} m
                    </span>
                  ) : null}
                </span>
                <span className="lodging__fil-droite muted">
                  <span className="rel js-dates">{datesLbl(checkIn, checkOut, nights)}</span>
                  {" · "}
                  <span className="rel js-group">{groupLbl(trav, rooms)}</span>
                </span>
              </div>

              <div className="lodging__outils">
                <span className="lodging__outils-gauche">
                  <button
                    type="button"
                    className={`lodging__pli${filtresOuverts ? " lodging__pli--on" : ""}`}
                    aria-expanded={filtresOuverts}
                    aria-controls="lo-filtres"
                    onClick={() => setFiltresOuverts((v) => !v)}
                  >
                    <Icon name="chevron-droite" /> Filtres
                    {LF.budget < BUDGET_MAX || LF.near ? (
                      <span className="lodging__pli-n">
                        {(LF.budget < BUDGET_MAX ? 1 : 0) + (LF.near ? 1 : 0)}
                      </span>
                    ) : null}
                  </button>
                  <strong className="rel" id="lo-count">
                    {ls.length} logement{ls.length > 1 ? "s" : ""}
                  </strong>
                  <span className="muted">
                    prix du séjour, {nights} nuit{nights > 1 ? "s" : ""}, {trav} personne
                    {trav > 1 ? "s" : ""}
                    {dropped.total + distDropped + autreDomaine > 0 ? (
                      <>
                        {" · "}
                        {droppedLabel(dropped, [
                          {
                            singulier: "hors des 500 m",
                            pluriel: "hors des 500 m",
                            n: distDropped,
                          },
                          {
                            singulier: "d’un autre domaine",
                            pluriel: "d’un autre domaine",
                            n: autreDomaine,
                          },
                        ])}
                      </>
                    ) : null}
                  </span>
                </span>
                <span className="lodging__outils-droite">
                  <label className="lodging__tri">
                    <span className="muted">Trier</span>
                    <select
                      id="lf-sort"
                      value={LF.sort}
                      aria-label="Ordre de la liste"
                      onChange={(e) => setLF({ ...LF, sort: e.target.value as LodgeSort })}
                    >
                      <option value="pp">prix par personne</option>
                      <option value="total">prix total</option>
                      <option value="dist">distance aux remontées</option>
                      <option value="note">note</option>
                    </select>
                  </label>
                  <a
                    className="lodging__lien"
                    id="lo-import"
                    onClick={() =>
                      P.say("Import JSON / lien : hors maquette (voir skitrack-annonces.json).")
                    }
                  >
                    <Icon name="plus" /> Importer une annonce
                  </a>
                  <a
                    className={`lodging__lien lodging__lien--fiche${carteOuverte ? " lodging__lien--on" : ""}`}
                    onClick={() => setCarteOuverte((v) => !v)}
                    aria-pressed={carteOuverte}
                  >
                    {carteOuverte ? "Masquer la carte" : "Afficher la carte"}{" "}
                    <Icon name={carteOuverte ? "chevron-gauche" : "chevron-droite"} />
                  </a>
                </span>
              </div>

              {filtresOuverts ? (
                <div className="lodging__filtres" id="lo-filtres">
                  <span
                    className={`chip${LF.budget < BUDGET_MAX ? " chip--on" : ""}`}
                    id="lf-budget"
                  >
                    Budget ·{" "}
                    <b className="rel" id="lf-budget-v">
                      {LF.budget >= BUDGET_MAX ? "tous" : "≤ " + eur(LF.budget)}
                    </b>
                  </span>
                  <input
                    type="range"
                    id="lf-budget-r"
                    className="lf-range"
                    min={800}
                    max={BUDGET_MAX}
                    step={100}
                    value={LF.budget}
                    aria-label="Budget total du séjour, au maximum"
                    onChange={(e) => setLF({ ...LF, budget: +e.target.value })}
                  />
                  <button
                    type="button"
                    className={`chip${LF.near ? " chip--on" : ""}`}
                    id="lf-dist"
                    aria-pressed={LF.near}
                    onClick={() => setLF({ ...LF, near: !LF.near })}
                  >
                    À moins de 500 m d’une remontée
                  </button>
                  <span className="muted lodging__filtres-note">
                    Type de bien et annulation : aucune source ne les publie, il n’y a rien à
                    filtrer.
                  </span>
                </div>
              ) : null}

              {/* La bande de contexte du commit de référence : neige au sol, bas
                et haut, puis remontées et altitudes. Une hauteur absente est
                dite absente ; un zéro est une mesure du modèle. */}
              <div className="lodging__contexte">
                <span className="lodging__contexte-neige">
                  <b>Neige au sol</b> <span className="muted">(bas / haut)</span>{" "}
                  <span className="rel lodging__contexte-cm">
                    {neige?.village.snowDepthCm != null && neige?.summit.snowDepthCm != null
                      ? `${fmt(neige.village.snowDepthCm)} / ${fmt(neige.summit.snowDepthCm)} cm`
                      : "non relevée"}
                  </span>
                </span>
                <span className="muted rel">
                  {s.lifts != null ? `${fmt(s.lifts)} remontées` : "remontées non comptées"}
                  {s.minM != null ? ` · ${fmt(s.minM)}–${fmt(s.maxM)} m` : ""}
                  {s.pistesKm != null ? ` · ${fmt(s.pistesKm)} km de pistes` : ""}
                </span>
              </div>
            </div>

            {sourcesEnEchec.length && !searching ? (
              <Etat
                sorte="erreur"
                compact
                className="lodging__echec"
                titre={`${sourcesEnEchec.map((x) => x.source).join(", ")} : recherche en direct impossible`}
                cause={`${messageCourt(sourcesEnEchec[0].error)}. Les annonces de ${sourcesEnEchec.length > 1 ? "ces sources" : "cette source"} viennent du relevé enregistré, pas d’une recherche à vos dates.`}
              />
            ) : null}

            <div className={`lodging__duo${carteOuverte ? " lodging__duo--carte" : ""}`}>
              <div id="lodges" className="lodging__liste">
                {!lodges.length && searching ? (
                  /* La recherche en direct tourne et rien n'est encore arrivé :
                     l'écran dessine la place des annonces au lieu d'affirmer
                     qu'il n'y en a aucune. */
                  <Etat
                    sorte="chargement"
                    titre={`Recherche des annonces à ${s.name}`}
                    cause="Airbnb, Gîtes de France, Abritel et Booking sont interrogés aux dates du séjour."
                    lignes={7}
                  />
                ) : !lodges.length ? (
                  <Etat
                    sorte="vide"
                    titre="Aucune annonce relevée pour cette station"
                    cause="Le relevé n’a pas tourné aux dates du séjour, et la recherche en direct n’a rien rendu. Importez une annonce, par fichier JSON ou par lien."
                    action={
                      <Bouton
                        ton="fantome"
                        onClick={() => document.getElementById("lo-import")?.click()}
                      >
                        Importer une annonce
                      </Bouton>
                    }
                  />
                ) : ls.length ? (
                  /* Une colonne par critère de décision, la distance aux remontées
                     en premier. Elle n'est plus écrite sous le nom du logement :
                     là, elle se lisait comme une précision, pas comme le critère
                     qu'elle est, et rien ne s'alignait d'une ligne à l'autre. */
                  <Tableau
                    className="lodging__t"
                    surSurvol={setApercu}
                    colonnes={[
                      { cle: "remontee", entete: "Remontée", nombre: true },
                      { cle: "logement", entete: "Logement" },
                      { cle: "chambres", entete: "Chambres", nombre: true },
                      { cle: "capacite", entete: "Couchages", nombre: true },
                      { cle: "total", entete: "Total séjour", nombre: true },
                      { cle: "pers", entete: "Par personne", nombre: true },
                      { cle: "choix", entete: "" },
                    ]}
                    lignes={ls.map(({ l, total }) => {
                      const on = P.lodgeId === l.id;
                      return {
                        cle: l.id,
                        retenue: on,
                        cellules: {
                          remontee:
                            l.distToLiftM != null ? (
                              <>
                                <b>{fmt(Math.round(l.distToLiftM))} m</b>
                                {l.liftName ? (
                                  <span className="lodging__lift">{l.liftName}</span>
                                ) : null}
                              </>
                            ) : (
                              <span className="tableau__absence">non mesurée</span>
                            ),
                          logement: (
                            <span className="tableau__texte">
                              <b className="lodging__nom">{l.title}</b>
                              <span className="lodging__src">{l.source}</span>
                            </span>
                          ),
                          chambres: l.bedrooms,
                          capacite: l.guests,
                          total: <b>{eur(total)}</b>,
                          pers: eur(total / trav),
                          choix: (
                            <span className="lodging__actions">
                              <Bouton
                                ton={on ? "principal" : "fantome"}
                                data-pick={l.id}
                                onClick={() => P.chooseLodge(on ? null : l.id)}
                              >
                                {on ? "Choisi" : "Choisir"}
                              </Bouton>
                              <button
                                type="button"
                                className={`mini${shortlist.includes(l.id) ? " mini--on" : ""}`}
                                onClick={() => toggleShort(l.id)}
                                aria-pressed={shortlist.includes(l.id)}
                              >
                                {shortlist.includes(l.id) ? "Retenu" : "Comparer"}
                              </button>
                            </span>
                          ),
                        },
                      };
                    })}
                  />
                ) : (
                  <Etat
                    sorte="vide"
                    compact
                    titre="Aucun logement ne remplit tous les critères"
                    cause={`${lodges.length} annonce${lodges.length > 1 ? "s" : ""} relevée${lodges.length > 1 ? "s" : ""}, aucune pour ce groupe, ce budget et cette distance. Relâchez un filtre.`}
                    action={
                      <Bouton ton="fantome" onClick={() => setLF(LF_INITIAL)}>
                        Réinitialiser les filtres
                      </Bouton>
                    }
                  />
                )}
                <details className="repli lodging__regle">
                  <summary className="repli__tete">Comment la liste est filtrée</summary>
                  <div className="repli__corps">
                    <p className="muted">
                      Une caractéristique que l’annonce ne publie pas ne l’écarte pas : Airbnb
                      n’affiche aucune capacité sur ses vignettes, et ses annonces restent dans la
                      liste. Une caractéristique publiée, elle, engage l’annonce.
                    </p>
                    <p className="muted">
                      Une annonce dont le domaine le plus proche n’est pas celui-ci est écartée :
                      elle appartient à une autre station. Le compte au-dessus dit combien.
                    </p>
                  </div>
                </details>
              </div>
              {/* Marqueurs au prix : le total du séjour se lit sur la carte,
                  sans survol ni clic. */}
              {carteOuverte ? (
                <Carte
                  className="lodging__carte"
                  ajuster
                  legende={
                    surCarte === ls.length
                      ? `Les ${ls.length} logements de la liste, au total du séjour.`
                      : surCarte === 0
                        ? "Aucune annonce de la liste ne publie ses coordonnées : la carte reste vide."
                        : `${surCarte} logement${surCarte > 1 ? "s" : ""} sur ${ls.length} publie${surCarte > 1 ? "nt" : ""} ses coordonnées. Les autres ne sont pas sur la carte.`
                  }
                  epingles={ls
                    .filter(({ l }) => l.lat != null && l.lon != null)
                    .map(({ l, total }) => ({
                      id: l.id,
                      lat: l.lat as number,
                      lon: l.lon as number,
                      titre: l.title,
                      detail: l.source,
                      etiquette: eur(total),
                      sorte: "prix" as const,
                    }))}
                  selectionne={P.lodgeId}
                  survole={apercu}
                  surSurvol={setApercu}
                  surClic={(id) => P.chooseLodge(P.lodgeId === id ? null : id)}
                />
              ) : null}
            </div>
          </div>
        </div>
        {cmpOpen ? (
          <LodgeCompare
            listings={compares}
            guests={trav}
            nights={nights}
            checkIn={checkIn}
            checkOut={checkOut}
            onClose={() => setCmpOpen(false)}
            onRemove={(id) => toggleShort(id)}
          />
        ) : null}
        <div className="foot" id="lo-foot">
          <span className="muted" id="lo-foot-lbl">
            {chosen ? (
              <>
                <b className="foot__name">{chosen.title}</b> ·{" "}
                <span className="rel">{eur(chosen.total)}</span> pour {trav} voyageurs
              </>
            ) : (
              "Aucun logement choisi."
            )}
          </span>
          <span className="foot__cmp">
            {compares.length > 0 ? (
              <>
                <span className="muted">
                  {compares.length} retenu{compares.length > 1 ? "s" : ""} pour comparer
                </span>
                <button type="button" className="mini" onClick={() => setCmpOpen(true)}>
                  Comparer
                </button>
                <button
                  type="button"
                  className="mini"
                  onClick={() => {
                    for (const id of [...shortlist]) toggleShort(id);
                    setCmpOpen(false);
                  }}
                >
                  Effacer
                </button>
              </>
            ) : null}
          </span>
          <button
            type="button"
            className="btn btn--lg"
            id="lo-go"
            disabled={!chosen}
            onClick={() => go("booking")}
          >
            Passer à la réservation
          </button>
        </div>
      </section>
    </Coquille>
  );
}
