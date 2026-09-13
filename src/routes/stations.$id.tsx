/** Fiche station – maquette v7 (`SKITRACK v7 - App.dc.html`, bloc STATION).
 *
 *  Un bandeau photo qui dit l'essentiel, puis à gauche : forfaits, aujourd'hui
 *  aux deux altitudes, quatorze jours, pistes par couleur, webcams, bulletin
 *  d'avalanche ; à droite, le séjour et l'action. Chaque chiffre porte son
 *  échelle et son origine ; un champ absent le dit.
 *  Données : `STATIONS`, catalogue et magasin de forfaits, Open-Meteo par le
 *  serveur du dépôt, webcams et bulletin du dépôt. */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useGo } from "@/components/v6/go";
import { PartPistes } from "@/components/v7/PartPistes";
import { Vide } from "@/components/v7/Vide";
import { useForfait } from "@/components/v7/useForfait";
import { getStationBra, type BraPayload } from "@/lib/bra/api";
import { BRA_LABELS } from "@/lib/bra/parse";
import { getForecastPair, type ForecastLevel, type ForecastPair, type SkyKind } from "@/lib/meteo/forecast";
import {
  COLS,
  datesLbl,
  eurN,
  fmt,
  groupLbl,
  stationPhoto,
  stationPhotoAbsence,
  useParcours,
  useSejour,
} from "@/lib/parcours";
import { resolveStationPhoto } from "@/lib/stationPhoto";
import { STATIONS, stationById, type Station } from "@/lib/stations";
import { altLbl, crumb, kmLbl, liftsLbl, maxM, minM, skiinfoUrl, villageLbl, villageM } from "@/lib/v7";
import { webcamsForStation } from "@/lib/webcams";

export const Route = createFileRoute("/stations/$id")({ component: Fiche });

/* ---------- Prévision ---------- */

type Wx = { status: "loading" } | { status: "ok"; data: ForecastPair; at: Date } | { status: "err"; at: Date };

function useForecast(s: Station) {
  const [wx, setWx] = useState<Wx>({ status: "loading" });
  const lo = minM(s) ?? villageM(s) ?? 1500;
  const hi = maxM(s) ?? 2500;
  useEffect(() => {
    let cancelled = false;
    setWx({ status: "loading" });
    void getForecastPair({ data: { lat: s.lat, lon: s.lon, villageM: lo, summitM: hi } })
      .then((r) => {
        if (cancelled) return;
        setWx(r.at ? { status: "ok", data: r, at: new Date() } : { status: "err", at: new Date() });
      })
      .catch(() => {
        if (!cancelled) setWx({ status: "err", at: new Date() });
      });
    return () => {
      cancelled = true;
    };
  }, [s.lat, s.lon, lo, hi]);
  return { wx, lo, hi };
}

const heure = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const ICONE: Record<SkyKind, IconName> = { sun: "soleil", cloud: "nuage", snow: "neige", rain: "pluie" };

