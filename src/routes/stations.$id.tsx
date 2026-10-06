/** Fiche station – maquette v7 (`SKITRACK v7 - App.dc.html`, bloc STATION).
 *
 *  Un bandeau photo qui dit l'essentiel, puis à gauche : forfaits, aujourd'hui
 *  aux deux altitudes, quatorze jours, pistes par couleur, webcams, bulletin
 *  d'avalanche ; à droite, le séjour et l'action. Un champ absent le dit.
 *  Données : `STATIONS`, catalogue et magasin de forfaits, Open-Meteo par le
 *  serveur du dépôt, webcams et bulletin du dépôt. */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useGo } from "@/components/v6/go";
import { PictoBra } from "@/components/v7/PictoBra";
import { PistesStation } from "@/components/v7/PistesStation";
import { OngletsStation } from "@/components/v7/OngletsStation";
import { Vide } from "@/components/v7/Vide";
import { FiabiliteFaible } from "@/components/v7/FiabiliteFaible";
import { usePrixForfait } from "@/components/v7/usePrixForfait";
import { getStationBra, getStationsBra, type BraPayload } from "@/lib/bra/api";
import { braLabel, lieuLisible } from "@/lib/bra/parse";
import { getForecastPair, type ForecastLevel, type ForecastPair, type SkyKind } from "@/lib/meteo/forecast";
import { fuseauStation, meteoEnDateDu } from "@/lib/meteo/enDateDu";
import {
  datesLbl,
  fmt,
  groupLbl,
  stationPhoto,
  stationPhotoAbsence,
  useParcours,
  useSejour,
} from "@/lib/parcours";
import { echecLbl, libellesForfait } from "@/lib/forfaits/prixSejour";
import type { Resolution } from "@/lib/forfaits/resolution";
import { montantCents } from "@/lib/devises";
import { resolveStationPhoto } from "@/lib/stationPhoto";
import { STATIONS, stationById, type Station } from "@/lib/stations";
import { stationMere, stationsVoisines, villagesDeLaStation } from "@/lib/domaineStations";
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
import { Webcams } from "@/components/v7/Webcams";
import { langueIntl } from "@/lib/i18n/langue";
import { aTraduire, langue, tr, trN } from "@/lib/i18n";

export const Route = createFileRoute("/stations/$id")({ component: Fiche });

/**
 * La mention sous des tarifs estimés.
 *
 * Jusqu'au 26 septembre 2026, la journée et le 6 jours enfant de 142 domaines
 * s'affichaient sous « Relevé le 11 août 2026 » alors que le catalogue les
 * calculait à partir du 6 jours adulte (aux Portes du Soleil, 55 € et 234 €
 * pour 292 € relevés). Ils restent affichés, pour l'ordre de grandeur, mais
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
      ? tr("Journée et forfait enfant estimés d’après le 6 jours adulte, faute de relevé.")
      : journee
        ? tr("Journée estimée d’après le 6 jours adulte, faute de relevé.")
        : tr("Forfait enfant estimé d’après le 6 jours adulte, faute de relevé.");
  const cout =
    enfant && enfantsAuTarifAdulte ? ` ${tr("Le coût du séjour compte donc les enfants au tarif adulte.")}` : "";
  return `${quoi}${cout}`;
}

/** Le prix d'une case, ou ce qui le remplace : « non communiqué », et
 *  l'estimation du catalogue quand elle existe (« ≈ 55 € », « estimé »). */
