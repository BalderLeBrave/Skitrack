/** Logements – maquette v7 (`SKITRACK v7 - App.dc.html`, bloc LOGEMENTS).
 *
 *  Le bandeau de la station retenue, les règles toujours appliquées, la barre
 *  des filtres et son panneau, puis deux colonnes : les cartes d'annonce et
 *  la carte aux pastilles de prix. Un volet détaille l'annonce ouverte ; un
 *  pied fixe totalise le logement retenu et les forfaits.
 *
 *  Données : annonces relevées du dépôt (`listingsForStay`) et recherche en
 *  direct (`searchStay`), telles que la route existante les chargeait – le
 *  code de collecte n'est pas touché. « Relancer le relevé » relance cette
 *  recherche. */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useGo } from "@/components/v6/go";
import { CarteEpingles } from "@/components/v7/CarteEpingles";
import { epinglePrix, epingleRepere, ETAGE } from "@/components/v7/epingle";
import { partagerParBornes, sansPositionLabel, type Bornes } from "@/lib/carte";
import { OngletsStation } from "@/components/v7/OngletsStation";
import { Vide } from "@/components/v7/Vide";
import { useForfait } from "@/components/v7/useForfait";
import { listingsForStay, type Listing } from "@/lib/listings";
import {
  clampRayonKm,
  geoReasonFor,
  RAYON_DEFAUT_KM,
  RAYON_MAX_KM,
  RAYON_MIN_KM,
} from "@/lib/stay/lodgingFilter";
import {
  eur,
  eurCents,
  eurN,
  fmt,
  stationPhoto,
  stationPhotoAbsence,
  useParcours,
  useSejour,
} from "@/lib/parcours";
import { searchStay } from "@/lib/searchStay";
import { stationById, type Station } from "@/lib/stations";
import { useStay } from "@/lib/stay";
import { availabilityLabel, availabilityOf } from "@/lib/stay/availability";
import { altLbl, bedLbl, capLbl, crumb, distanceOf, firmOf, kmLbl, liftsLbl, mediaTon, passLbl } from "@/lib/v7";

export const Route = createFileRoute("/logements")({ component: Logements });

type LodgeSort = "pp" | "total" | "cap";

/** `lf` de la maquette : les filtres facultatifs de **cet écran**.
 *
 *  Le budget n'y est plus : c'est un critère de recherche, au même titre que
 *  les dates et les voyageurs. Il vit dans `useParcours.filters.budget`, d'où
 *  il survit à la navigation et s'écrit dans l'adresse ; les réglages
 *  ci-dessous, eux, ne valent que pour la liste des annonces. */
type LF = {
  pp: number;
  cap: number;
  rooms: number;
  dist: number;
  src: Record<string, boolean>;
  /** Rayon de recherche autour de la station, en km. Toujours appliqué. */
  rayon: number;
  measured: boolean;
  link: boolean;
  photo: boolean;
  firm: boolean;
  pos: boolean;
};
const LF0: LF = { pp: 0, cap: 0, rooms: 0, dist: 0, src: {}, rayon: RAYON_DEFAUT_KM, measured: false, link: false, photo: false, firm: false, pos: false };

/** Le budget est à part : il est lu et écrit sur le magasin partagé. */
const BUDGET = { label: "Total du séjour, au plus", max: 6000, step: 250, unit: "€", sign: "≤ " };

const RANGES: { k: "pp" | "cap" | "rooms" | "dist"; label: string; max: number; step: number; unit: string; sign: string }[] = [
  { k: "pp", label: "Par personne, au plus", max: 800, step: 25, unit: "€", sign: "≤ " },
  { k: "cap", label: "Capacité annoncée, au moins", max: 16, step: 1, unit: "pers.", sign: "≥ " },
  { k: "rooms", label: "Chambres annoncées, au moins", max: 7, step: 1, unit: "ch.", sign: "≥ " },
  { k: "dist", label: "Distance à une remontée, au plus", max: 2000, step: 100, unit: "m", sign: "≤ " },
];

