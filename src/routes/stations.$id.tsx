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
import { OngletsStation } from "@/components/v7/OngletsStation";
import { Vide } from "@/components/v7/Vide";
import { useForfait } from "@/components/v7/useForfait";
import { getStationBra, getStationsBra, type BraPayload } from "@/lib/bra/api";
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
import { coutForfaits } from "@/lib/forfaits/cout";
import { resolveStationPhoto } from "@/lib/stationPhoto";
import { STATIONS, stationById, type Station } from "@/lib/stations";
import {
  altLbl,
  aStation,
  crumb,
  kmLbl,
  liftsLbl,
  maxM,
  minM,
  villageLbl,
  villageM,
} from "@/lib/v7";
import { webcamsForStation } from "@/lib/webcams";

export const Route = createFileRoute("/stations/$id")({ component: Fiche });

/**
 * La mention sous des tarifs estimés.
 *
 * Jusqu'au 26 septembre 2026, la journée et le 6 jours enfant de 142 domaines
 * s'affichaient sous « Relevé le 11 août 2026 » alors que le catalogue les
 * calculait à partir du 6 jours adulte — aux Portes du Soleil, 55 € et 234 €
 * pour 292 € relevés. Ils restent affichés, pour l'ordre de grandeur, mais
 * disent ce qu'ils sont, et que le coût du séjour ne les compte pas.
 *
 * La phrase sur le coût ne vaut que pour un groupe qui compte des enfants
 * (`enfantsAuTarifAdulte`, de `coutForfaits`) : à deux adultes, elle parlait
 * d'un enfant que personne n'emmène.
 */
function noteEstimation(journee: boolean, enfant: boolean, enfantsAuTarifAdulte: boolean): string | null {
  if (!journee && !enfant) return null;
  const quoi =
    journee && enfant
      ? "Journée et 6 jours enfant estimés"
      : journee
        ? "Journée estimée"
        : "6 jours enfant estimé";
  const cout = enfant && enfantsAuTarifAdulte ? " Le coût du séjour compte donc les enfants au tarif adulte." : "";
  return `${quoi} d’après le 6 jours adulte, faute de relevé.${cout}`;
}

/* ---------- Prévision ---------- */

type Wx = { status: "loading" } | { status: "ok"; data: ForecastPair; at: Date } | { status: "err"; at: Date };