function CaseForfait({ r }: { r: Resolution | null }) {
  if (!r) return <b className="absent">{tr("non relevé")}</b>;
  if (r.statut === "resolu") return <b>{libellesForfait(r).prix}</b>;
  if (r.estimation)
    return (
      <>
        <b>≈ {montantCents(r.estimation.prix, r.estimation.devise)}</b>
        <span>{tr("estimé")}</span>
      </>
    );
  return <b className="absent">{echecLbl(r)}</b>;
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

const ICONE: Record<SkyKind, IconName> = { sun: "soleil", cloud: "nuage", snow: "neige", rain: "pluie" };

const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
function jourLbl(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // En anglais, le jour abrégé vient d'`Intl` (« Sun ») ; le français garde sa table.
  const jour =
    langue() === "en"
      ? d.toLocaleDateString(langueIntl(), { weekday: "short", timeZone: "UTC" })
      : JOURS[d.getUTCDay()];
  return `${jour} ${m[3]}`;
}

function temp(v: number | null | undefined): string {
  return v == null ? tr("non relevé") : `${Math.round(v)} °C`;
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
        <p className="wx7__msg">{tr("Prévision en cours de chargement…")}</p>
      ) : wx.status === "err" || !lvl || !j ? (
        <p className="wx7__msg">{tr("Prévision indisponible.")}</p>
      ) : (
        <>
          <div className="wx7__deux">
            <div>
              <span>{tr("Matin")}</span>
              <b>{temp(lvl.morning.temp)}</b>
            </div>
            <div>
              <span>{tr("Après-midi")}</span>
              <b>{temp(lvl.afternoon.temp)}</b>
            </div>
          </div>
          <dl className="wx7__mesures">
            <div>
              <dt>{tr("Min / max")}</dt>
              <dd>
                {j.tempMin == null || j.tempMax == null
                  ? tr("non relevé")
                  : `${Math.round(j.tempMin)} / ${Math.round(j.tempMax)} °C`}
              </dd>
            </div>
            <div>
              <dt>{tr("Vent max")}</dt>
              <dd>{j.windMaxKmh == null ? tr("non relevé") : `${Math.round(j.windMaxKmh)} km/h`}</dd>
            </div>
            <div>
              <dt>{tr("Neige 24 h")}</dt>
              <dd className={j.snowCm ? "wx7__neige" : undefined}>
                {j.snowCm == null ? tr("non relevé") : j.snowCm > 0 ? `${j.snowCm} cm` : "0 cm"}
              </dd>
            </div>
            <div>
              <dt>{tr("Pluie 24 h")}</dt>
              <dd>{j.rainMm == null ? tr("non relevé") : `${j.rainMm} mm`}</dd>
            </div>
            <div>
              <dt>{tr("Neige au sol")}</dt>
              <dd>{j.depthCm == null ? tr("non modélisée") : `${Math.round(j.depthCm)} cm`}</dd>
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
              title={d.snowCm === 0 ? tr("Pas de neige prévue") : undefined}
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

/** « rattaché par proximité » se dit : une déduction n'est pas un relevé.
 *  Traduit au rendu. */
const VOIE_LBL: Record<string, string> = {
  nom: "",
  domaine: aTraduire(" (rattachement par le domaine)"),
  proximite: aTraduire(" (rattachement par proximité)"),
};

function heureLisible(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(langueIntl(), {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Vrai quand la fin de validité du bulletin est passée. Les dates du
 *  bulletin sont à l'heure de Paris, sans fuseau : lues ici à l'heure locale,
 *  ce qui revient au même pour l'application, lancée en France. */
function echu(validUntil: string | null | undefined): boolean {
  if (!validUntil) return false;
  const t = new Date(validUntil).getTime();
  return !Number.isNaN(t) && t < Date.now();
}

/**
 * La place de la station dans son domaine, sur la fiche : de quelle station
 * elle n'est qu'un village, quels villages elle réunit, et avec quelles
 * stations son domaine skiable est relié (`domaineStations.ts`). Une
 * information seulement : chaque logement n'est listé que sous sa station
 * (`stay/rattachement.ts`), jamais sous une voisine.
 */
function RelationDomaine({ s }: { s: Station }) {
  const mere = stationMere(s.id);
  const villages = villagesDeLaStation(s.id);
  const reliees = stationsVoisines(s.id, s.domain);
  if (!mere && villages.length === 0 && reliees.length === 0) return null;
  const noms = (xs: readonly Station[]) => xs.map((x) => x.name).join(", ");
  return (
    <div className="fhero7__faits">
      {mere ? (
        <span>{tr("Village de {station} : ses logements sont listés sous la station", { station: mere.name })}</span>
      ) : null}
      {villages.length > 0 ? <span>{tr("Villages : {villages}", { villages: noms(villages) })}</span> : null}
      {reliees.length > 0 ? <span>{tr("Domaine relié avec {stations}", { stations: noms(reliees) })}</span> : null}
    </div>
  );
}

/**
 * Le bulletin d'avalanche : le pictogramme du niveau, une ligne courte, et le
 * texte du bulletin replié derrière « + ».
 *
 * Quatre états, chacun avec son titre : un niveau publié (« Risque marqué ·
 * Vanoise »), hors saison, pas de bulletin pour le massif ou la station, et le
 * bulletin non obtenu, qu'on peut redemander. Sans niveau publié, le
 * pictogramme reste gris et sans chiffre.
 */
function BulletinAvalanche({ bra, massifStation }: { bra: ReturnType<typeof useBra>; massifStation?: string }) {
  const [ouvert, setOuvert] = useState(false);
  const idTexte = useId();
  const braData = bra.etat.status === "pret" ? bra.etat.data : null;
  const official = braData?.official;
  const risque = official?.ok && official.risk != null ? official.risk : null;
  const voieFr = braData?.voie ? VOIE_LBL[braData.voie] : "";
  const voie = voieFr ? tr(voieFr) : "";

  let titre: string;
  let texte: ReactNode = null;
  let action: ReactNode = null;
  if (bra.etat.status === "chargement") {
    titre = tr("Bulletin en cours de chargement…");
  } else if (risque != null) {
    titre = `${tr("Risque {niveau}", { niveau: braLabel(risque) ?? risque })}${braData?.massif ? ` · ${braData.massif}` : ""}`;
    texte = (
      <>
        {tr("Bulletin officiel Météo-France")}
        {official?.acces === "donnees-ouvertes" ? tr(" (archive publique, data.gouv.fr)") : ""}
        {heureLisible(official?.issuedAt) ? (
          <>
            , {tr("publié le")}{" "}
            <time dateTime={official?.issuedAt ?? undefined}>{heureLisible(official?.issuedAt)}</time>
          </>
        ) : null}
        {voie}.
        {/* Un bulletin échu reste lisible, mais il le dit : l'archive publique
            peut ne rien avoir de plus récent. */}
        {echu(official?.validUntil) ? (
          <>
            {" "}
            {tr("Échu depuis le")}{" "}
            <time dateTime={official?.validUntil ?? undefined}>{heureLisible(official?.validUntil)}</time>
            {tr(", aucun bulletin plus récent n’est disponible.")}
          </>
        ) : null}
        {official?.loc1 && official.risk1 != null
          ? ` ${braLabel(official.risk1) ?? official.risk1} ${lieuLisible(official.loc1)}`
          : ""}
        {official?.loc2 && official.risk2 != null
          ? ` · ${braLabel(official.risk2) ?? official.risk2} ${lieuLisible(official.loc2)}`
          : ""}
        {official?.altitude != null ? tr(" · bascule à {altitude} m", { altitude: fmt(official.altitude) }) : ""}
      </>
    );
  } else if (braData?.etat === "ok" && official?.message) {
    titre = tr("Hors saison");
    texte = (
      <>
        {official.message} {tr("Massif Météo-France : {massif}", { massif: braData.massif ?? "" })}
        {voie}.
      </>
    );
  } else if (braData?.etat === "hors-zone") {
    titre = tr("Pas de bulletin pour ce massif");
    // La cause vient du serveur, en français : elle se réécrit ici, dans la
    // langue de l'écran, avec le massif de la station.
    texte = massifStation
      ? tr("Météo-France ne publie pas de bulletin d’avalanche pour le massif « {massif} ».", { massif: massifStation })
      : braData.cause;
  } else if (braData?.etat === "non-rattache") {
    titre = tr("Station non rattachée à un massif Météo-France");
    texte = (
      <>
        {tr("Aucun massif Météo-France ne couvre cette station.")}{" "}
        {tr("Consultez le bulletin du secteur sur le site de Météo-France.")}
      </>
    );
  } else {
    titre = tr("Bulletin non obtenu");
    action = (
      <button type="button" className="lien-doux" onClick={bra.reessayer}>
        {tr("Réessayer")}
      </button>
    );
    texte = (
      <>
        {tr("Massif Météo-France : {massif}", { massif: braData?.massif ?? tr("non rattaché") })}
        {voie}. {tr("Dernière tentative : {heure}.", { heure: heureLisible(braData?.releveA) ?? tr("à l’instant") })}
        {/* La cause technique vit dans un détail repliable, jamais dans le
            libellé principal. */}
        {braData?.cause || bra.etat.status === "echec" ? (
          <details className="bra7__detail">
            <summary>{tr("Détail technique")}</summary>
            <code>{bra.etat.status === "echec" ? bra.etat.cause : braData?.cause}</code>
          </details>
        ) : null}
      </>
    );
  }

  return (
    <section className="bra7">
      <PictoBra niveau={risque} />
      <div className="bra7__texte">
        <div className="bra7__titre">
          <strong>{titre}</strong>
          {texte ? (
            <button
              type="button"
              className="bra7__plus"
              aria-expanded={ouvert}
              aria-controls={idTexte}
              aria-label={ouvert ? tr("Masquer le texte du bulletin") : tr("Afficher le texte du bulletin")}
              onClick={() => setOuvert((o) => !o)}
            >
              <Icon name={ouvert ? "moins" : "plus"} taille={14} />
            </button>
          ) : null}
          {action}
        </div>
        {texte ? (
          <div id={idTexte} className="bra7__bulletin" hidden={!ouvert}>
            {texte}
          </div>
        ) : null}
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
        {braData?.massif ? tr("Bulletin {massif}", { massif: braData.massif }) : tr("Trouver le bulletin")}
        <Icon name="externe" taille={12} />
      </a>
    </section>
  );
}

/* ---------- Écran ---------- */

function FicheInconnue({ id }: { id: string }) {
  const go = useGo();
  return (
    <Coquille>
      <main className="v7main" id="s-fiche" data-screen-label="Fiche station">
        <Vide
          titre={tr("Station inconnue")}
          actions={
            <button type="button" className="btn7" onClick={() => void go("compare")}>
              {tr("Voir toutes les stations")}
            </button>
          }
        >
          {tr("« {id} » ne correspond à aucune des {total} stations de la liste.", { id, total: STATIONS.length })}
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
  const { checkIn, checkOut, trav, enfants, rooms, nights } = useSejour();
  const prix = usePrixForfait(s);
  const { wx, loMesure, hiMesure } = useForecast(s);
  const bra = useBra(s.id);
  const cams = useMemo(() => webcamsForStation(s.id), [s.id]);

  const retained = stationId === s.id;
  const inCmp = cmp.includes(s.id);
  const photo = stationPhoto(s);
  const pret = resolveStationPhoto(s.id);
  // L'emprunt se dit — c'est une information sur la photo affichée. Le
  // « crédit à relever » ne disait rien au lecteur : il notait un travail qui
  // reste à faire côté dépôt.
  const photoNote = photo
    ? pret?.fromName
      ? tr("Photo Skiinfo de la station {station}, même domaine", { station: pret.fromName })
      : tr("Photo Skiinfo")
    : stationPhotoAbsence(s);
  const adulte = prix.forfaits?.adulte.statut === "resolu" ? prix.forfaits.adulte : null;
  const enfant = prix.forfaits?.enfant ?? null;
  const lib = adulte ? libellesForfait(adulte) : null;
  const pass = prix.budget;
  const joursLbl = prix.jours != null ? trN(prix.jours, "{n} jour", "{n} jours") : tr("Séjour");
  // Ce que le catalogue estime sans l'avoir relevé : affiché « estimé », hors
  // du coût.
  const estimeJ1 = prix.journee?.statut !== "resolu" && !!prix.journee?.estimation;
  const estimeEnf = enfant?.statut !== "resolu" && !!enfant?.estimation;
  const note = adulte ? noteEstimation(estimeJ1, estimeEnf, pass?.enfantsAuTarifAdulte ?? false) : null;

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
          {tr("Comparer les stations")}
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
              <span>{altLbl(s) ?? tr("altitudes non relevées")}</span>
              <i>·</i>
              {/* Sans valeur, le complément ne suit pas : « km non publié de
                  pistes, domaine » ne voulait rien dire. */}
              <span>
                {kmLbl(s) ? (
                  <>
                    {kmLbl(s)}
                    <small>{tr(" de pistes, domaine")}</small>
                  </>
                ) : (
                  tr("kilomètres de pistes non publiés")
                )}
              </span>
              <i>·</i>
              <span>
                {liftsLbl(s) ? (
                  <>
                    {liftsLbl(s)}
                    <small>{trN(s.lifts ?? 0, " remontée, domaine", " remontées, domaine")}</small>
                  </>
                ) : (
                  tr("remontées non relevées")
                )}
              </span>
              <i>·</i>
              <span>{tr("Village {altitude}", { altitude: villageLbl(s) ?? tr("non relevé") })}</span>
            </div>
            <RelationDomaine s={s} />
          </div>
          <span className="fhero7__note">{photoNote}</span>
        </section>

        <div className="fgrid7">
          <div className="fgrid7__main">
            {/* ── Forfaits ─────────────────────────────────────────── */}
            <section className="carte7-sect">
              <div className="carte7-sect__tete">
                <h2>
                  {tr("Forfaits")}
                  {adulte ? ` · ${adulte.perimetre.nom}` : ""}
                </h2>
                {/* D'où vient le prix, en clair : la page officielle et sa
                    date, le catalogue et la sienne, ou l'agrégateur. */}
                <span>{lib ? lib.source : prix.pret ? tr("Aucun relevé") : tr("Lecture des tarifs…")}</span>
              </div>
              {adulte && lib ? (
                <>
                  <div className="forfaits7">
                    <div>
                      <span>{tr("Journée adulte")}</span>
                      <CaseForfait r={prix.journee} />
                    </div>
                    <div>
                      <span>{tr("{duree} adulte", { duree: joursLbl })}</span>
                      <b className="forfaits7__grand">{lib.prix}</b>
                      {/* La durée du forfait retenu, quand ce n'est pas celle
                          du séjour : six journées additionnées, ou le 6 jours
                          pour cinq jours de ski. */}
                      {lib.duree !== joursLbl ? <span className="forfaits7__herite">{lib.duree}</span> : null}
                      {lib.faible ? (
                        <FiabiliteFaible raisons={lib.raisons} />
                      ) : adulte.grille.source.origine === "officiel" ? (
                        <span className="forfaits7__releve">
                          <Icon name="coche" taille={12} />
                          {tr("Page officielle")}
                        </span>
                      ) : null}
                    </div>
                    <div>
                      <span>{tr("{duree} enfant", { duree: joursLbl })}</span>
                      <CaseForfait r={enfant} />
                      {enfant?.statut === "resolu" && enfant.drapeaux.categorieRepli ? (
                        <span className="forfaits7__herite">
                          {tr("tarif « {categorie} »", { categorie: enfant.categorie.libelle })}
                        </span>
                      ) : null}
                    </div>
                    <div>
                      <span>{tr("Saison adulte")}</span>
                      {prix.saison ? (
                        <b>{montantCents(prix.saison.prix, prix.saison.devise)}</b>
                      ) : (
                        <b className="absent">{tr("non relevé")}</b>
                      )}
                    </div>
                  </div>
                  {/* La période du prix, ses bornes de validité et le forfait
                      (station seule ou domaine relié). */}
                  <p className="forfaits7__periode">
                    <b>{lib.periode}</b>, {lib.bornes} · {lib.perimetre}
                  </p>
                </>
              ) : null}
              {note ? <p className="carte7-sect__texte">{note}</p> : null}
              {prix.pret && !adulte ? (
                <p className="carte7-sect__texte">
                  {prix.forfaits?.adulte.statut === "grille-ancienne"
                    ? tr(
                        "Forfait non publié : le dernier tarif connu a plus de trois saisons. Le coût du séjour n’inclura pas de forfait tant qu’un prix récent n’a pas été relevé ou saisi.",
                      )
                    : tr(
                        "Aucun tarif relevé pour ce domaine. Le coût du séjour n’inclura pas de forfait tant qu’un prix n’a pas été relevé ou saisi.",
                      )}
                </p>
              ) : null}
            </section>

            {/* ── Aujourd'hui ──────────────────────────────────────── */}
            <section className="sect7">
              <div className="carte7-sect__tete">
                <h2>{tr("Aujourd’hui, aux deux altitudes")}</h2>
                {wx.status === "ok" ? <span>{meteoEnDateDu(wx.at, fuseauStation(s.country))}</span> : null}
              </div>
              <div className="wx7">
                <Niveau
                  titre={tr("Bas des pistes")}
                  alt={loMesure != null ? `${fmt(loMesure)} m` : tr("altitude non relevée")}
                  wx={wx}
                  lvl={wx.status === "ok" ? wx.data.low : null}
                  haut={false}
                />
                <Niveau
                  titre={tr("Point culminant")}
                  alt={hiMesure != null ? `${fmt(hiMesure)} m` : tr("altitude non relevée")}
                  wx={wx}
                  lvl={wx.status === "ok" ? wx.data.high : null}
                  haut
                />
              </div>
            </section>

            {wx.status === "ok" && wx.data.low.days.length ? (
              <section className="carte7-sect">
                <h2>{tr("14 jours")}</h2>
                <Bande
                  titre={`${tr("Bas des pistes")} · ${loMesure != null ? `${fmt(loMesure)} m` : tr("altitude non relevée")}`}
                  lvl={wx.data.low}
                />
                <Bande
                  titre={`${tr("Point culminant")} · ${hiMesure != null ? `${fmt(hiMesure)} m` : tr("altitude non relevée")}`}
                  lvl={wx.data.high}
                />
              </section>
            ) : null}

            {/* ── Pistes ───────────────────────────────────────────── */}
            <PistesStation key={`pistes-${s.id}`} s={s} />

            {/* ── Webcams ──────────────────────────────────────────────
                Chaque section a sa propre clé : deux sœurs sous la même
                clé, React dupliquait la section webcam à chaque rendu. */}
            <Webcams key={`webcams-${s.id}`} cams={cams} />

            {/* ── Bulletin d'avalanche ─────────────────────────────── */}
            <BulletinAvalanche key={`bra-${s.id}`} bra={bra} massifStation={s.massif} />
          </div>

          <aside className="aside7">
            <span className="v7surtitre">{tr("Votre séjour ici")}</span>
            <dl className="aside7__faits">
              <div>
                <dt>{tr("Dates")}</dt>
                <dd>{datesLbl(checkIn, checkOut, nights)}</dd>
              </div>
              <div>
                <dt>{tr("Voyageurs")}</dt>
                <dd>{groupLbl(trav, rooms, enfants)}</dd>
              </div>
              <div>
                <dt>{pass?.libelle ?? tr("Forfaits")}</dt>
                <dd className={pass?.total == null ? "absent" : undefined}>
                  {pass?.total != null ? montantCents(pass.total, pass.devise) : (pass?.manque ?? tr("non relevés"))}
                  {/* Le détail et la période du forfait ; un enfant compté au
                      tarif adulte, faute de tarif enfant publié, porte sa
                      mention dans le détail. */}
                  {pass ? (
                    <span className={pass.enfantsAuTarifAdulte ? "cout7__alerte" : undefined}>
                      {pass.total == null ? tr("aucun tarif pour ce domaine") : pass.detail}
                    </span>
                  ) : null}
                  {pass?.periode ? <span>{pass.periode}</span> : null}
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
              {retained
                ? tr("Voir les logements {lieu}", { lieu: langue() === "en" ? s.name : aStation(s.name) })
                : tr("Retenir et voir les logements")}
              <Icon name="fleche-droite" taille={16} />
            </button>
            <div>
              <button
                type="button"
                className={`puce${inCmp ? " puce--on" : ""}`}
                aria-pressed={inCmp}
                onClick={() => toggleCmp(s.id)}
              >
                {inCmp ? tr("Dans la comparaison") : tr("Comparer")}
              </button>
            </div>
            <p className="aside7__note">
              {tr("Dates et voyageurs se changent dans la barre du haut et suivent jusqu’à la réservation.")}
            </p>
          </aside>
        </div>
      </main>
    </Coquille>
  );
}
