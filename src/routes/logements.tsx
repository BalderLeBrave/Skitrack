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
import { V6App } from "@/components/v6/App";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useGo } from "@/components/v6/go";
import { IconCheck, IconPlus } from "@/components/v6/icons";
import { LodgeCompare } from "@/components/LodgeCompare";
import { listingsForStay, type Listing } from "@/lib/listings";
import { applyFilter, droppedLabel } from "@/lib/stay/lodgingFilter";
import {
  datesLbl,
  distLbl,
  eur,
  fmt,
  groupLbl,
  stationPhoto,
  useParcours,
  useSejour,
} from "@/lib/parcours";
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

function Fact({ k, v }: { k: string; v: string | number | null }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd className={`rel${v == null ? " facts__none" : ""}`}>{v ?? "–"}</dd>
    </div>
  );
}

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

function Logements() {
  const go = useGo();
  const P = useParcours();
  const { checkIn, checkOut, trav, rooms, nights } = useSejour();
  const s = P.stationId ? stationById(P.stationId) : undefined;
  const liveListings = useStay((x) => x.liveListings);
  const liveSources = useStay((x) => x.liveSources);
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
  const { ls, dropped, distDropped } = useMemo(() => {
    const out = applyFilter(lodges, {
      travelers: trav,
      rooms: bedrooms,
      stay: { checkIn, checkOut },
      budgetMin: 0,
      budgetMax: LF.budget,
      budgetCeiling: BUDGET_MAX,
      includeUnannounced: true,
    });
    const rows = out.kept.map((l) => ({ l, total: l.total, dist: l.distToSlopesM ?? null }));
    // La distance aux pistes n'est pas dans `applyFilter` : elle vient de
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
    };
  }, [lodges, LF, trav, bedrooms, checkIn, checkOut]);

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
      <V6App>
        <section className="screen on" id="s-lodging" data-screen-label="2 Logements">
          <div className="scroll">
            <div className="wrap">
              <span className="eyebrow">Étape 2 · Logement</span>
              <h1 className="h1 h1--xl">Choisissez d’abord une station</h1>
              <div className="empty card">
                <strong className="empty__title">Aucune station retenue</strong>
                <p className="muted empty__lead">
                  Les logements sont relevés station par station, aux dates du séjour. Retenez une
                  station et sa liste s’affiche ici.
                </p>
                <div className="empty__actions">
                  <button type="button" className="btn" onClick={() => go("compare")}>
                    Comparer les stations
                  </button>
                </div>
              </div>
              <p className="muted">
                <span className="rel js-dates">{datesLbl(checkIn, checkOut, nights)}</span> ·{" "}
                <span className="rel js-group">{groupLbl(trav, rooms)}</span>
              </p>
            </div>
          </div>
        </section>
      </V6App>
    );
  }

  return (
    <V6App>
      <section className="screen on" id="s-lodging" data-screen-label="2 Logements">
        <div className="scroll">
          <div className="wrap lodging__wrap">
            <header className="lodging__head">
              <div>
                <span className="eyebrow">Étape 2 · Logement</span>
                <h1 className="h1 h1--xl lodging__title" id="lo-title">
                  Logements à {s.name}
                </h1>
                <p className="muted lodging__lead">
                  <span className="rel js-dates">{datesLbl(checkIn, checkOut, nights)}</span> ·{" "}
                  <span className="rel js-group">{groupLbl(trav, rooms)}</span> ·{" "}
                  <a id="lo-fiche" onClick={() => go("fiche", { id: s.id })}>
                    Fiche station
                  </a>
                </p>
              </div>
              <div className="lodging__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  id="lo-import"
                  onClick={() =>
                    P.say("Import JSON / lien : hors maquette (voir skitrack-annonces.json).")
                  }
                >
                  Importer une annonce
                </button>
                <button type="button" className="btn btn--ghost" id="lo-demo" disabled>
                  Charger des annonces d'exemple
                </button>
              </div>
            </header>
            <section className="ribbon card">
              <div className="ribbon__img">
                <ImageSlot
                  id="v6-ribbon"
                  placeholder="Photo"
                  className="ribbon__slot"
                  src={stationPhoto(s)}
                />
              </div>
              <div className="ribbon__body">
                <span className="muted" id="lo-crumb">
                  {s.massif} · {s.dept ?? "–"}
                  {s.domain ? ` · ${s.domain}` : ""}
                </span>
                <dl className="facts ribbon__facts" id="lo-facts">
                  <Fact
                    k="Altitude"
                    v={s.minM != null ? `${fmt(s.minM)}–${fmt(s.maxM)} m` : null}
                  />
                  <Fact
                    k="Pistes (domaine)"
                    v={s.pistesKm != null ? fmt(s.pistesKm) + " km" : null}
                  />
                  <Fact k="Remontées" v={s.lifts} />
                  <Fact
                    k="Piste la plus proche"
                    v={s.distToPisteKm != null ? distLbl(s.distToPisteKm) : null}
                  />
                </dl>
              </div>
              <a id="lo-fiche2" className="ribbon__link" onClick={() => go("fiche", { id: s.id })}>
                Fiche station →
              </a>
            </section>
            <div className="lfilters">
              <span className={`chip${LF.budget < BUDGET_MAX ? " chip--on" : ""}`} id="lf-budget">
                Budget total ·{" "}
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
                onChange={(e) => setLF({ ...LF, budget: +e.target.value })}
              />
              {/* Aucune annonce, relevée ou en direct, ne publie son type de
                  bien ni sa politique d'annulation. Ces deux commandes étaient
                  actives et vidaient la liste sans un mot dès qu'on s'en
                  servait. Elles sont désactivées et disent pourquoi. */}
              <select
                id="lf-type"
                className="lf-select"
                value=""
                disabled
                title="Aucune source ne publie le type de bien : le filtre n’aurait rien à comparer."
              >
                <option value="">Type de bien : non publié</option>
              </select>
              <span
                className={`chip${LF.near ? " chip--on" : ""}`}
                id="lf-dist"
                onClick={() => setLF({ ...LF, near: !LF.near })}
              >
                Aux pieds des pistes · 500 m
              </span>
              <span
                className="chip chip--off"
                id="lf-cancel"
                aria-disabled="true"
                title="Aucune source ne publie la politique d’annulation : le filtre n’aurait rien à comparer."
              >
                Annulation : non publiée
              </span>
              <span className="lf-spacer" />
              <span className="muted" id="lo-count">
                {lodges.length
                  ? `${ls.length} logement${ls.length > 1 ? "s" : ""} sur ${lodges.length}`
                  : ""}
              </span>
              <select
                id="lf-sort"
                className="lf-select"
                value={LF.sort}
                onChange={(e) => setLF({ ...LF, sort: e.target.value as LodgeSort })}
              >
                <option value="pp">Tri : prix par personne</option>
                <option value="total">Tri : prix total</option>
                <option value="dist">Tri : distance aux pistes</option>
                <option value="note">Tri : note</option>
              </select>
            </div>
            <p className="muted lo-rule" id="lo-rule">
              Une caractéristique que l’annonce ne publie pas ne l’écarte pas : Airbnb n’affiche
              aucune capacité sur ses vignettes, et ses annonces restent dans la liste. Une
              caractéristique publiée, elle, engage l’annonce.
              {dropped.total + distDropped > 0 ? (
                <>
                  {" "}
                  <b className="rel">
                    {droppedLabel(dropped, [
                      { singulier: "hors des 500 m", pluriel: "hors des 500 m", n: distDropped },
                    ])}
                    .
                  </b>
                </>
              ) : null}
            </p>
            <div id="lodges" className={lodges.length ? "lodges" : undefined}>
              {!lodges.length ? (
                <div className="empty card">
                  <strong className="empty__title">
                    Aucune annonce relevée pour cette station
                  </strong>
                  <p className="muted empty__lead">
                    Le relevé n'a pas tourné aux dates du séjour. Importez une annonce (JSON ou
                    lien) ou chargez des annonces d'exemple, clairement marquées comme telles.
                  </p>
                  <div className="empty__actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => document.getElementById("lo-import")?.click()}
                    >
                      Importer une annonce
                    </button>
                    <button type="button" className="btn" disabled>
                      Charger des annonces d'exemple
                    </button>
                  </div>
                </div>
              ) : ls.length ? (
                ls.map(({ l, total, dist }) => {
                  const on = P.lodgeId === l.id;
                  return (
                    <article key={l.id} className={`lodge${on ? " on" : ""}`} data-l={l.id}>
                      <div className="lodge__img">
                        <ImageSlot
                          id={`v6-l-${l.id}`}
                          placeholder="Photo de l'annonce"
                          className="lodge__slot"
                          src={l.photo}
                        />
                        <span className="tag lodge__tag--r">{l.source}</span>
                      </div>
                      <div className="lodge__body">
                        <div>
                          <strong className="lodge__name">{l.title}</strong>
                          <span className="lodge__meta">
                            {l.bedrooms != null ? <span>{l.bedrooms} ch.</span> : null}
                            {dist != null ? (
                              <span>
                                piste à <b className="rel">{distLbl(dist / 1000)}</b>
                              </span>
                            ) : null}
                          </span>
                        </div>
                        <div className="lodge__price">
                          <span>
                            <b className="rel lodge__total">{eur(total)}</b>{" "}
                            <span className="muted lodge__totalnote">total · {nights} nuits</span>
                          </span>
                          <span className="muted">
                            <b className="rel lodge__pp">{eur(total / trav)}</b> / pers.
                          </span>
                        </div>
                        <div className="lodge__actions">
                          <button
                            type="button"
                            className={`btn${on ? "" : " btn--ghost"}`}
                            data-pick={l.id}
                            onClick={() => P.chooseLodge(on ? null : l.id)}
                          >
                            {on ? (
                              <>
                                Choisi <IconCheck />
                              </>
                            ) : (
                              "Choisir ce logement"
                            )}
                          </button>
                          <button
                            type="button"
                            className={`mini${shortlist.includes(l.id) ? " mini--on" : ""}`}
                            onClick={() => toggleShort(l.id)}
                            aria-pressed={shortlist.includes(l.id)}
                          >
                            {shortlist.includes(l.id) ? (
                              <>
                                Retenu <IconCheck />
                              </>
                            ) : (
                              <>
                                <IconPlus /> Comparer
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <p className="muted lodges__empty">
                  Aucun logement ne remplit tous les critères pour ce groupe et ce budget.
                </p>
              )}
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
    </V6App>
  );
}
