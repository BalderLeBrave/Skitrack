/** Fiche station – `#s-fiche` (maquette l. 346–405 ; `renderFiche` l. 616–636).
 *  Ordre du DOM : contrat § 3.3. Données : `STATIONS`, relevé Skiinfo du dépôt,
 *  forfaits et neige des services du dépôt. Chaque chiffre porte son échelle
 *  (domaine ou station) et son origine ; un champ absent vaut « – » et le dit,
 *  un zéro mesuré reste un zéro et le dit aussi. */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useGo } from "@/components/v6/go";
import { AltitudeProfile } from "@/components/AltitudeProfile";
import { BraCard } from "@/components/BraCard";
import { ForecastCard } from "@/components/ForecastCard";
import { PhotoCredit } from "@/components/PhotoCredit";
import { SnowHistoryCard } from "@/components/SnowHistoryCard";
import { WebcamCard } from "@/components/WebcamCard";
import { MiniMap } from "@/components/v6/StationMap";
import { formatForfaitAge, forfaitConfirmLabel } from "@/lib/forfaits/age";
import { getForfait } from "@/lib/forfaits/api";
import { domainForStation } from "@/lib/forfaits/catalog";
import type { ForfaitRow } from "@/lib/forfaits/types";
import {
  COLS,
  datesLbl,
  distLbl,
  fmt,
  groupLbl,
  stationPhoto,
  stationPhotoAbsence,
  useParcours,
  useSejour,
} from "@/lib/parcours";
import { SKIINFO } from "@/lib/skiinfo";
import { getSnowPair, type SnowPair } from "@/lib/snow/api";
import { STATIONS, stationById, type Station } from "@/lib/stations";

export const Route = createFileRoute("/stations/$id")({ component: Fiche });

function Fact({ k, v }: { k: string; v: string | number | null }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd className={`rel${v == null ? " facts__none" : ""}`}>{v ?? "–"}</dd>
    </div>
  );
}

/** « 12/09 à 15:15 ». L'horodatage d'Open-Meteo est une heure locale sans
 *  fuseau : il est découpé, pas reparsé, pour ne pas la décaler. */
function relevéLe(at: string | null | undefined): string | null {
  if (!at) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(at);
  return m ? `${m[3]}/${m[2]} à ${m[4]}:${m[5]}` : at;
}

/** D'où vient le tarif affiché, et de quand. Jamais « non relevé » au-dessus
 *  d'un montant. */
function forfaitOrigine(forfait: ForfaitRow | null, domainName: string | null): string {
  if (!forfait || (forfait.j6 == null && forfait.enf6 == null)) {
    return domainName
      ? `Tarif de forfait non relevé pour ${domainName}.`
      : "Aucun domaine de forfait rattaché à cette station : pas de tarif à relever.";
  }
  const age = formatForfaitAge(forfait);
  const confirm = forfaitConfirmLabel(forfait);
  const où = domainName ? ` du forfait ${domainName}` : "";
  return `Tarif${où} : ${age}${confirm ? ` · ${confirm}` : ""}.`;
}

/** D'où vient la hauteur de neige, et ce que vaut un zéro. */
function neigeOrigine(snow: SnowPair | null, s: Station): string {
  const at = relevéLe(snow?.village.at);
  if (!snow || at == null) return "Hauteur de neige non obtenue du modèle.";
  return (
    `Neige au sol relevée le ${at} par le modèle Open-Meteo, aux altitudes demandées ` +
    `${fmt(s.villageM)} m et ${fmt(s.maxM)} m. Un zéro est ce que le modèle mesure, ` +
    `pas une valeur manquante.`
  );
}