/** Recherche en direct, telle que la route précédente la lançait. */
function useLiveSearch(station: Station | undefined, frozen: Listing[]) {
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
    let pending = 4;
    setLive(null, [], true);
    const payload = {
      // L'identifiant vient de la station qu'on affiche, pas du magasin de
      // séjour. Les deux devraient dire la même chose et le disent presque
      // toujours ; quand ils divergent, le serveur mesurait l'accès depuis une
      // autre station — vu en recette : une recherche « Les 2 Alpes » rendue
      // avec le repère de Brides les Bains, à 60 km, donc 92 annonces sur 96
      // classées « autre domaine ».
      stationId: station.id,
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
    const run = (part: "airbnb" | "gites" | "cozy" | "centrales") => {
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
          } else if (part === "centrales") {
            mergeLive(
              frozen.filter((l) => l.source === "Centrale"),
              [{ source: "Centrale", ok: false, count: 0, ms: 0, error }],
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
    // La centrale officielle de la station. Elle part en même temps que les
    // plateformes et n'attend rien d'elles : une centrale lente ne doit pas
    // retarder la liste, et une centrale muette ne doit pas la vider.
    run("centrales");
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station?.id, checkIn, checkOut, guests, bedrooms, searchNonce]);
}

type Pred = { id: string; label: string; fn: (l: Listing) => boolean; fixed?: boolean; remove?: () => void };

function Logements() {
  const go = useGo();
  const P = useParcours();
  const { checkIn, checkOut, trav, rooms, nights } = useSejour();
  const s = P.stationId ? stationById(P.stationId) : undefined;
  const forfait = useForfait(s);
  const liveListings = useStay((x) => x.liveListings);
  const liveSources = useStay((x) => x.liveSources);
  const searching = useStay((x) => x.searching);
  const setStay = useStay((x) => x.setStay);
  // Le relevé entier de la station : la capacité s'applique plus bas, en
  // toutes lettres, pour que l'état vide puisse dire ce qu'elle a écarté.
  const frozen = useMemo(() => (P.stationId ? listingsForStay(P.stationId, 1, 0) : []), [P.stationId]);
  useLiveSearch(s, frozen);
  const raw = useMemo(() => {
    if (liveListings == null) return frozen;
    const reported = new Set(liveSources.map((x) => x.source));
    return [...frozen.filter((l) => !reported.has(l.source)), ...liveListings];
  }, [liveListings, liveSources, frozen]);

  const [lf, setLf] = useState<LF>(LF0);
  const [lsort, setLsort] = useState<LodgeSort>("pp");
  const [lfOpen, setLfOpen] = useState(false);
  const [sheetId, setSheetId] = useState<string | null>(null);
  // Le cadre de la carte, et s'il compte. Décoché par défaut : sinon un simple
  // coup d'œil ailleurs efface la liste qu'on venait de constituer.
  // Le cadre visible compte toujours : liste, compteur et pastilles rendues
  // disent la même chose. Même correction que sur Comparer.
  const [bornes, setBornes] = useState<Bornes | null>(null);
  // L'annonce que la carte désigne, et que la liste éclaire en retour.
  const [actifCarte, setActifCarte] = useState<string | null>(null);
  const patchLf = (p: Partial<LF>) => setLf((x) => ({ ...x, ...p }));
  // Le budget du séjour : critère partagé, pas un réglage de cet écran.
  const budget = P.filters.budget;
  /** « Tout réinitialiser » relâche les réglages de l'écran **et** le budget,
   *  qui n'est plus rangé avec eux. */
  const reinitialiser = () => {
    setLf(LF0);
    P.setFilters({ budget: 0 });
  };

  const stay = { checkIn, checkOut };

  // Sans station retenue : la maquette renvoie vers Comparer avec le bandeau.
  // L'état est relu dans le magasin : au premier rendu du navigateur, le
  // sélecteur sert encore l'instantané du serveur, où rien n'est retenu.
  useEffect(() => {
    if (!useParcours.getState().stationId) {
      P.say("Retenez d’abord une station.");
      void go("compare");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.id]);

  const relancer = () => setStay({ searchNonce: Date.now() });
  const importer = () => P.say("Import d’annonce par son lien : hors de cet écran pour l’instant.");

  if (!s) {
    return (
      <Coquille>
        <main className="v7main" id="s-lodging" data-screen-label="2 Logements" />
      </Coquille>
    );
  }

  /* ---------- Prédicats ---------- */
  const lp: Pred[] = [];
  lp.push({ id: "cap", label: `Capacité ≥ ${trav}`, fn: (l) => l.guests == null || l.guests >= trav, fixed: true });
  if (rooms)
    lp.push({ id: "rooms", label: `Chambres ≥ ${rooms}`, fn: (l) => l.bedrooms == null || l.bedrooms >= rooms, fixed: true });
  // La zone est toujours appliquée : une recherche de logements a toujours un
  // périmètre. Son rayon se règle dans le panneau, il ne se retire pas.
  lp.push({
    id: "zone",
    label: `Dans ${lf.rayon} km`,
    fn: (l) => geoReasonFor(l, lf.rayon) == null,
    fixed: true,
  });
  if (budget)
    lp.push({
      id: "budget",
      label: `Total ≤ ${fmt(budget)} €`,
      fn: (l) => l.total <= budget,
      remove: () => P.setFilters({ budget: 0 }),
    });
  if (lf.pp) lp.push({ id: "pp", label: `≤ ${fmt(lf.pp)} € / pers.`, fn: (l) => l.total / trav <= lf.pp, remove: () => patchLf({ pp: 0 }) });
  if (lf.cap) lp.push({ id: "lcap", label: `Capacité annoncée ≥ ${lf.cap}`, fn: (l) => l.guests != null && l.guests >= lf.cap, remove: () => patchLf({ cap: 0 }) });
  if (lf.rooms) lp.push({ id: "lrooms", label: `Chambres annoncées ≥ ${lf.rooms}`, fn: (l) => l.bedrooms != null && l.bedrooms >= lf.rooms, remove: () => patchLf({ rooms: 0 }) });
  if (lf.dist) lp.push({ id: "dist", label: `≤ ${fmt(lf.dist)} m d'une remontée`, fn: (l) => l.distToLiftM != null && l.distToLiftM <= lf.dist, remove: () => patchLf({ dist: 0 }) });
  const srcOn = Object.keys(lf.src).filter((k) => lf.src[k]);
  if (srcOn.length) lp.push({ id: "src", label: srcOn.join(" · "), fn: (l) => srcOn.includes(l.source), remove: () => patchLf({ src: {} }) });
  if (lf.measured) lp.push({ id: "measured", label: "Distance mesurée", fn: (l) => distanceOf(l).kind === "measured", remove: () => patchLf({ measured: false }) });
  if (lf.link) lp.push({ id: "link", label: "Lien de réservation", fn: (l) => !!l.url, remove: () => patchLf({ link: false }) });
  if (lf.photo) lp.push({ id: "photo", label: "Avec photo", fn: (l) => !!l.photo, remove: () => patchLf({ photo: false }) });
  if (lf.firm) lp.push({ id: "firm", label: "Prix relevé aux dates", fn: (l) => firmOf(l, stay), remove: () => patchLf({ firm: false }) });
  if (lf.pos) lp.push({ id: "pos", label: "Position connue", fn: (l) => l.lat != null, remove: () => patchLf({ pos: false }) });

  const lapply = (ps: Pred[]) => raw.filter((l) => ps.every((p) => p.fn(l)));
  const tri: Record<LodgeSort, (a: Listing, b: Listing) => number> = {
    pp: (a, b) => a.total - b.total,
    total: (a, b) => a.total - b.total,
    cap: (a, b) => (b.guests ?? 0) - (a.guests ?? 0),
  };
  const lvis = lapply(lp).sort(tri[lsort]);
  // Ce que la carte montre. Les annonces sans coordonnées restent : elles n'ont
  // pas de cadre, la carte ne peut ni les montrer ni les cacher.
  const parCadre = partagerParBornes(lvis, bornes);
  const affichees = parCadre.visibles;
  const sansPos = sansPositionLabel(parCadre.sansPosition.length);
  const lfree = lp.filter((p) => !p.fixed);
  // Ce que la zone seule a écarté, nommé par motif : une liste courte sans
  // explication se lit comme un relevé pauvre, pas comme un filtre qui a joué.
  const horsZone = raw.filter((l) => geoReasonFor(l, lf.rayon) === "hors-zone").length;
  const autreDomaine = raw.filter((l) => geoReasonFor(l, lf.rayon) === "autre-domaine").length;
  const zoneLbl = [
    horsZone ? `${horsZone} hors de la zone` : null,
    autreDomaine ? `${autreDomaine} sur ${autreDomaine > 1 ? "d’autres domaines" : "un autre domaine"}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  // Ce que la centrale officielle a répondu quand elle n'a rien rendu. Le
  // serveur envoie la phrase toute faite : station sans centrale relevée,
  // centrale sans connecteur, connecteur qui sait déjà qu'il ne peut pas, ou
  // appel échoué. Un zéro sans motif se lirait comme « rien de disponible ».
  const centrale = liveSources.find((x) => x.source === "Centrale");
  const centraleLbl = centrale && centrale.count === 0 ? (centrale.error ?? null) : null;
  const kept = raw.find((l) => l.id === P.lodgeId) ?? null;
  const passGroupN = forfait?.j6 != null ? forfait.j6 * trav : 0;
  const totalN = (kept?.total ?? 0) + passGroupN;

  let lempty: { title: string; hint: string; fix: (() => void) | null } | null = null;
  if (raw.length && !lvis.length) {
    let best: { p: Pred; n: number } | null = null;
    for (const p of lfree) {
      const n = lapply(lp.filter((x) => x !== p)).length;
      if (!best || n > best.n) best = { p, n };
    }
    lempty =
      best && best.n > 0
        ? {
            title: `Le filtre « ${best.p.label} » ne laisse aucune annonce`,
            hint: `Sans lui, ${best.n} annonce${best.n > 1 ? "s" : ""} rest${best.n > 1 ? "ent" : "e"} pour ${trav} personnes.`,
            fix: best.p.remove ?? null,
          }
        : {
            title: `Aucune annonce pour ${trav} personnes${rooms ? ` et ${rooms} chambres` : ""}`,
            hint: `Le relevé compte ${raw.length} annonces ; la plus grande annonce sa capacité à ${Math.max(...raw.map((l) => l.guests ?? 0))} personnes. Réduisez le groupe ou attendez un nouveau relevé.`,
            fix: null,
          };
  }

  const sources = [...new Set(raw.map((l) => l.source))];
  const bySrc = (src: string) => raw.filter((l) => l.source === src).length;
  const toggles: { k: "measured" | "pos" | "link" | "photo" | "firm"; label: string; n: number }[] = [
    { k: "measured", label: "Distance mesurée", n: raw.filter((l) => distanceOf(l).kind === "measured").length },
    { k: "pos", label: "Position connue", n: raw.filter((l) => l.lat != null).length },
    { k: "link", label: "Lien de réservation", n: raw.filter((l) => l.url).length },
    { k: "photo", label: "Avec photo", n: raw.filter((l) => l.photo).length },
    { k: "firm", label: "Prix relevé aux dates", n: raw.filter((l) => firmOf(l, stay)).length },
  ];

  const openSheet = (id: string) => {
    P.markSeen(id);
    setSheetId(id);
  };
  const keep = (id: string) => P.chooseLodge(P.lodgeId === id ? null : id);
  const sheet = sheetId ? (raw.find((l) => l.id === sheetId) ?? null) : null;

  const marqueurs = [
    {
      id: "__station",
      lat: s.lat,
      lon: s.lon,
      nom: `Repère de ${s.name}`,
      epingle: epingleRepere(s.name),
      zIndex: ETAGE.repere,
      inerte: true,
    },
    ...lvis
      .filter((l) => l.lat != null && l.lon != null)
      .map((l) => {
        const sel = sheetId === l.id || P.lodgeId === l.id;
        const etat = sel ? "retenue" : P.seen[l.id] ? "vue" : "normale";
        return {
          id: l.id,
          lat: l.lat as number,
          lon: l.lon as number,
          nom: l.title,
          epingle: epinglePrix(eur(l.total), l.title, etat),
          zIndex: sel ? ETAGE.designee : ETAGE.normale,
        };
      }),
  ];
  const cadrage = `${s.id}|${lvis.filter((l) => l.lat != null).map((l) => l.id).join(",")}`;

  const lead = raw.length
    ? `${raw.length} annonce${raw.length > 1 ? "s" : ""} : totaux de séjour tels qu'affichés par la source pour ${nights} nuit${nights > 1 ? "s" : ""}. Aucun « à partir de ».${searching ? " Relevé en direct en cours…" : ""}`
    : searching
      ? "Relevé en direct en cours…"
      : "Aucun relevé pour cette station.";

  const Carte = ({ l }: { l: Listing }) => {
    const isKept = P.lodgeId === l.id;
    const seen = !!P.seen[l.id] && !isKept;
    const d = distanceOf(l);
    const firm = firmOf(l, stay);
    return (
      <article
        className={`lodge7${isKept ? " lodge7--kept" : ""}${actifCarte === l.id ? " lodge7--vif" : ""}`}
        onClick={() => openSheet(l.id)}
        onMouseEnter={() => setActifCarte(l.id)}
        onMouseLeave={() => setActifCarte(null)}
        data-l={l.id}
      >
        <div className={`lodge7__media lodge7__media--${mediaTon(l)}`}>
          {l.photo ? (
            <ImageSlot shape="rect" id={`v7app-l-${l.id}`} placeholder="Photo de l'annonce" className="lodge7__slot" src={l.photo} />
          ) : (
            <span className="lodge7__sansphoto">Pas de photo dans l'annonce {l.source}</span>
          )}
          <span className="lodge7__source">{l.source}</span>
          {isKept ? <span className="lodge7__retenu">Retenu</span> : null}
          {seen ? <span className="lodge7__vue">déjà vue</span> : null}
        </div>
        <div className="lodge7__corps">
          <strong className="lodge7__titre">{l.title}</strong>
          <div className="lodge7__meta">
            <span className={l.guests == null ? "absent" : undefined}>{capLbl(l)}</span>
            <span>{bedLbl(l)}</span>
          </div>
          <span className={`lodge7__dist${d.kind === "measured" ? "" : " absent"}`}>
            <Icon name="epingle" taille={13} />
            {d.text}
          </span>
          <div className="lodge7__pied">
            <div className="lodge7__prix">
              <b>{eurCents(l.total)}</b>
              <span>
                {nights} nuits · {eurN(l.total / trav)} / pers.
              </span>
              <span className={`lodge7__ferme${firm ? " lodge7__ferme--oui" : ""}`}>
                <i />
                {firm ? "Prix relevé aux dates" : "Disponibilité non confirmée"}
              </span>
            </div>
            <button
              type="button"
              className={`lodge7__retenir${isKept ? " lodge7__retenir--on" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                keep(l.id);
              }}
            >
              {isKept ? "Retenu" : "Retenir"}
            </button>
          </div>
        </div>
      </article>
    );
  };

  return (
    <Coquille>
      <main className="v7main v7main--pied" id="s-lodging" data-screen-label="2 Logements">
        <OngletsStation s={s} actif="logements" />
        <header className="v7tete v7tete--ligne">
          <div>
            <span className="v7surtitre">Étape 2 · Logement</span>
            <h1>Logements à {s.name}</h1>
            <p>{lead}</p>
          </div>
          <div className="v7tete__actions">
            <button type="button" className="btn7 btn7--fantome" onClick={importer}>
              Importer une annonce
            </button>
            <button type="button" className="btn7 btn7--fantome" onClick={relancer} disabled={searching}>
              {searching ? "Relevé en cours…" : "Relancer le relevé"}
            </button>
          </div>
        </header>

        <section className="ruban7">
          <div className="ruban7__media">
            <ImageSlot shape="rect" id={`v7app-ribbon-${s.id}`} placeholder={stationPhotoAbsence(s)} className="ruban7__slot" src={stationPhoto(s)} />
          </div>
          <div className="ruban7__corps">
            <span className="ruban7__crumb">{crumb(s)}{s.domain ? ` · ${s.domain}` : ""}</span>
            <div className="ruban7__faits">
              <span>
                <span>Pistes</span>
                <b className={altLbl(s) ? undefined : "absent"}>{altLbl(s) ?? "non relevées"}</b>
              </span>
              <span>
                <span>Km, domaine</span>
                <b className={kmLbl(s) ? undefined : "absent"}>{kmLbl(s) ?? "km non publié"}</b>
              </span>
              <span>
                <span>Remontées, domaine</span>
                <b className={liftsLbl(s) ? undefined : "absent"}>{liftsLbl(s) ?? "non relevé"}</b>
              </span>
              <span>
                <span>Forfait 6 j</span>
                <b className={passLbl(s) ? undefined : "absent"}>{passLbl(s) ?? "non relevé"}</b>
              </span>
            </div>
          </div>
          <a
            href={`/stations/${s.id}`}
            className="ruban7__lien"
            onClick={(e) => {
              e.preventDefault();
              void go("fiche", { id: s.id });
            }}
          >
            ← Fiche station
          </a>
        </section>

        {raw.length ? (
          <>
            <section className="filtres7">
              <div className="toujours7">
                <span className="toujours7__label">Toujours appliqué</span>
                <span className="toujours7__regle">Capacité ≥ {trav}</span>
                {rooms ? <span className="toujours7__regle">Chambres ≥ {rooms}</span> : null}
                <span className="toujours7__regle">Total du séjour, pas « dès »</span>
                <span className="toujours7__regle">Dans {lf.rayon} km de {s.name}</span>
                {zoneLbl ? <span className="toujours7__ecarte">{zoneLbl}</span> : null}
                {centraleLbl ? <span className="toujours7__ecarte">{centraleLbl}</span> : null}
                <span>Une capacité non annoncée n'écarte pas l'annonce : elle est dite non annoncée.</span>
              </div>
              <div className="filtres7__barre">
                <button
                  type="button"
                  className={`puce puce--encre${lfOpen ? " puce--on" : ""}`}
                  aria-expanded={lfOpen}
                  onClick={() => setLfOpen((v) => !v)}
                >
                  <Icon name="filtres" taille={14} />
                  Filtres
                  {lfree.length ? <span className="puce__badge">{lfree.length}</span> : null}
                </button>
                {lfree.map((p) => {
                  const bloque = lempty?.fix != null && lempty.fix === p.remove;
                  return (
                    <span key={p.id} className={`jeton${bloque ? " jeton--bloque" : ""}`}>
                      {p.label}
                      <button
                        type="button"
                        aria-label={`Retirer le critère ${p.label}`}
                        onClick={p.remove}
                      >
                        <Icon name="croix" taille={11} />
                      </button>
                    </span>
                  );
                })}
                {lfree.length ? (
                  <a
                    href="#"
                    className="lien-doux"
                    onClick={(e) => {
                      e.preventDefault();
                      reinitialiser();
                    }}
                  >
                    Tout réinitialiser
                  </a>
                ) : null}
                <span className="filtres7__espace" />
                <span className="filtres7__compte">
                  {affichees.length} annonce{affichees.length > 1 ? "s" : ""} sur {raw.length}
                  {parCadre.horsCadre.length ? ` · ${parCadre.horsCadre.length} hors du cadre` : ""}
                  {sansPos ? ` · ${sansPos}` : ""}
                </span>
                <select className="select7" value={lsort} onChange={(e) => setLsort(e.target.value as LodgeSort)}>
                  <option value="pp">Tri : prix par personne</option>
                  <option value="total">Tri : prix total</option>
                  <option value="cap">Tri : capacité</option>
                </select>
              </div>

              {lfOpen ? (
                <div className="pop7 pop7--filtres pop7--large">
                  <div className="pop7__tete pop7__tete--ligne">
                    <strong>Filtres</strong>
                    <button type="button" className="v7fermer" aria-label="Fermer" onClick={() => setLfOpen(false)}>
                      <Icon name="croix" taille={14} />
                    </button>
                  </div>
                  <div className="pop7__bloc pop7__bloc--sans">
                    <span className="v7surtitre">Zone de recherche</span>
                    <span className="pop7__note">
                      Autour du repère de {s.name}. Le rattachement au domaine prime sur la
                      distance : un logement d'un autre domaine sort même tout près, un logement du
                      domaine reste même au-delà. Une annonce sans coordonnées n'est pas lointaine,
                      elle est non mesurable : elle reste.
                    </span>
                  </div>
                  <label className="curseur">
                    <span className="curseur__lab">
                      <span>Rayon autour de la station</span>
                      <span className="curseur__val">{lf.rayon} km</span>
                    </span>
                    <input
                      type="range"
                      min={RAYON_MIN_KM}
                      max={RAYON_MAX_KM}
                      step={1}
                      value={lf.rayon}
                      onChange={(e) => patchLf({ rayon: clampRayonKm(+e.target.value) })}
                    />
                  </label>
                  <div className="pop7__bloc">
                    <span className="v7surtitre">Prix et taille</span>
                    <span className="pop7__note">
                      Capacité ≥ {trav} est toujours appliquée ; ces seuils s'y ajoutent et écartent les
                      annonces sans valeur.
                    </span>
                  </div>
                  <label className="curseur">
                    <span className="curseur__lab">
                      <span>{BUDGET.label}</span>
                      <span className="curseur__val">
                        {budget ? `${BUDGET.sign}${fmt(budget)} ${BUDGET.unit}` : "Indifférent"}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={BUDGET.max}
                      step={BUDGET.step}
                      value={budget}
                      onChange={(e) => P.setFilters({ budget: +e.target.value })}
                    />
                  </label>
                  {RANGES.map((r) => (
                    <label key={r.k} className="curseur">
                      <span className="curseur__lab">
                        <span>{r.label}</span>
                        <span className="curseur__val">
                          {lf[r.k] ? `${r.sign}${fmt(lf[r.k])} ${r.unit}` : "Indifférent"}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={r.max}
                        step={r.step}
                        value={lf[r.k]}
                        onChange={(e) => patchLf({ [r.k]: +e.target.value })}
                      />
                    </label>
                  ))}
                  <div className="pop7__bloc">
                    <span className="v7surtitre">Source</span>
                    <div className="pop7__sources">
                      {sources.map((src) => (
                        <label key={src} className={`puce puce--case${lf.src[src] ? " puce--on" : ""}`}>
                          <input
                            type="checkbox"
                            checked={!!lf.src[src]}
                            onChange={() => patchLf({ src: { ...lf.src, [src]: !lf.src[src] } })}
                          />
                          {src}
                          <span className="puce__n">{bySrc(src)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="pop7__bloc">
                    <span className="v7surtitre">Qualité du relevé</span>
                    <div className="pop7__toggles">
                      {toggles.map((tg) => (
                        <label key={tg.k}>
                          <span>
                            <input type="checkbox" checked={lf[tg.k]} onChange={() => patchLf({ [tg.k]: !lf[tg.k] })} />
                            {tg.label}
                          </span>
                          <span className="pop7__n">{tg.n} annonces</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="pop7__pied pop7__pied--trait">
                    <a
                      href="#"
                      className="lien-doux"
                      onClick={(e) => {
                        e.preventDefault();
                        reinitialiser();
                      }}
                    >
                      Réinitialiser
                    </a>
                    <button type="button" className="btn7" onClick={() => setLfOpen(false)}>
                      Voir {affichees.length} annonce{affichees.length > 1 ? "s" : ""}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <div className="v7deux">
              <div className="v7deux__liste">
                {affichees.length ? (
                  <div className="grille7-2">
                    {affichees.map((l) => (
                      <Carte key={l.id} l={l} />
                    ))}
                  </div>
                ) : lvis.length ? (
                  <Vide titre="Aucune annonce dans ce cadre">
                    La liste suit la carte : {lvis.length} annonce{lvis.length > 1 ? "s" : ""}{" "}
                    correspond{lvis.length > 1 ? "ent" : ""} au relevé, hors du cadre visible.
                    Dézoomez ou déplacez la carte pour les retrouver.
                  </Vide>
                ) : lempty ? (
                  <Vide
                    titre={lempty.title}
                    actions={
                      <>
                        {lempty.fix ? (
                          <button type="button" className="btn7" onClick={lempty.fix}>
                            Retirer ce filtre
                          </button>
                        ) : null}
                        <button type="button" className="btn7 btn7--fantome" onClick={reinitialiser}>
                          Tout réinitialiser
                        </button>
                      </>
                    }
                  >
                    {lempty.hint}
                  </Vide>
                ) : null}
              </div>
              <div className="v7deux__carte">
                <CarteEpingles
                  marqueurs={marqueurs}
                  cadrage={cadrage}
                  maxZoom={14}
                  surBornes={setBornes}
                  actif={actifCarte}
                  surActif={setActifCarte}
                  ficheDe={(id) => {
                    const l = raw.find((x) => x.id === id);
                    if (!l) return null;
                    const d = distanceOf(l);
                    const ferme = firmOf(l, stay);
                    return (
                      <>
                        {l.photo ? (
                          <div className="fc__media">
                            <ImageSlot
                              shape="rect"
                              id={`v7app-fc-${l.id}`}
                              placeholder="Photo de l'annonce"
                              className="fc__slot"
                              src={l.photo}
                            />
                            <span className="fc__source">{l.source}</span>
                          </div>
                        ) : null}
                        <div className="fc__texte">
                          {!l.photo ? (
                            <span className="toujours7__regle">{l.source}</span>
                          ) : null}
                          <strong className="fc__titre">{l.title}</strong>
                          <span className="fc__ligne">
                            <span className={l.guests == null ? "absent" : undefined}>
                              {capLbl(l)}
                            </span>
                            <span>{bedLbl(l)}</span>
                          </span>
                          <span className={`fc__ligne${d.kind === "measured" ? "" : " absent"}`}>
                            {d.text}
                          </span>
                          <span className="fc__prix">
                            <b>{eurCents(l.total)}</b>
                            <span>
                              {nights} nuits · {eurN(l.total / trav)} / pers.
                            </span>
                          </span>
                          <span className={`fc__verdict${ferme ? " fc__verdict--ok" : ""}`}>
                            <i />
                            {ferme
                              ? "Prix relevé aux dates"
                              : availabilityLabel(availabilityOf(l, stay))}
                          </span>
                          <button
                            type="button"
                            className="btn7 btn7--fantome fc__action"
                            onClick={() => openSheet(l.id)}
                          >
                            Voir l'annonce
                          </button>
                        </div>
                      </>
                    );
                  }}
                  surClic={(id) => {
                    if (id !== "__station") openSheet(id);
                  }}
                  legende={
                    <>
                      <b>
                        {affichees.filter((l) => l.lat != null).length} pastille
                        {affichees.filter((l) => l.lat != null).length > 1 ? "s" : ""} dans le cadre
                      </b>
                      <span>
                        {lvis.filter((l) => l.lat == null).length} annonces sans coordonnées ne sont
                        pas sur la carte. Contour pointillé = déjà vue.
                      </span>
                    </>
                  }
                />
              </div>
            </div>
          </>
        ) : (
          <Vide
            titre={`Aucune annonce relevée pour ${s.name}`}
            actions={
              <>
                <button type="button" className="btn7" onClick={relancer} disabled={searching}>
                  {searching ? "Relevé en cours…" : "Lancer le relevé"}
                </button>
                <button type="button" className="btn7 btn7--fantome" onClick={importer}>
                  Importer une annonce par son lien
                </button>
              </>
            }
          >
            Rien n'est affiché à la place : ni estimation, ni annonce d'une autre station.
          </Vide>
        )}
      </main>

      {kept ? (
        <div className="pied7">
          <div className="pied7__retenu">
            <span className="v7surtitre">Logement retenu</span>
            <strong>
              {kept.title} · {kept.source}
            </strong>
          </div>
          <dl className="pied7__postes">
            <div>
              <dt>Logement</dt>
              <dd>{eurCents(kept.total)}</dd>
            </div>
            <div>
              <dt>Forfaits {trav} × 6 j</dt>
              <dd className={forfait?.j6 != null ? undefined : "absent"}>{forfait?.j6 != null ? eur(passGroupN) : "non relevés"}</dd>
            </div>
            <div>
              <dt>Trajet</dt>
              <dd className="absent">non calculé</dd>
            </div>
          </dl>
          <div className="pied7__total">
            <span>Total du séjour</span>
            <b>{eurCents(totalN)}</b>
            <span>{eurCents(Math.round((totalN / trav) * 100) / 100)} par personne</span>
          </div>
          <button type="button" className="btn7 btn7--grand" onClick={() => void go("booking")}>
            Passer à la réservation
            <Icon name="fleche-droite" taille={16} />
          </button>
        </div>
      ) : null}

      {sheet ? (
        <>
          <div className="volet7__fond" onClick={() => setSheetId(null)} />
          <aside className="volet7" role="dialog" aria-modal="true" aria-label={sheet.title}>
            <div className={`volet7__media lodge7__media--${mediaTon(sheet)}`}>
              {sheet.photo ? (
                <ImageSlot shape="rect" id={`v7app-sheet-${sheet.id}`} placeholder="Photo de l'annonce" className="lodge7__slot" src={sheet.photo} />
              ) : (
                <span>Pas de photo dans l'annonce {sheet.source}</span>
              )}
              <button type="button" className="volet7__fermer" aria-label="Fermer" onClick={() => setSheetId(null)}>
                <Icon name="croix" taille={14} />
              </button>
            </div>
            <div className="volet7__corps">
              <div>
                <span className="volet7__ref">
                  {sheet.source} · réf. {sheet.id}
                </span>
                <h2>{sheet.title}</h2>
              </div>
              <div className="volet7__faits">
                <div>
                  <span>Capacité</span>
                  <b>{capLbl(sheet)}</b>
                </div>
                <div>
                  <span>Chambres</span>
                  <b>{bedLbl(sheet)}</b>
                </div>
                <div className="volet7__large">
                  <span>Distance aux remontées</span>
                  <b className="volet7__doux">{distanceOf(sheet).text}</b>
                </div>
              </div>
              <div className="volet7__prix">
                <div>
                  <span>
                    Total du séjour · {nights} nuits · {trav} pers.
                  </span>
                  <b>{eurCents(sheet.total)}</b>
                </div>
                <div>
                  <span>Par personne</span>
                  <b className="volet7__pp">{eurN(sheet.total / trav)}</b>
                </div>
                {firmOf(sheet, stay) ? (
                  <div className="volet7__ok">
                    <Icon name="coche" taille={16} />
                    <span>
                      <b>Prix relevé aux dates.</b> La source a tarifé cette annonce pour ce séjour ; il
                      sera revérifié à la réservation.
                    </span>
                  </div>
                ) : (
                  <div className="volet7__alerte">
                    <Icon name="alerte" taille={16} />
                    <span>
                      <b>Disponibilité non confirmée.</b> {availabilityLabel(availabilityOf(sheet, stay))}.
                      Il sera revérifié à la réservation.
                    </span>
                  </div>
                )}
              </div>
              <div className="volet7__prov">
                <span>Provenance</span>
                <p>{sheet.proven}</p>
              </div>
              <div className="volet7__actions">
                <button
                  type="button"
                  className={`btn7 btn7--grand btn7--pleine${P.lodgeId === sheet.id ? " btn7--tenu" : " btn7--encre"}`}
                  onClick={() => keep(sheet.id)}
                >
                  {P.lodgeId === sheet.id ? "Retenu" : "Retenir"}
                </button>
                {sheet.url ? (
                  <a href={sheet.url} target="_blank" rel="noopener" className="btn7 btn7--fantome btn7--pleine btn7--lien">
                    Ouvrir sur {sheet.source} ↗
                  </a>
                ) : (
                  <span className="volet7__sanslien">
                    L'annonce n'a pas de lien dans le relevé : la réservation se fera à la main.
                  </span>
                )}
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </Coquille>
  );
}