const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
function jourLbl(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${JOURS[d.getUTCDay()]} ${m[3]}`;
}

function temp(v: number | null | undefined): string {
  return v == null ? "non relevé" : `${Math.round(v)} °C`;
}

/** Une altitude aujourd'hui : matin, après-midi et cinq mesures du jour. */
function Niveau({ titre, alt, wx, lvl, haut }: { titre: string; alt: string; wx: Wx; lvl: ForecastLevel | null; haut: boolean }) {
  const j = lvl?.days[0];
  return (
    <div className={`wx7__niveau${haut ? " wx7__niveau--haut" : ""}`}>
      <div className="wx7__tete">
        <strong>{titre}</strong>
        <span>{alt}</span>
      </div>
      {wx.status === "loading" ? (
        <p className="wx7__msg">Prévision en cours de chargement (Open-Meteo)…</p>
      ) : wx.status === "err" || !lvl || !j ? (
        <p className="wx7__msg">
          Prévision indisponible : Open-Meteo n'a pas répondu à {heure(wx.at)}.
        </p>
      ) : (
        <>
          <div className="wx7__deux">
            <div>
              <span>Matin</span>
              <b>{temp(lvl.morning.temp)}</b>
            </div>
            <div>
              <span>Après-midi</span>
              <b>{temp(lvl.afternoon.temp)}</b>
            </div>
          </div>
          <dl className="wx7__mesures">
            <div>
              <dt>Min / max</dt>
              <dd>
                {j.tempMin == null || j.tempMax == null
                  ? "non relevé"
                  : `${Math.round(j.tempMin)} / ${Math.round(j.tempMax)} °C`}
              </dd>
            </div>
            <div>
              <dt>Vent max</dt>
              <dd>{j.windMaxKmh == null ? "non relevé" : `${Math.round(j.windMaxKmh)} km/h`}</dd>
            </div>
            <div>
              <dt>Neige 24 h</dt>
              <dd className={j.snowCm ? "wx7__neige" : undefined}>
                {j.snowCm == null ? "non relevé" : j.snowCm > 0 ? `${j.snowCm} cm` : "sec"}
              </dd>
            </div>
            <div>
              <dt>Pluie 24 h</dt>
              <dd>{j.rainMm == null ? "non relevé" : `${j.rainMm} mm`}</dd>
            </div>
            <div>
              <dt>Neige au sol</dt>
              <dd>{j.depthCm == null ? "non modélisée" : `${Math.round(j.depthCm)} cm`}</dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}

function Bande({ titre, lvl }: { titre: string; lvl: ForecastLevel }) {
  return (
    <div className="bande7">
      <strong>{titre}</strong>
      <div className="bande7__jours">
        {lvl.days.slice(0, 14).map((d) => (
          <div key={d.date} className={`bande7__jour${d.snowCm ? " bande7__jour--neige" : ""}`}>
            <span>{jourLbl(d.date)}</span>
            <Icon name={ICONE[d.kind]} taille={18} className={`bande7__ico bande7__ico--${d.kind}`} />
            <b>{d.tempMax == null ? "–" : `${Math.round(d.tempMax)}°`}</b>
            <span className={`bande7__neige${d.snowCm ? " bande7__neige--oui" : ""}`}>
              {d.snowCm == null ? "–" : d.snowCm > 0 ? `${d.snowCm} cm` : "sec"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Bulletin d'avalanche ---------- */

const enCours = new Map<string, Promise<BraPayload>>();
function useBra(s: Station) {
  const [bra, setBra] = useState<BraPayload | null>(null);
  useEffect(() => {
    let cancelled = false;
    const key = `${s.id}`;
    const p =
      enCours.get(key) ??
      getStationBra({ data: { name: s.name, massif: s.massif, lat: s.lat, lon: s.lon, villageM: villageM(s) ?? undefined } });
    enCours.set(key, p);
    void p.then((r) => {
      if (!cancelled) setBra(r);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [s]);
  return bra;
}

/* ---------- Écran ---------- */

function FicheInconnue({ id }: { id: string }) {
  const go = useGo();
  return (
    <Coquille>
      <main className="v7main" id="s-fiche" data-screen-label="Fiche station">
        <Vide
          titre="Station inconnue"
          actions={
            <button type="button" className="btn7" onClick={() => void go("compare")}>
              Voir toutes les stations
            </button>
          }
        >
          « {id} » n'est pas dans le référentiel, qui compte {STATIONS.length} stations. Rien n'est
          affiché à sa place.
        </Vide>
      </main>
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
  const forfait = useForfait(s);
  const { wx, lo, hi } = useForecast(s);
  const bra = useBra(s);
  const cams = useMemo(() => webcamsForStation(s.id), [s.id]);
  const [camId, setCamId] = useState<string | null>(null);
  const cam = cams.find((c) => c.id === camId) ?? cams[0] ?? null;

  const retained = stationId === s.id;
  const inCmp = cmp.includes(s.id);
  const photo = stationPhoto(s);
  const pret = resolveStationPhoto(s.id);
  const src = skiinfoUrl(s);
  const photoNote = photo
    ? pret?.fromName
      ? `Photo Skiinfo de ${pret.fromName}, même domaine · crédit à relever`
      : "Photo Skiinfo · crédit à relever"
    : stationPhotoAbsence(s);
  const official = bra?.official;
  const risque = official?.ok && official.risk != null ? official.risk : null;

  const passGroup = forfait?.j6 != null ? forfait.j6 * trav : null;

  return (
    <Coquille>
      <main className="v7main" id="s-fiche" data-screen-label="Fiche station">
        <a
          href="/comparer"
          className="v7retour"
          onClick={(e) => {
            e.preventDefault();
            void go("compare");
          }}
        >
          <Icon name="chevron-gauche" taille={14} />
          Comparer les stations
        </a>

        <section className={`fhero7${photo ? " fhero7--photo" : ""}`}>
          {photo ? (
            <>
              <ImageSlot shape="rect" id={`v7app-hero-${s.id}`} placeholder={stationPhotoAbsence(s)} className="fhero7__slot" src={photo} />
              <div className="fhero7__voile" />
            </>
          ) : null}
          <div className="fhero7__in">
            <span className="fhero7__crumb">{crumb(s)}</span>
            <h1>{s.name}</h1>
            <div className="fhero7__faits">
              <span>{altLbl(s) ?? "altitudes non relevées"}</span>
              <i>·</i>
              <span>
                {kmLbl(s) ?? "km non publié"}
                <small> de pistes, domaine</small>
              </span>
              <i>·</i>
              <span>
                {liftsLbl(s) ?? "nombre non relevé"}
                <small> remontées, domaine</small>
              </span>
              <i>·</i>
              <span>Village {villageLbl(s) ?? "non relevé"}</span>
            </div>
          </div>
          <span className="fhero7__note">{photoNote}</span>
        </section>

        <div className="fgrid7">
          <div className="fgrid7__main">
            {/* ── Forfaits ─────────────────────────────────────────── */}
            <section className="carte7-sect">
              <div className="carte7-sect__tete">
                <h2>Forfaits{forfait ? ` · ${forfait.zone}` : ""}</h2>
                <span>{forfait?.releveLbl ? `Relevé le ${forfait.releveLbl}` : "Aucun relevé"}</span>
              </div>
              {forfait ? (
                <div className="forfaits7">
                  <div>
                    <span>Journée adulte</span>
                    <b>{eurN(forfait.j1) ?? "non relevé"}</b>
                  </div>
                  <div>
                    <span>6 jours adulte</span>
                    <b className="forfaits7__grand">{eurN(forfait.j6)}</b>
                    {forfait.releve ? (
                      <span className="forfaits7__releve">
                        <Icon name="coche" taille={12} />
                        Prix relevé
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <span>6 jours enfant</span>
                    <b>{eurN(forfait.enf6) ?? "non relevé"}</b>
                  </div>
                  <div>
                    <span>Saison adulte</span>
                    <b>{eurN(forfait.saison) ?? "non relevé"}</b>
                  </div>
                </div>
              ) : (
                <p className="carte7-sect__texte">
                  Aucun tarif relevé pour ce domaine. Le coût du séjour n'inclura pas de forfait tant
                  qu'un prix n'a pas été relevé ou saisi.
                </p>
              )}
            </section>

            {/* ── Aujourd'hui ──────────────────────────────────────── */}
            <section className="sect7">
              <div className="carte7-sect__tete">
                <h2>Aujourd'hui, aux deux altitudes</h2>
                <span>
                  {wx.status === "ok"
                    ? `Open-Meteo, modélisé aux deux altitudes, relevé à ${heure(wx.at)}`
                    : "Open-Meteo · modélisé, pas relevé au sol"}
                </span>
              </div>
              <div className="wx7">
                <Niveau titre="Bas des pistes" alt={`${fmt(lo)} m`} wx={wx} lvl={wx.status === "ok" ? wx.data.low : null} haut={false} />
                <Niveau titre="Point culminant" alt={`${fmt(hi)} m`} wx={wx} lvl={wx.status === "ok" ? wx.data.high : null} haut />
              </div>
            </section>

            {wx.status === "ok" && wx.data.low.days.length ? (
              <section className="carte7-sect">
                <h2>14 jours</h2>
                <Bande titre={`Bas des pistes · ${fmt(lo)} m`} lvl={wx.data.low} />
                <Bande titre={`Point culminant · ${fmt(hi)} m`} lvl={wx.data.high} />
              </section>
            ) : null}

            {/* ── Pistes ───────────────────────────────────────────── */}
            <section className="carte7-sect">
              <div className="carte7-sect__tete">
                <h2>Pistes par couleur</h2>
                <span>OpenSkiMap · à l'échelle du domaine</span>
              </div>
              {s.colorShare ? (
                <>
                  <PartPistes share={s.colorShare} hauteur={12} />
                  <div className="mix7">
                    {COLS.map((c) => (
                      <div key={c.key}>
                        <span className="mix7__t">
                          <i style={{ background: c.token }} />
                          {c.label}
                        </span>
                        <b>{s.colorShare![c.key]} %</b>
                        <span className="mix7__sub">
                          {s.colorCounts ? `${s.colorCounts[c.key]} tronçons` : ""}
                          {s.colorCounts && s.skiinfoPct ? ` · Skiinfo ${s.skiinfoPct[c.key]} %` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="carte7-sect__texte carte7-sect__texte--petit">
                  Aucun tracé OpenSkiMap pour cette station : la répartition n'est pas calculée, elle
                  n'est pas estimée non plus.
                </p>
              )}
            </section>

            {/* ── Webcams ──────────────────────────────────────────── */}
            <section className="carte7-sect carte7-sect--serre">
              <div className="carte7-sect__tete">
                <h2>Webcams</h2>
                {src ? (
                  <a href={src} target="_blank" rel="noopener" className="carte7-sect__lien">
                    Fiche Skiinfo ↗
                  </a>
                ) : null}
              </div>
              {cam ? (
                <>
                  {cams.length > 1 ? (
                    <select className="select7 select7--champ" value={cam.id} onChange={(e) => setCamId(e.target.value)}>
                      {cams.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="carte7-sect__texte carte7-sect__texte--petit">{cam.label}</span>
                  )}
                  <div className="webcam7">
                    <iframe
                      key={cam.url}
                      src={cam.url}
                      title={cam.label}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      sandbox="allow-scripts allow-same-origin"
                      allowFullScreen
                    />
                  </div>
                  <p className="carte7-sect__texte carte7-sect__texte--petit">
                    Flux diffusé par l'exploitant, affiché tel quel.
                  </p>
                </>
              ) : (
                <p className="carte7-sect__texte carte7-sect__texte--petit">
                  Aucune webcam référencée pour cette station dans le référentiel.
                </p>
              )}
            </section>

            {/* ── Bulletin d'avalanche ─────────────────────────────── */}
            <section className="bra7">
              <span className={`bra7__badge${risque != null ? ` bra7__badge--${risque}` : ""}`}>
                {risque != null ? risque : "BRA"}
              </span>
              <div className="bra7__texte">
                {risque != null ? (
                  <>
                    <strong>
                      Risque {risque} · {BRA_LABELS[risque]?.fr ?? risque}
                      {bra?.massif ? ` · ${bra.massif}` : ""}
                    </strong>
                    <span>
                      Bulletin officiel Météo-France{official?.issuedAt ? `, ${official.issuedAt}` : ""}.
                      {official?.loc1 && official.risk1 != null
                        ? ` ${BRA_LABELS[official.risk1]?.fr ?? official.risk1} ${official.loc1}`
                        : ""}
                      {official?.loc2 && official.risk2 != null
                        ? ` · ${BRA_LABELS[official.risk2]?.fr ?? official.risk2} ${official.loc2}`
                        : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <strong>Bulletin d'avalanche non lu</strong>
                    <span>
                      Le niveau affiché est celui que vous aurez lu sur le bulletin officiel
                      Météo-France, daté. Rien n'est déduit.
                    </span>
                  </>
                )}
              </div>
              <a href="https://meteofrance.com/meteo-montagne" target="_blank" rel="noopener" className="btn7 btn7--fantome">
                Lire le bulletin ↗
              </a>
            </section>
          </div>

          <aside className="aside7">
            <span className="v7surtitre">Votre séjour ici</span>
            <dl className="aside7__faits">
              <div>
                <dt>Dates</dt>
                <dd>{datesLbl(checkIn, checkOut, nights)}</dd>
              </div>
              <div>
                <dt>Voyageurs</dt>
                <dd>{groupLbl(trav, rooms)}</dd>
              </div>
              <div>
                <dt>Forfaits 6 j</dt>
                <dd className={passGroup == null ? "absent" : undefined}>
                  {eurN(passGroup) ?? "non relevés"}
                  <span>
                    {forfait?.j6 != null
                      ? `${trav} × ${eurN(forfait.j6)}, calculé sur le prix relevé`
                      : "aucun tarif pour ce domaine"}
                  </span>
                </dd>
              </div>
            </dl>
            <button
              type="button"
              className="btn7 btn7--grand btn7--pleine"
              onClick={() => {
                retain(s.id);
                void go("lodging");
              }}
            >
              {retained ? `Voir les logements à ${s.name}` : "Retenir et voir les logements"}
              <Icon name="fleche-droite" taille={16} />
            </button>
            <div>
              <button
                type="button"
                className={`puce${inCmp ? " puce--on" : ""}`}
                aria-pressed={inCmp}
                onClick={() => toggleCmp(s.id)}
              >
                {inCmp ? "Dans la comparaison" : "Comparer"}
              </button>
            </div>
            <p className="aside7__note">
              Dates et voyageurs se changent dans la barre du haut et suivent jusqu'à la réservation.
            </p>
          </aside>
        </div>
      </main>
    </Coquille>
  );
}