function useForecast(s: Station) {
  const [wx, setWx] = useState<Wx>({ status: "loading" });
  // Deux altitudes à ne pas confondre : celle qu'on demande au modèle, et
  // celle qu'on écrit. Le repli est un paramètre d'appel — sans lui, la
  // prévision disparaîtrait pour la station dont l'altitude n'est pas relevée ;
  // ce n'est pas une mesure, et l'afficher revenait à écrire « Point culminant
  // 2 500 m » sous un bandeau qui dit « altitudes non relevées ». Une station
  // sur trois cent vingt est concernée, et la règle du dépôt est « rien n'est
  // estimé ».
  const loMesure = minM(s) ?? villageM(s);
  const hiMesure = maxM(s);
  const lo = loMesure ?? 1500;
  const hi = hiMesure ?? 2500;
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
  return { wx, lo, hi, loMesure, hiMesure };
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
          Prévision indisponible : Open-Meteo n’a pas répondu à {heure(wx.at)}.
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
                {j.snowCm == null ? "non relevé" : j.snowCm > 0 ? `${j.snowCm} cm` : "0 cm"}
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
            {/* Seuls les jours de précipitations portent un chiffre. « sec »
                s'écrivait vingt-huit fois sur les deux bandes, et noyait les
                trois jours où il neige. Un zéro mesuré n'est pas une valeur
                absente : il reste lisible à l'icône, et en infobulle. */}
            <span
              className={`bande7__neige${d.snowCm ? " bande7__neige--oui" : ""}`}
              title={d.snowCm === 0 ? "Pas de neige prévue" : undefined}
            >
              {d.snowCm == null ? "–" : d.snowCm > 0 ? `${d.snowCm} cm` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Bulletin d'avalanche ----------

   Trois états, et jamais un seul message pour les quatre situations. L'ancienne
   version gardait une `Map` de promesses sans horodatage ni éviction, avalait
   toute erreur dans un `catch` vide, et ne remettait pas son état à zéro en
   changeant de station : la fiche B affichait le bulletin de A. */

type EtatBraUI =
  | { status: "chargement" }
  | { status: "pret"; data: BraPayload }
  | { status: "echec"; cause: string };

/** Les demandes émises dans la même fenêtre partent en **un seul** appel :
 *  trente massifs couvrent trois cents stations, et le serveur les partage.
 *  Le lot ouvrait auparavant une requête HTTP par station — il n'en était un
 *  que de nom. */
const LOT_MS = 40;
/** Borne du validateur de `getStationsBra` : au-delà, on découpe. */
const LOT_MAX = 40;
let enAttente: { id: string; resoudre: (p: BraPayload) => void; rejeter: (e: unknown) => void }[] = [];
let minuteurLot: ReturnType<typeof setTimeout> | null = null;

function envoyer(lot: typeof enAttente): void {
  // Une station demandée deux fois ne part qu'une fois.
  const ids = [...new Set(lot.map((d) => d.id))];
  for (let i = 0; i < ids.length; i += LOT_MAX) {
    const tranche = ids.slice(i, i + LOT_MAX);
    const parts = lot.filter((d) => tranche.includes(d.id));
    void getStationsBra({ data: { ids: tranche } })
      .then((r) => {
        for (const d of parts) {
          const p = r[d.id];
          if (p) d.resoudre(p);
          else d.rejeter(new Error("Bulletin absent de la réponse groupée."));
        }
      })
      .catch((e) => parts.forEach((d) => d.rejeter(e)));
  }
}

function demanderBra(id: string, force = false): Promise<BraPayload> {
  if (force) return getStationBra({ data: { id, force: true } });
  return new Promise((resoudre, rejeter) => {
    enAttente.push({ id, resoudre, rejeter });
    minuteurLot ??= setTimeout(() => {
      const lot = enAttente;
      enAttente = [];
      minuteurLot = null;
      envoyer(lot);
    }, LOT_MS);
  });
}

function useBra(stationId: string): { etat: EtatBraUI; reessayer: () => void } {
  const [etat, setEtat] = useState<EtatBraUI>({ status: "chargement" });
  const [essai, setEssai] = useState<{ id: string; n: number }>({ id: stationId, n: 0 });
  useEffect(() => {
    let annule = false;
    // Le rafraîchissement forcé n'appartient qu'à la station où l'on a cliqué :
    // le compteur porte son identifiant, faute de quoi il restait au-dessus de
    // zéro et toutes les fiches visitées ensuite contournaient le cache serveur.
    const force = essai.id === stationId && essai.n > 0;
    // Remis à zéro en entrée : sans cela l'état survivait au changement de
    // station, et la fiche affichait le bulletin de la précédente.
    setEtat({ status: "chargement" });
    void demanderBra(stationId, force)
      .then((r) => {
        if (!annule) setEtat({ status: "pret", data: r });
      })
      .catch((e: unknown) => {
        // Journalisé par station : le `catch` vide masquait tout.
        console.warn(`[bra] ${stationId} : appel en échec`, e);
        if (!annule)
          setEtat({ status: "echec", cause: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      annule = true;
    };
  }, [stationId, essai]);
  return {
    etat,
    reessayer: () => setEssai((e) => (e.id === stationId ? { id: stationId, n: e.n + 1 } : { id: stationId, n: 1 })),
  };
}

/** « rattaché par proximité » se dit : une déduction n'est pas un relevé. */
const VOIE_LBL: Record<string, string> = {
  nom: "",
  domaine: " (rattachement par le domaine)",
  proximite: " (rattachement par proximité)",
};

function heureLisible(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
          « {id} » ne correspond à aucune des {STATIONS.length} stations de la liste.
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
  const { checkIn, checkOut, trav, adultes, enfants, rooms, nights } = useSejour();
  const forfait = useForfait(s);
  const { wx, lo, hi, loMesure, hiMesure } = useForecast(s);
  const bra = useBra(s.id);
  const cams = useMemo(() => webcamsForStation(s.id), [s.id]);
  const [camId, setCamId] = useState<string | null>(null);
  /* Un `iframe` d'un autre domaine ne signale pas son échec : `onerror` ne se
     déclenche pas, et son contenu est illisible. On l'attend donc, et faute de
     `onload` au bout de huit secondes on tient le flux pour muet. */
  const [camEtat, setCamEtat] = useState<"attente" | "ok" | "echec">("attente");
  const cam = cams.find((c) => c.id === camId) ?? cams[0] ?? null;
  const camUrl = cam?.url ?? null;
  useEffect(() => {
    if (!camUrl) return;
    setCamEtat("attente");
    const t = setTimeout(() => setCamEtat((e) => (e === "attente" ? "echec" : e)), 8000);
    return () => clearTimeout(t);
  }, [camUrl]);

  const retained = stationId === s.id;
  const inCmp = cmp.includes(s.id);
  const photo = stationPhoto(s);
  const pret = resolveStationPhoto(s.id);
  // L'emprunt se dit — c'est une information sur la photo affichée. Le
  // « crédit à relever » ne disait rien au lecteur : il notait un travail qui
  // reste à faire côté dépôt.
  const photoNote = photo
    ? pret?.fromName
      ? `Photo Skiinfo de la station ${pret.fromName}, même domaine`
      : "Photo Skiinfo"
    : stationPhotoAbsence(s);
  const braData = bra.etat.status === "pret" ? bra.etat.data : null;
  const official = braData?.official;
  const risque = official?.ok && official.risk != null ? official.risk : null;

  const pass = coutForfaits(forfait?.j6, forfait?.enf6, adultes, enfants);
  const passGroup = pass.total;
  // Ce que le catalogue estime sans l'avoir relevé : affiché « estimé », hors
  // du coût, qui ne lit que `j1` et `enf6`.
  const estimeJ1 = forfait && forfait.j1 == null ? (forfait.estime?.j1 ?? null) : null;
  const estimeEnf6 = forfait && forfait.enf6 == null ? (forfait.estime?.enf6 ?? null) : null;
  const note = forfait ? noteEstimation(estimeJ1 != null, estimeEnf6 != null, pass.enfantsAuTarifAdulte) : null;

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

        <OngletsStation s={s} actif="fiche" />

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
              {/* Sans valeur, le complément ne suit pas : « km non publié de
                  pistes, domaine » ne voulait rien dire. */}
              <span>
                {kmLbl(s) ? (
                  <>
                    {kmLbl(s)}
                    <small> de pistes, domaine</small>
                  </>
                ) : (
                  "kilomètres de pistes non publiés"
                )}
              </span>
              <i>·</i>
              <span>
                {liftsLbl(s) ? (
                  <>
                    {liftsLbl(s)}
                    <small> remontée{(s.lifts ?? 0) > 1 ? "s" : ""}, domaine</small>
                  </>
                ) : (
                  "remontées non relevées"
                )}
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
                {/* La date ne couvre que ce qui est relevé : quand la journée
                    ou l'enfant sont estimés, elle dit de quel prix elle parle. */}
                <span>
                  {forfait?.releveLbl
                    ? `${estimeJ1 != null || estimeEnf6 != null ? "6 jours adulte relevé" : "Relevé"} le ${forfait.releveLbl}`
                    : "Aucun relevé"}
                </span>
              </div>
              {forfait ? (
                <div className="forfaits7">
                  <div>
                    <span>Journée adulte</span>
                    <b>{eurN(forfait.j1) ?? (estimeJ1 != null ? `≈ ${eurN(estimeJ1)}` : "non relevé")}</b>
                    {estimeJ1 != null ? <span>estimé</span> : null}
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
                    {/* Le tarif pris au domaine qui relie la station le dit :
                        il est juste, mais ce n'est pas la station qui le
                        publie. */}
                    {forfait.heriteLbl ? (
                      <span className="forfaits7__herite">{forfait.heriteLbl}</span>
                    ) : null}
                  </div>
                  <div>
                    <span>6 jours enfant</span>
                    <b>{eurN(forfait.enf6) ?? (estimeEnf6 != null ? `≈ ${eurN(estimeEnf6)}` : "non relevé")}</b>
                    {estimeEnf6 != null ? <span>estimé</span> : null}
                  </div>
                  <div>
                    <span>Saison adulte</span>
                    <b>{eurN(forfait.saison) ?? "non relevé"}</b>
                  </div>
                </div>
              ) : null}
              {note ? <p className="carte7-sect__texte">{note}</p> : null}
              {forfait ? null : (
                <p className="carte7-sect__texte">
                  Aucun tarif relevé pour ce domaine. Le coût du séjour n’inclura pas de forfait tant
                  qu’un prix n’a pas été relevé ou saisi.
                </p>
              )}
            </section>

            {/* ── Aujourd'hui ──────────────────────────────────────── */}
            <section className="sect7">
              <div className="carte7-sect__tete">
                <h2>Aujourd’hui, aux deux altitudes</h2>
                <span>
                  {wx.status === "ok"
                    ? `Open-Meteo, modélisé à ${fmt(lo)} et ${fmt(hi)} m, consulté à ${heure(wx.at)}`
                    : "Open-Meteo · modélisé, pas relevé au sol"}
                </span>
              </div>
              <div className="wx7">
                <Niveau
                  titre="Bas des pistes"
                  alt={loMesure != null ? `${fmt(loMesure)} m` : "altitude non relevée"}
                  wx={wx}
                  lvl={wx.status === "ok" ? wx.data.low : null}
                  haut={false}
                />
                <Niveau
                  titre="Point culminant"
                  alt={hiMesure != null ? `${fmt(hiMesure)} m` : "altitude non relevée"}
                  wx={wx}
                  lvl={wx.status === "ok" ? wx.data.high : null}
                  haut
                />
              </div>
            </section>

            {wx.status === "ok" && wx.data.low.days.length ? (
              <section className="carte7-sect">
                <h2>14 jours</h2>
                <Bande
                  titre={`Bas des pistes · ${loMesure != null ? `${fmt(loMesure)} m` : "altitude non relevée"}`}
                  lvl={wx.data.low}
                />
                <Bande
                  titre={`Point culminant · ${hiMesure != null ? `${fmt(hiMesure)} m` : "altitude non relevée"}`}
                  lvl={wx.data.high}
                />
              </section>
            ) : null}

            {/* ── Pistes ───────────────────────────────────────────── */}
            <section className="carte7-sect">
              <div className="carte7-sect__tete">
                <h2>Pistes par couleur</h2>
                <span>OpenSkiMap · à l’échelle du domaine</span>
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
                          {s.colorCounts
                            ? `${s.colorCounts[c.key]} tronçon${s.colorCounts[c.key] > 1 ? "s" : ""}`
                            : ""}
                          {s.colorCounts && s.skiinfoPct ? ` · Skiinfo ${s.skiinfoPct[c.key]} %` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="carte7-sect__texte carte7-sect__texte--petit">
                  Aucun tracé OpenSkiMap pour cette station : la répartition n’est pas calculée, elle
                  n’est pas estimée non plus.
                </p>
              )}
            </section>

            {/* ── Webcams ──────────────────────────────────────────── */}
            <section className="carte7-sect carte7-sect--serre">
              <div className="carte7-sect__tete">
                <h2>Webcams</h2>
                {cams.length > 1 ? (
                  <span className="carte7-sect__texte carte7-sect__texte--petit">
                    {cams.length} caméras
                  </span>
                ) : null}
              </div>
              {cam ? (
                <>
                  {/* Le menu reste affiché même pour une seule caméra : il dit
                      laquelle on regarde, au même endroit sur toutes les
                      fiches. */}
                  <select
                    className="select7 select7--champ"
                    value={cam.id}
                    onChange={(e) => setCamId(e.target.value)}
                    disabled={cams.length < 2}
                    aria-label="Choisir une webcam"
                  >
                    {cams.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {/* Une caméra du domaine posée dans un autre village le dit.
                      La fiche de Brides-les-Bains montrait celle de Val
                      Thorens sans le préciser. */}
                  {cam.duDomaine && cam.station ? (
                    <span className="carte7-sect__texte carte7-sect__texte--petit">
                      Caméra du domaine, située {aStation(cam.station)}.
                    </span>
                  ) : null}
                  <div className="webcam7">
                    <iframe
                      key={cam.url}
                      src={cam.url}
                      title={cam.label}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      sandbox="allow-scripts allow-same-origin"
                      allowFullScreen
                      onLoad={() => setCamEtat("ok")}
                    />
                    {/* Un flux qui ne se charge pas laissait un rectangle gris
                        et rien d'autre. Un `iframe` d'un autre domaine ne dit
                        pas s'il a échoué : on l'attend, et au-delà du délai on
                        propose de l'ouvrir chez l'exploitant. */}
                    {camEtat === "echec" ? (
                      <div className="webcam7__echec">
                        <span>Le flux ne s’affiche pas ici.</span>
                        <a href={cam.url} target="_blank" rel="noopener" className="btn7 btn7--fantome">
                          Ouvrir chez l’exploitant
                          <Icon name="externe" taille={12} />
                        </a>
                      </div>
                    ) : null}
                  </div>
                  <p className="carte7-sect__texte carte7-sect__texte--petit">
                    Flux diffusé par l’exploitant, affiché tel quel.
                  </p>
                </>
              ) : (
                <p className="carte7-sect__texte carte7-sect__texte--petit">
                  Aucune webcam connue pour cette station.
                </p>
              )}
            </section>

            {/* ── Bulletin d'avalanche ───────────────────────────────
                Trois états distincts : chargement, données avec heure de
                relevé, échec avec sa cause. Aucune station ne reste sur une
                zone vide sans explication. */}
            <section className="bra7">
              <span className={`bra7__badge${risque != null ? ` bra7__badge--${risque}` : ""}`}>
                {risque != null ? risque : "BRA"}
              </span>
              <div className="bra7__texte">
                {bra.etat.status === "chargement" ? (
                  <>
                    <strong>Bulletin en cours de chargement…</strong>
                    <span>Source : Météo-France, données publiques BRA.</span>
                  </>
                ) : risque != null ? (
                  <>
                    <strong>
                      Risque {risque} · {BRA_LABELS[risque]?.fr ?? risque}
                      {braData?.massif ? ` · ${braData.massif}` : ""}
                    </strong>
                    <span>
                      Bulletin officiel Météo-France
                      {heureLisible(official?.issuedAt) ? (
                        <>
                          , publié le <time dateTime={official?.issuedAt ?? undefined}>{heureLisible(official?.issuedAt)}</time>
                        </>
                      ) : null}
                      {braData?.voie ? VOIE_LBL[braData.voie] : ""}.
                      {official?.loc1 && official.risk1 != null
                        ? ` ${BRA_LABELS[official.risk1]?.fr ?? official.risk1} ${official.loc1}`
                        : ""}
                      {official?.loc2 && official.risk2 != null
                        ? ` · ${BRA_LABELS[official.risk2]?.fr ?? official.risk2} ${official.loc2}`
                        : ""}
                      {official?.altitude != null ? ` · bascule à ${fmt(official.altitude)} m` : ""}
                    </span>
                  </>
                ) : braData?.etat === "ok" && official?.message ? (
                  <>
                    <strong>Pas de risque publié aujourd’hui</strong>
                    <span>
                      {official.message} Massif Météo-France : {braData.massif}
                      {braData.voie ? VOIE_LBL[braData.voie] : ""}.
                    </span>
                  </>
                ) : braData?.etat === "hors-zone" ? (
                  <>
                    <strong>Pas de bulletin pour ce massif</strong>
                    <span>{braData.cause} Aucun niveau de risque n’est estimé à sa place.</span>
                  </>
                ) : braData?.etat === "non-rattache" ? (
                  <>
                    <strong>Station non rattachée à un massif Météo-France</strong>
                    <span>
                      {braData.cause} Consultez le bulletin du secteur sur le site de
                      Météo-France.
                    </span>
                  </>
                ) : (
                  <>
                    <strong>Bulletin non obtenu</strong>
                    <span>
                      Massif Météo-France : {braData?.massif ?? "non rattaché"}
                      {braData?.voie ? VOIE_LBL[braData.voie] : ""}. Dernière tentative :{" "}
                      {heureLisible(braData?.releveA) ?? "à l’instant"}.{" "}
                      <button type="button" className="lien-doux" onClick={bra.reessayer}>
                        Réessayer
                      </button>
                    </span>
                    {/* La cause technique vit dans un détail repliable, jamais
                        dans le libellé principal. */}
                    {braData?.cause || bra.etat.status === "echec" ? (
                      <details className="bra7__detail">
                        <summary>Détail technique</summary>
                        <code>
                          {bra.etat.status === "echec" ? bra.etat.cause : braData?.cause}
                        </code>
                      </details>
                    ) : null}
                  </>
                )}
              </div>
              <a
                href={
                  braData?.massif
                    ? `https://meteofrance.com/meteo-montagne/${encodeURIComponent(
                        braData.massif.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s]+/g, "-"),
                      )}/bulletin-avalanches`
                    : "https://meteofrance.com/meteo-montagne"
                }
                target="_blank"
                rel="noopener"
                className="btn7 btn7--fantome"
              >
                {braData?.massif ? `Bulletin ${braData.massif}` : "Trouver le bulletin"}
                <Icon name="externe" taille={12} />
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
                <dd>{groupLbl(trav, rooms, enfants)}</dd>
              </div>
              <div>
                <dt>Forfaits 6 j</dt>
                <dd className={passGroup == null ? "absent" : undefined}>
                  {eurN(passGroup) ?? "non relevés"}
                  {/* « au tarif relevé » ne se dit que si tout l'est : un
                      enfant compté au tarif adulte, faute de tarif enfant
                      relevé, porte déjà sa mention dans le détail. */}
                  <span className={pass.enfantsAuTarifAdulte ? "cout7__alerte" : undefined}>
                    {pass.total == null
                      ? "aucun tarif pour ce domaine"
                      : pass.enfantsAuTarifAdulte
                        ? pass.detail
                        : `${pass.detail}, au tarif relevé`}
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
              {retained ? `Voir les logements ${aStation(s.name)}` : "Retenir et voir les logements"}
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
              Dates et voyageurs se changent dans la barre du haut et suivent jusqu’à la réservation.
            </p>
          </aside>
        </div>
      </main>
    </Coquille>
  );
}
