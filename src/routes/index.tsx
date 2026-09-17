/** Accueil – maquette v7 (`SKITRACK v7 - App.dc.html`, bloc ACCUEIL).
 *
 *  Une couverture, une barre de recherche en cinq segments dont chacun ouvre
 *  son panneau (destination, altitude, arrivée, départ, voyageurs), quatre
 *  raccourcis, puis « Les plus grands domaines » et « Par massif ».
 *  Données : `STATIONS` du dépôt et le catalogue de forfaits.
 *
 *  **La loupe est le seul passage vers l'écran suivant.** Choisir une
 *  suggestion remplit le champ et pose la station ; régler un curseur pose un
 *  seuil ; cliquer une vignette ouvre la fiche de cette station. Aucun de ces
 *  gestes ne quitte l'accueil de sa propre initiative : l'utilisateur enchaîne
 *  ses critères et décide lui-même quand chercher. */

import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { Flocons } from "@/components/Flocons";
import { useEchap } from "@/components/v7/fermeture";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useGo } from "@/components/v6/go";
import { Calendrier, usePlage } from "@/components/v7/Calendrier";
import { CarteStation } from "@/components/v7/CarteStation";
import { Compteur } from "@/components/v7/Compteur";
import { foldName } from "@/lib/carte";
import { appliquer, SEUILS, usePredicats } from "@/lib/filtres";
import {
  arrivalLbl,
  datesLbl,
  departLbl,
  dm,
  fmt,
  guestsLbl,
  nightsBetween,
  setStayRange,
  useParcours,
  useSejour,
  type ChipKey,
} from "@/lib/parcours";
import { AGE_ENFANT } from "@/lib/stay/party";
import { STATIONS, stationById, type Station } from "@/lib/stations";
import { maxM } from "@/lib/v7";

export const Route = createFileRoute("/")({ component: Home });

/**
 * La séquence d'entrée ne se joue qu'une fois par session.
 *
 * Elle dure une seconde et demie ; revue à chaque retour sur l'accueil, elle
 * deviendrait un péage. `sessionStorage` retient le passage pour l'onglet, et
 * son échec — navigation privée, stockage refusé — est sans conséquence : la
 * séquence se rejoue, ce qui est le pire qui puisse arriver.
 */
const CLE_ENTREE = "skitrack.v7.entree";

/** `useLayoutEffect` avertit côté serveur, où il ne fait rien ; côté
 *  navigateur il court avant la peinture, ce qu'il nous faut ici. */
const avantPeinture = typeof window === "undefined" ? useEffect : useLayoutEffect;

function dejaVue(): boolean {
  try {
    return sessionStorage.getItem(CLE_ENTREE) === "1";
  } catch {
    return false;
  }
}

function noterVue(): void {
  try {
    sessionStorage.setItem(CLE_ENTREE, "1");
  } catch {
    /* stockage indisponible : la séquence se rejouera */
  }
}

type Panneau = null | "q" | "alt" | "dates" | "guests";

/** Les trois repères d'altitude du panneau « Altitude, au minimum ».
 *
 *  Ils sortent de `SEUILS` (`filtres.ts`) : les bornes des curseurs étaient
 *  écrites ici, dans Comparer et dans `/carte`, et elles avaient déjà divergé.
 *  « Altitude du village » lit l'altitude du village — le point de départ —,
 *  jamais le sommet du domaine. */
const ALT_RANGES = SEUILS.filter((r): r is (typeof SEUILS)[number] & { k: "v" | "lo" | "hi" } =>
  r.k === "v" || r.k === "lo" || r.k === "hi",
);

const ALT_PRESETS: { label: string; p: Partial<Record<"v" | "lo" | "hi", number>> }[] = [
  { label: "Village 1 800 m", p: { v: 1800 } },
  { label: "Sommet 3 000 m", p: { hi: 3000 } },
  { label: "Bas des pistes 1 500 m", p: { lo: 1500 } },
];

const SHORTCUTS: { k: ChipKey; label: string }[] = [
  { k: "big", label: "Grands domaines · 300 km et plus" },
  { k: "high", label: "Haute altitude · sommet 3 000 m" },
  { k: "glacier", label: "Glacier" },
  { k: "family", label: "Plus de 60 % de pistes faciles" },
];

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