/** Forfaits et neige : services du dépôt, valeurs relevées ou absentes. */
function useForfaitsEtNeige(s: Station) {
  const [forfait, setForfait] = useState<ForfaitRow | null>(null);
  const [snow, setSnow] = useState<SnowPair | null>(null);
  useEffect(() => {
    let cancelled = false;
    const domain = domainForStation(s.id);
    if (domain) {
      void getForfait({ data: { slug: domain.slug } })
        .then((r) => {
          if (!cancelled) setForfait(r);
        })
        .catch(() => {});
    }
    void getSnowPair({ data: { lat: s.lat, lon: s.lon, villageM: s.villageM, summitM: s.maxM } })
      .then((r) => {
        if (!cancelled) setSnow(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [s.id, s.lat, s.lon, s.villageM, s.maxM]);
  return { forfait, snow };
}

/** Identifiant qui ne désigne aucune station.
 *
 *  Rendait une coquille vide : barre de navigation, puis rien. Rien ne
 *  distinguait une adresse fautive d'un écran en panne. */
function FicheInconnue({ id }: { id: string }) {
  const go = useGo();
  return (
    <Coquille>
      <section className="screen on" id="s-fiche" data-screen-label="Fiche station">
        <div className="scroll">
          <div className="wrap fiche__wrap">
            <div className="empty card">
              <strong className="empty__title">Aucune station ne porte cet identifiant</strong>
              <p className="muted empty__lead">
                « {id} » ne figure pas au référentiel, qui compte {STATIONS.length} stations. Le
                lien est peut-être ancien, ou l’adresse mal recopiée.
              </p>
              <div className="empty__actions">
                <button type="button" className="btn" onClick={() => go("compare")}>
                  Chercher une station
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Coquille>
  );
}

function Fiche() {
  const { id } = Route.useParams();
  const s = stationById(id);
  if (!s) return <FicheInconnue id={id} />;
  return <FicheBody s={s} />;
}

function FicheBody({ s }: { s: Station }) {
  const go = useGo();
  const stationId = useParcours((x) => x.stationId);
  const cmp = useParcours((x) => x.cmp);
  const retain = useParcours((x) => x.retain);
  const toggleCmp = useParcours((x) => x.toggleCmp);
  const { checkIn, checkOut, trav, rooms, nights } = useSejour();
  const { forfait, snow } = useForfaitsEtNeige(s);
  const retained = stationId === s.id;
  const inCmp = cmp.includes(s.id);
  const src = SKIINFO[s.id]?.url ?? null;
  const photo = stationPhoto(s);
  const domain = domainForStation(s.id);
  const cm = (n: number | null | undefined) => (n == null ? null : `${fmt(n)} cm`);
  const eurTarif = (n: number | null | undefined) => (n == null ? null : `${fmt(n)} €`);

  return (
    <Coquille>
      <section className="screen on" id="s-fiche" data-screen-label="Fiche station">
        <div className="scroll">
          <div className="wrap fiche__wrap">
            <nav className="fiche__back">
              <a data-go="compare" onClick={() => go("compare")}>
                <Icon name="chevron-gauche" /> Comparer les stations
              </a>
            </nav>
            <div className="fhero">
              <ImageSlot
                id="v6-fiche-hero"
                placeholder={stationPhotoAbsence(s)}
                className="fhero__slot"
                src={photo}
              />
              <div className="fhero__veil" />
              {photo ? <PhotoCredit stationId={s.id} /> : null}
              <div className="fhero__in">
                <span className="eyebrow fhero__crumb" id="fi-crumb">
                  {s.massif} · {s.dept ?? "–"} · {s.commune ?? "–"}
                </span>
                <h1 id="fi-name">{s.name}</h1>
                <div className="chips" id="fi-tags">
                  {s.kind === "village-station" ? (
                    <span className="tag tag--snow">Village-station</span>
                  ) : null}
                  {s.domain ? (
                    <span className="tag tag--brand">
                      {s.domain}
                      {s.pistesKm != null ? ` · ${fmt(s.pistesKm)} km` : ""}
                    </span>
                  ) : (
                    <span className="tag">Domaine non renseigné</span>
                  )}
                  {!s.inClasseur ? (
                    <span className="tag tag--warn">Fiche Skiinfo, hors classeur</span>
                  ) : null}
                  {retained ? <span className="tag tag--ok">Retenue</span> : null}
                </div>
              </div>
            </div>
            <div className="fgrid">
              <div className="fiche__main">
                <dl className="facts card fi-facts" id="fi-facts">
                  <Fact
                    k="Altitude des pistes"
                    v={s.minM != null ? `${fmt(s.minM)}–${fmt(s.maxM)} m` : null}
                  />
                  <Fact k="Village" v={s.villageM != null ? fmt(s.villageM) + " m" : null} />
                  <Fact
                    k="Pistes (domaine)"
                    v={s.pistesKm != null ? fmt(s.pistesKm) + " km" : null}
                  />
                  <Fact k="Tronçons (domaine)" v={s.segments} />
                  <Fact k="Remontées (domaine)" v={s.lifts} />
                  <Fact
                    k="Piste la plus proche"
                    v={s.distToPisteKm != null ? distLbl(s.distToPisteKm) : null}
                  />
                </dl>
                {/* Les six chiffres ci-dessus n'ont pas la même échelle, et rien
                    ne le disait : seul « Pistes » portait la mention. Trois sont
                    mesurés sur le domaine et valent pour toutes ses stations,
                    trois sont propres à celle-ci. */}
                <p className="muted fi-scale">
                  Km, tronçons et remontées sont mesurés par OpenSkiMap à l’échelle du{" "}
                  <b>domaine</b> : les{" "}
                  {s.domain ? "stations qui le partagent" : "stations d’un même domaine"} portent
                  les mêmes. Altitude du village, coordonnées et distance à la piste sont propres à{" "}
                  <b>cette station</b>.
                </p>
                <section className="sect card">
                  <h2>Profil altimétrique</h2>
                  <AltitudeProfile minM={s.minM} villageM={s.villageM} maxM={s.maxM} />
                </section>
                <section className="sect card">
                  <h2>Pistes par couleur</h2>
                  <div id="fi-pistes">
                    {s.colorShare ? (
                      <div className="pistes">
                        <span className="bar pistes__bar">
                          {COLS.map((c) => (
                            <i
                              key={c.key}
                              style={{ width: `${s.colorShare![c.key]}%`, background: c.token }}
                            />
                          ))}
                        </span>
                        <div className="pistes__cols">
                          {COLS.map((c) => (
                            <div key={c.key}>
                              <span className="pistes__t">
                                <i style={{ background: c.token }} />
                                {c.label}
                              </span>
                              <b className="rel pistes__v">{s.colorShare![c.key]} %</b>
                              <span className="muted pistes__sub">
                                {s.colorCounts
                                  ? `${s.colorCounts[c.key]} tronçon${s.colorCounts[c.key] > 1 ? "s" : ""}`
                                  : ""}
                                {s.skiinfoPct ? ` · Skiinfo ${s.skiinfoPct[c.key]} %` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="muted">Répartition des pistes non relevée.</p>
                    )}
                  </div>
                  <p className="muted" id="fi-pistes-note">
                    {s.colorShare
                      ? `Parts OpenSkiMap à l'échelle du domaine${s.skiinfoPct && s.measuredAt ? ` ; répartition Skiinfo relevée le ${s.measuredAt}` : ""}.`
                      : ""}
                  </p>
                </section>
                <section className="sect card">
                  <div className="sect__row">
                    <h2>Situation</h2>
                    <span className="muted" id="fi-coords">
                      <span className="rel">
                        {s.lat.toFixed(4)}, {s.lon.toFixed(4)}
                      </span>
                    </span>
                  </div>
                  <MiniMap lat={s.lat} lon={s.lon} />
                </section>
                <section className="sect card">
                  <h2>Forfaits et neige</h2>
                  <dl className="facts facts--4">
                    <Fact k="Adulte 6 j" v={eurTarif(forfait?.j6)} />
                    <Fact k="Enfant 6 j" v={eurTarif(forfait?.enf6)} />
                    <Fact k="Neige bas" v={cm(snow?.village.snowDepthCm)} />
                    <Fact k="Neige sommet" v={cm(snow?.summit.snowDepthCm)} />
                  </dl>
                  {/* La phrase qui tenait cette place annonçait « tarifs et
                      hauteurs de neige non relevés » et « ils s'affichent
                      « – » », au-dessus de 359 € et de 0 cm. Les deux relevés
                      tournent ; ce qui manquait, c'était leur origine et leur
                      date. Un zéro de hauteur de neige en septembre est une
                      mesure, pas un trou : il faut le dire, sinon on le corrige
                      à tort. */}
                  <p className="muted fi-origin">{forfaitOrigine(forfait, domain?.name ?? null)}</p>
                  <p className="muted fi-origin">{neigeOrigine(snow, s)}</p>
                </section>
                <section className="sect card">
                  <h2>Prévision 14 jours</h2>
                  <ForecastCard
                    lat={s.lat}
                    lon={s.lon}
                    villageM={s.villageM}
                    summitM={s.maxM}
                  />
                </section>
                <section className="sect card">
                  <h2>Neige au sol, jour par jour</h2>
                  <SnowHistoryCard
                    stationId={s.id}
                    lat={s.lat}
                    lon={s.lon}
                    villageM={s.villageM}
                    summitM={s.maxM}
                  />
                </section>
                <section className="sect card">
                  <h2>Webcams</h2>
                  <WebcamCard stationId={s.id} />
                </section>
                <section className="sect card">
                  <h2>Risque d’avalanche</h2>
                  <BraCard
                    name={s.name}
                    massif={s.massif}
                    lat={s.lat}
                    lon={s.lon}
                    villageM={s.villageM}
                  />
                </section>
                <p className="muted fiche__src" id="fi-src">
                  Sources : France Montagnes (référentiel), OpenSkiMap (pistes, remontées)
                  {src ? (
                    <>
                      ,{" "}
                      <a href={src} target="_blank" rel="noopener">
                        fiche Skiinfo
                      </a>
                    </>
                  ) : null}
                  .
                </p>
              </div>
              <aside className="aside card">
                <span className="eyebrow">Votre séjour</span>
                <dl className="facts aside__facts">
                  <div className="kv">
                    <dt>Dates</dt>
                    <dd className="rel js-dates">{datesLbl(checkIn, checkOut, nights)}</dd>
                  </div>
                  <div className="kv">
                    <dt>Voyageurs</dt>
                    <dd className="rel js-group">{groupLbl(trav, rooms)}</dd>
                  </div>
                  <div className="kv">
                    <dt>Station</dt>
                    <dd id="fi-aside-name">{s.name}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="btn btn--lg btn--full"
                  id="fi-go"
                  onClick={() => {
                    retain(s.id);
                    go("lodging");
                  }}
                >
                  {retained ? "Voir les logements" : "Retenir et voir les logements"}
                </button>
                <div className="chips">
                  <button
                    type="button"
                    className={`mini${inCmp ? " mini--on" : ""}`}
                    id="fi-cmp"
                    onClick={() => toggleCmp(s.id)}
                  >
                    {inCmp ? (
                      <>
                        Dans la comparaison <Icon name="coche" />
                      </>
                    ) : (
                      <>
                        <Icon name="plus" /> Ajouter à la comparaison
                      </>
                    )}
                  </button>
                </div>
                <p className="muted aside__note">
                  Dates et groupe se modifient dans la barre du haut et suivent jusqu'à la
                  réservation.
                </p>
              </aside>
            </div>
          </div>
        </div>
      </section>
    </Coquille>
  );
}