function massifCards(all: Station[]): { m: string; n: number; hi: number }[] {
  const ms = new Map<string, Station[]>();
  for (const s of all) ms.set(s.massif, [...(ms.get(s.massif) ?? []), s]);
  return [...ms.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "fr"))
    .map(([m, arr]) => ({ m, n: arr.length, hi: Math.max(...arr.map((s) => maxM(s) ?? 0)) }));
}

function Home() {
  const go = useGo();
  const P = useParcours();
  const F = P.filters;
  const { checkIn, checkOut, trav, enfants, rooms, nights } = useSejour();
  const plage = usePlage();
  // La station retenue, s'il y en a une : c'est elle qui décide de ce que
  // « Rechercher » va ouvrir.
  const retenueChoisie = P.stationId ? stationById(P.stationId) : undefined;

  const all = STATIONS;
  const top = useMemo(() => popular(all), [all]);
  const massifs = useMemo(() => massifCards(all), [all]);

  // **Le champ destination n'a pas d'état local.** Il en avait un, si bien que
  // le texte affiché et le filtre appliqué étaient deux choses distinctes :
  // revenir de Comparer laissait un jeton « chamonix » actif là-bas et un champ
  // vide ici.
  const q = P.q;
  const setQ = P.setQ;
  // Un nom de station tapé en toutes lettres désigne cette station, même sans
  // passer par une suggestion : la maquette fait ce repli (App.dc.html:881) et
  // sans lui, taper « Val Thorens » puis Entrée menait à une liste d'une ligne.
  // Comparaison sur le nom replié, pas sur `toLowerCase` : « megeve » doit
  // trouver Megève.
  const retenue = useMemo(() => {
    if (retenueChoisie) return retenueChoisie;
    const cible = foldName(q);
    return cible ? all.find((s) => foldName(s.name) === cible) : undefined;
  }, [retenueChoisie, q, all]);
  const [hp, setHp] = useState<Panneau>(null);
  // L'entrée désignée au clavier dans la liste de suggestions. -1 : aucune.
  const [iSugg, setISugg] = useState(-1);
  // Un verrou de navigation : deux Entrée rapides ne partent pas deux fois.
  const enRoute = useRef(false);
  // « anime » ne dure que le temps de la séquence. Rien n'est caché : tout est
  // dans le document dès le premier rendu, seule l'opacité bouge, et la barre
  // de recherche répond au clavier pendant son propre fondu.
  // « anime » au premier rendu, des deux côtés.
  //
  // L'état initial lisait `sessionStorage`, que le serveur n'a pas : au
  // deuxième passage dans l'onglet, le serveur rendait « anime » et le client
  // « faite ». React signalait la divergence et rejouait tout le sous-arbre.
  // La séquence est donc écartée juste après, avant la peinture, de sorte que
  // rien ne clignote.
  const [entree, setEntree] = useState<"anime" | "faite">("anime");
  /** L'indice de défilement : caché au-delà de 45 % de la couverture, revenu
   *  en remontant. `cueVu` retire le retard d'entrée dès le premier masquage —
   *  les 4,2 s ne valent que pour le premier affichage de la page. */
  const hero = useRef<HTMLDivElement>(null);
  const [cueCache, setCueCache] = useState(false);
  const [cueVu, setCueVu] = useState(false);
  useEffect(() => {
    const lire = () => {
      const h = hero.current?.offsetHeight ?? window.innerHeight;
      const passe = window.scrollY > h * 0.45;
      setCueCache(passe);
      if (passe) setCueVu(true);
    };
    lire();
    window.addEventListener("scroll", lire, { passive: true });
    return () => window.removeEventListener("scroll", lire);
  }, []);
  /** Descendre jusqu'au bas de la couverture. La maquette anime le défilement
   *  à la main — 420 ms, courbe quadratique entrante-sortante — plutôt que par
   *  `scrollIntoView`, dont la durée n'est pas réglable. Sous « mouvement
   *  réduit », le saut est net. */
  const descendre = useCallback(() => {
    const cible = (hero.current?.offsetHeight ?? window.innerHeight) - 60;
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
  avantPeinture(() => {
    if (dejaVue()) setEntree("faite");
  }, []);

  // **Arriver à l'accueil ne relâche plus la station retenue.**
  //
  // Un effet la relâchait au montage, pour qu'un choix fait la veille ne
  // revienne pas coché en silence. Il détruisait aussi le choix de la minute
  // précédente : revenir sur l'accueil depuis Logements reverrouillait les
  // étapes 2 et 3, et le lien de partage, qui pose une station puis navigue,
  // se faisait effacer par lui — son garde-fou lisait un fragment d'adresse que
  // `Coquille` venait justement d'effacer, et ne se déclenchait jamais.
  //
  // Ce que l'effet cherchait à éviter est réglé autrement : le champ destination
  // porte le nom de la station retenue, et il est persisté avec elle. Rien n'est
  // donc caché, et modifier le texte la relâche (`setQ`).

  useEffect(() => {
    if (entree === "faite") return;
    noterVue();
    // Un geste de l'utilisateur termine la séquence sur-le-champ : personne ne
    // doit attendre une animation pour se servir de l'écran.
    const finir = () => setEntree("faite");
    const fin = setTimeout(finir, 1600);
    window.addEventListener("keydown", finir, { once: true });
    window.addEventListener("pointerdown", finir, { once: true });
    return () => {
      clearTimeout(fin);
      window.removeEventListener("keydown", finir);
      window.removeEventListener("pointerdown", finir);
    };
    // Une seule fois, au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ouvrir = (p: Panneau) => {
    if (p === "dates") plage.ouvrirArrivee();
    setHp(p);
  };
  const ouvrirDepart = () => {
    plage.ouvrirDepart();
    setHp("dates");
  };
  const fermer = useCallback(() => {
    setHp(null);
    plage.reset();
  }, [plage]);
  // Échap ferme le panneau ouvert, d'où que vienne le focus. Elle n'était
  // écoutée que sur le champ Destination : une fois le panneau Altitude,
  // Arrivée, Départ ou Voyageurs ouvert, le focus était dedans et Échap ne
  // faisait plus rien. La maquette écoute au niveau de la fenêtre
  // (App.dc.html:557).
  useEchap(hp != null, fermer);

  /* ---------- Suggestions ----------
     Choisir une suggestion **remplit le champ et pose le critère**. Rien de
     plus : les deux branches naviguaient, l'une vers Comparer, l'autre vers la
     fiche, en vidant au passage le champ que l'utilisateur venait de remplir. */
  const ql = foldName(q);
  const sugg = useMemo(() => {
    if (!ql || hp !== "q") return [];
    return [
      ...massifs
        .filter((x) => foldName(x.m).includes(ql))
        .slice(0, 3)
        .map((x) => ({
          key: "m:" + x.m,
          label: x.m,
          kind: "massif",
          pick: () => {
            P.setDestination(null);
            P.setQ(x.m);
            P.setMassif(x.m);
            setHp(null);
          },
        })),
      ...all
        .filter((s) => foldName(s.name).includes(ql))
        .slice(0, 6)
        .map((s) => ({
          key: "s:" + s.id,
          label: s.name,
          kind: s.domain ?? s.massif,
          pick: () => {
            P.setDestination(s);
            setHp(null);
          },
        })),
    ];
    // `massifs` et `all` sont stables ; `P` ne l'est pas, mais ses actions le sont.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ql, hp, massifs, all]);

  /* ---------- Critères actifs et compte ----------
     Les mêmes prédicats que l'écran Comparer, pas une seconde écriture. */
  const preds = usePredicats();
  const retenues = useMemo(() => appliquer(all, preds).length, [all, preds]);

  /* ---------- Ce que la loupe va faire ----------
     Trois cas, dits avant d'être faits. La loupe n'est jamais désactivée :
     une plage de dates inversée se répare au lieu de barrer la route. */
  const nuitsLues = nightsBetween(checkIn, checkOut);
  const datesInversees = nuitsLues == null || nuitsLues <= 0;
  const dira = retenue
    ? `Rechercher ouvrira la fiche de ${retenue.name}.`
    : preds.length
      ? `Rechercher ouvrira ${retenues} station${retenues > 1 ? "s" : ""} sur ${all.length}, selon vos critères.`
      : `Rechercher ouvrira les ${all.length} stations, tri par défaut.`;
  const avertissement = datesInversees
    ? "Le départ précède l'arrivée : la recherche posera une nuit à partir de l'arrivée."
    : null;

  const search = () => {
    // Deux clics rapides, ou une touche Entrée maintenue, ne partent qu'une
    // fois : le verrou tombe au démontage de l'écran.
    if (enRoute.current) return;
    setHp(null);
    // Une plage inversée est réparée, pas refusée : la loupe reste franchissable.
    if (datesInversees) {
      const lendemain = new Date(Date.parse(`${checkIn}T00:00:00Z`) + 86_400_000);
      setStayRange(checkIn, lendemain.toISOString().slice(0, 10));
    }
    enRoute.current = true;
    // a. Une station est renseignée : sa fiche.
    //
    // Le dépôt ouvrait les logements (commit 408a7cb). La maquette ouvre la
    // fiche, et c'est elle qui fait foi : celui qui nomme une station veut
    // d'abord la lire — altitude, mix de pistes, forfait — avant d'arriver
    // devant des annonces. Les logements restent à un clic, par l'onglet.
    if (retenue) {
      P.retain(retenue.id);
      void go("fiche", { id: retenue.id });
      return;
    }
    // b. Au moins un autre critère : Comparer, liste filtrée par ces critères.
    if (preds.length) {
      void go("compare");
      return;
    }
    // c. Aucun critère : Comparer, liste complète, tri par défaut.
    P.setSort("km");
    void go("compare");
  };

  // Le verrou ne survit pas à l'écran : revenir par le bouton Précédent doit
  // rendre une loupe utilisable.
  useEffect(() => () => {
    enRoute.current = false;
  }, []);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && sugg.length) {
      e.preventDefault();
      setISugg((i) => (i + 1) % sugg.length);
      return;
    }
    if (e.key === "ArrowUp" && sugg.length) {
      e.preventDefault();
      setISugg((i) => (i <= 0 ? sugg.length - 1 : i - 1));
      return;
    }
    if (e.key === "Escape") {
      setHp(null);
      setISugg(-1);
      return;
    }
    if (e.key !== "Enter" || e.repeat) return;
    e.preventDefault();
    // Entrée sur une suggestion désignée la choisit ; sinon elle cherche.
    const choisie = iSugg >= 0 ? sugg[iSugg] : undefined;
    if (choisie) {
      choisie.pick();
      setISugg(-1);
      return;
    }
    search();
  };

  /** Un raccourci **ajoute** un prédicat. Il remettait tout à zéro au passage,
   *  emportant l'altitude que l'utilisateur venait de régler. */
  const shortcut = (k: ChipKey) => {
    P.setChip(k, !F.chips[k]);
  };

  const altActive = ALT_RANGES.filter((r) => F[r.k]);
  const altSegLbl = altActive.length
    ? altActive.map((r) => `${r.court} ≥ ${fmt(F[r.k])}`).join(" · ") + " m"
    : "Indifférent";

  const seg = (on: boolean) => `sbar7__seg${on ? " sbar7__seg--on" : ""}`;

  return (
    <Coquille>
      <main className="v7main v7main--pleine" id="s-home" data-screen-label="Accueil">
        <div className={`hero7${entree === "anime" ? " hero7--entree" : ""}`} ref={hero}>
          <ImageSlot shape="rect"
            id="v7app-cover"
            placeholder="Photo de couverture : un domaine en février, au petit matin. Crédit obligatoire."
            className="hero7__slot"
            src="/hero.jpg"
          />
          <div className="hero7__voile" />
          {/* Entre le voile et le texte : la neige passe devant la photo, jamais
              devant ce qui se lit. Densité et opacité sobres, chute lente. */}
          <Flocons
            count={130}
            speedMin={0.14}
            speedMax={0.5}
            sizeMin={0.8}
            sizeMax={2.6}
            opacityMin={18}
            opacityMax={52}
          />
          <div className="hero7__in">
            <h1>
              <span className="hero7__t1">Comparez les stations,</span>
              <span className="hero7__t2">puis les logements.</span>
            </h1>
            <p className="hero7__lead">
              Altitude des pistes, forfait 6 jours et total du séjour, station par station. Ce qui
              n'est pas relevé est dit absent.
            </p>
            {hp ? <div className="hero7__fond" onClick={fermer} /> : null}
            <div className="sbar7__hote hero7__barre">
              <div className={`sbar7${hp ? " sbar7--ouverte" : ""}`}>
                <label className={seg(hp === "q")} onClick={() => setHp("q")}>
                  <span className="sbar7__k">Destination</span>
                  <input
                    id="hq"
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setHp("q");
                      setISugg(-1);
                    }}
                    onKeyDown={onKey}
                    onFocus={() => setHp("q")}
                    placeholder="Station, massif, domaine"
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={hp === "q" && !!ql}
                    aria-controls="hq-sugg"
                    aria-autocomplete="list"
                    aria-activedescendant={iSugg >= 0 ? sugg[iSugg]?.key : undefined}
                  />
                </label>
                <button type="button" className={seg(hp === "alt")} onClick={() => ouvrir("alt")}>
                  <span className="sbar7__k">Altitude</span>
                  <span className="sbar7__v">{altSegLbl}</span>
                </button>
                <button
                  type="button"
                  className={seg(hp === "dates" && plage.phase === "from")}
                  onClick={() => ouvrir("dates")}
                >
                  <span className="sbar7__k">Arrivée</span>
                  <span className="sbar7__v">{dm(checkIn)}</span>
                </button>
                <button
                  type="button"
                  className={seg(hp === "dates" && plage.phase === "to")}
                  onClick={ouvrirDepart}
                >
                  <span className="sbar7__k">Départ</span>
                  <span className="sbar7__v">{dm(checkOut)}</span>
                </button>
                <div className={`sbar7__fin ${seg(hp === "guests")}`}>
                  <button type="button" className="sbar7__seg sbar7__seg--nu" onClick={() => ouvrir("guests")}>
                    <span className="sbar7__k">Voyageurs</span>
                    <span className="sbar7__v">{guestsLbl(trav, rooms, enfants)}</span>
                  </button>
                  {/* La loupe ne se désactive pas. Elle l'était dès que la
                      plage de dates était inversée, ce qui laissait l'écran
                      sans issue : la recherche répare la plage et part. */}
                  <button
                    type="button"
                    className="sbar7__go"
                    aria-label={dira}
                    onClick={search}
                  >
                    <Icon name="loupe" taille={18} />
                  </button>
                </div>
              </div>

              {hp === "q" && ql ? (
                <div className="pop7 pop7--sugg" id="hq-sugg" role="listbox">
                  {sugg.length ? (
                    <>
                      <span className="pop7__label">Suggestions</span>
                      {sugg.map((sg, i) => (
                        <button
                          key={sg.key}
                          id={sg.key}
                          type="button"
                          role="option"
                          aria-selected={i === iSugg}
                          className={`pop7__sugg${i === iSugg ? " pop7__sugg--vive" : ""}`}
                          onMouseEnter={() => setISugg(i)}
                          onClick={sg.pick}
                        >
                          <span>{sg.label}</span>
                          <span className="pop7__kind">{sg.kind}</span>
                        </button>
                      ))}
                    </>
                  ) : (
                    /* Texte saisi sans correspondance : il est traité comme
                       « pas de station », et l'écran le dit plutôt que de
                       laisser un panneau vide. */
                    <span className="pop7__vide">
                      Aucune station ni massif ne porte «&nbsp;{q.trim()}&nbsp;». Le référentiel
                      couvre {all.length} stations françaises ; la loupe ouvrira la liste filtrée sur
                      ce texte.
                    </span>
                  )}
                </div>
              ) : null}

              {hp === "dates" ? (
                <div className="pop7 pop7--dates">
                  <Calendrier plage={plage} onPose={() => setHp("guests")} />
                  <div className="pop7__pied">
                    <span />
                    <span className="pop7__recap">
                      {nights} nuit{nights > 1 ? "s" : ""} · {arrivalLbl(checkIn)} → {departLbl(checkOut)}
                    </span>
                  </div>
                </div>
              ) : null}

              {hp === "alt" ? (
                <div className="pop7 pop7--alt">
                  <div className="pop7__tete">
                    <strong>Altitude, au minimum</strong>
                    <span>
                      Trois repères indépendants ; laissez sur « Indifférent » ce qui ne compte pas.
                    </span>
                  </div>
                  {ALT_RANGES.map((r) => (
                    <label key={r.k} className="curseur">
                      <span className="curseur__lab">
                        <span>{r.label}</span>
                        <span className="curseur__val">
                          {F[r.k] ? `≥ ${fmt(F[r.k])} m` : "Indifférent"}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={r.max}
                        step={100}
                        value={F[r.k]}
                        onChange={(e) => P.setFilters({ [r.k]: +e.target.value })}
                      />
                    </label>
                  ))}
                  <div className="pop7__presets">
                    {ALT_PRESETS.map((ap) => {
                      const on = Object.entries(ap.p).every(([k, v]) => F[k as "v" | "lo" | "hi"] === v);
                      return (
                        <button
                          key={ap.label}
                          type="button"
                          className={`puce${on ? " puce--on" : ""}`}
                          onClick={() =>
                            P.setFilters(
                              Object.fromEntries(
                                Object.entries(ap.p).map(([k, v]) => [k, on ? 0 : v]),
                              ) as Partial<typeof F>,
                            )
                          }
                        >
                          {ap.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="pop7__pied pop7__pied--trait">
                    <a
                      href="#"
                      className="lien-doux"
                      onClick={(e) => {
                        e.preventDefault();
                        P.setFilters({ v: 0, lo: 0, hi: 0 });
                      }}
                    >
                      Indifférent
                    </a>
                    <button type="button" className="btn7 btn7--encre" onClick={() => ouvrir("dates")}>
                      Choisir les dates
                    </button>
                  </div>
                </div>
              ) : null}

              {hp === "guests" ? (
                <div className="pop7 pop7--guests">
                  <Compteur k="trav" titre="Voyageurs" regle="1 à 20 personnes" />
                  {/* Séparés parce que le coût des forfaits comptait tout le
                      monde au tarif adulte, tarif enfant relevé ou non. */}
                  <Compteur k="enfants" titre="dont enfants" regle={AGE_ENFANT} />
                  <Compteur k="rooms" titre="Chambres" regle="0 = studio accepté" />
                </div>
              ) : null}
            </div>
            <p className="hero7__dira" aria-live="polite">
              {dira}
              {avertissement ? <span className="hero7__dira--manque"> {avertissement}</span> : null}
            </p>

            {/* Les critères actifs, retirables un par un, avec le compte des
                stations retenues. Ils se réglaient jusqu'ici dans des panneaux
                qui se referment : rien à l'écran ne disait ce qui était posé. */}
            {preds.length ? (
              <div className="hero7__jetons" aria-live="polite">
                <span className="hero7__jetons-label">
                  {retenues} station{retenues > 1 ? "s" : ""} retenue{retenues > 1 ? "s" : ""}
                </span>
                {preds.map((pr) => (
                  <span key={pr.id} className="jeton jeton--photo">
                    {pr.label}
                    <button type="button" aria-label={`Retirer le critère ${pr.label}`} onClick={pr.retirer}>
                      <Icon name="croix" taille={11} />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  className="hero7__jetons-tout"
                  onClick={() => P.resetFilters()}
                >
                  Tout retirer
                </button>
              </div>
            ) : null}

            <div className="hero7__raccourcis">
              {SHORTCUTS.map((sc) => (
                <button
                  key={sc.k}
                  type="button"
                  className={`raccourci${F.chips[sc.k] ? " raccourci--on" : ""}`}
                  aria-pressed={!!F.chips[sc.k]}
                  onClick={() => shortcut(sc.k)}
                >
                  {sc.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className={`hero7__suite${cueVu ? "" : " hero7__suite--premiere"}${cueCache ? " hero7__suite--cache" : ""}`}
            onClick={descendre}
            tabIndex={cueCache ? -1 : undefined}
          >
            <span>Plus bas : grands domaines et massifs</span>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v13M6 13l6 6 6-6" />
            </svg>
          </button>
        </div>

        <div className="v7wrap home7">
          <section className="home7__section">
            <header className="home7__tete">
              <div>
                <h2>Plus grands domaines</h2>
                <p>
                  Une station par forfait relié, classées par kilomètres de pistes. Km et remontées
                  sont des valeurs de domaine.
                </p>
              </div>
              {/* Un lien de vue, pas une remise à zéro : il emmenait les
                  critères de l'utilisateur avec lui, sans le dire. */}
              <a
                href="/comparer"
                onClick={(e) => {
                  e.preventDefault();
                  void go("compare");
                }}
              >
                Toutes les stations
                <Icon name="fleche-droite" taille={14} />
              </a>
            </header>
            <div className="home7__grille3">
              {top.map((s) => (
                <CarteStation key={s.id} s={s} variante="accueil" />
              ))}
            </div>
          </section>
          <section className="home7__section">
            <header className="home7__tete">
              <div>
                <h2>Par massif</h2>
                <p>Pose le massif comme critère. La loupe ouvre la liste.</p>
              </div>
            </header>
            <div className="home7__massifs">
              {massifs.map((x) => (
                <button
                  key={x.m}
                  type="button"
                  className={`mcard7${P.massif === x.m ? " mcard7--on" : ""}`}
                  aria-pressed={P.massif === x.m}
                  onClick={() => P.setMassif(P.massif === x.m ? null : x.m)}
                >
                  <strong>{x.m}</strong>
                  <span>
                    {x.n} station{x.n > 1 ? "s" : ""} · sommet jusqu'à {fmt(x.hi)} m
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
        <span className="sr-only">{datesLbl(checkIn, checkOut, nights)}</span>
      </main>
    </Coquille>
  );
}
