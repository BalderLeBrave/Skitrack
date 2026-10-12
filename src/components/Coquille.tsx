/**
 * La coquille de page de SKITRACK : une seule, pour tous les écrans.
 *
 * La barre du haut de la maquette Airbnb (Skitrack App.dc.html:17-45) :
 * collante, 68 px, translucide et floutée. La marque mène à l'accueil ; les
 * étapes 1 Comparer, 2 Logements, 3 Réservation gardent leurs verrous ; hors
 * de l'accueil, une pilule centrale résume station, dates et voyageurs et
 * ouvre « Modifier la recherche » (sous 1000 px, une pilule réduite : la
 * station et la loupe). À droite : Prix, Favoris et leur compte, le menu
 * Plus, la langue et le thème.
 *
 * La navigation retenue est `go()` : elle porte les verrous du parcours et
 * l'explication quand une étape n'est pas encore franchissable.
 *
 * Les écrans v7 défilent avec le document, la barre reste collée en haut. Les
 * écrans de contrôle (ceux de « Plus », `AILLEURS_PATHS`) gardent leur
 * coquille à hauteur fixe et leurs propres feuilles, sous la même barre.
 */

import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AutoSync } from "./AutoSync";
import { ICONES, IconeCadenas, Trace } from "./maquette";
import { FenetreRecherche } from "./recherche/FenetreRecherche";
import { AILLEURS_PATHS, useGo, screenOf, type Screen } from "./v6/go";
import { Toast } from "./v6/Toast";
import { useFermeture } from "./v7/fermeture";
import { useCriteresUrl } from "@/lib/criteres";
import { tr, trN, useLocale, useT, type MsgId } from "@/lib/i18n";
import { datesCourtes, groupLbl, useParcours, useSejour } from "@/lib/parcours";
import { stationsVoisines } from "@/lib/domaineStations";
import { grandDomaineDe } from "@/lib/grandsDomaines";
import { usePrix } from "@/lib/prix/releve";
import { stationById } from "@/lib/stations";
import { useStay } from "@/lib/stay";
import { clampChildren } from "@/lib/stay/party";
import { useTheme } from "@/lib/theme";
import { nombreFavoris } from "@/lib/favoris/modele";
import { useFavoris } from "@/lib/favoris/store";

const PARCOURS: { go: Screen; step: number; label: MsgId }[] = [
  { go: "compare", step: 1, label: "nav.compare" },
  { go: "lodging", step: 2, label: "nav.lodging" },
  { go: "booking", step: 3, label: "nav.booking" },
];

const LOUPE = "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-3.5-3.5";
const BARRES = "M4 20V10M10 20V4M16 20v-8M22 20H2";
const COEUR =
  "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z";
const GLOBE = "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20";
const SOLEIL =
  "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4";
const LUNE = "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z";
const CHEVRON = "m6 9 6 6 6-6";

/** Écrans hors parcours, rangés sous « Plus ». Les chemins viennent de
 *  `AILLEURS_PATHS` (`go.ts`), seule table de ces routes.
 *
 *  Deux groupes : ce qu'on ouvre pour préparer un séjour (la carte, les
 *  forfaits, ses traces) et ce qu'on ouvre pour vérifier d'où viennent les
 *  données. */
const AILLEURS: {
  titre: MsgId;
  liens: { to: (typeof AILLEURS_PATHS)[number]; label: MsgId; icone: string }[];
}[] = [
  {
    titre: "nav.tools",
    liens: [
      { to: "/carte", label: "nav.map", icone: ICONES.map },
      { to: "/monde", label: "nav.world", icone: GLOBE },
      { to: "/forfaits", label: "nav.passes", icone: ICONES.ticket },
      { to: "/traces", label: "nav.traces", icone: ICONES.trace },
    ],
  },
  {
    titre: "nav.control",
    liens: [
      { to: "/altitudes", label: "nav.alt", icone: ICONES.check },
      { to: "/openskimap", label: "nav.osm", icone: ICONES.check },
      { to: "/cles", label: "nav.cles", icone: ICONES.check },
    ],
  },
];

/** Les écrans de contrôle, rangés sous « Plus » : `screenOf` répond `null`
 *  hors des écrans v7. */
function horsParcours(pathname: string): boolean {
  return screenOf(pathname) === null;
}

/**
 * La station qu'on regarde : celle retenue pour le séjour, ou à défaut celle
 * dont on lit la fiche.
 */
function useStationCourante() {
  const stationId = useParcours((s) => s.stationId);
  const params = useParams({ strict: false }) as { id?: string };
  return (
    (stationId ? stationById(stationId) : undefined) ??
    (params.id ? stationById(params.id) : undefined)
  );
}

function MenuPlus() {
  const t = useT();
  const [ouvert, setOuvert] = useState(false);
  const hote = useRef<HTMLDivElement>(null);
  const fermer = useMemo(() => () => setOuvert(false), []);
  useFermeture(ouvert, fermer, hote);
  // Les voisines du grand domaine relié : depuis Courchevel, passer à Méribel
  // ou à Val Thorens sans repasser par Comparer.
  const station = useStationCourante();
  const voisines = useMemo(() => (station ? stationsVoisines(station.id) : []), [station]);

  return (
    <div className="sh-plus" ref={hote}>
      <button
        type="button"
        className={`sh-util${ouvert ? " sh-util--on" : ""}`}
        title={tr("Outils, contrôle des données et mises à jour")}
        aria-expanded={ouvert}
        aria-haspopup="dialog"
        onClick={() => setOuvert((v) => !v)}
      >
        {t("nav.more")}
        <Trace d={CHEVRON} taille={12} epaisseur={2.4} />
      </button>
      {ouvert ? (
        <div className="sh-menu" role="dialog" aria-label={t("nav.more")}>
          <span className="m8-lu-seul">{t("nav.elsewhere")}</span>
          {AILLEURS.map((groupe) => (
            <div key={groupe.titre} className="sh-menu__groupe">
              <span className="sh-menu__titre">{t(groupe.titre)}</span>
              {groupe.liens.map((l) => (
                <Link key={l.to} to={l.to} className="sh-menu__lien" onClick={() => setOuvert(false)}>
                  <Trace d={l.icone} taille={16} epaisseur={1.7} />
                  {t(l.label)}
                </Link>
              ))}
            </div>
          ))}
          {voisines.length ? (
            <div className="sh-menu__groupe">
              <span className="sh-menu__titre">
                {t("nav.domainStations")} · {station ? grandDomaineDe(station.id)?.nom : null}
              </span>
              <div className="sh-menu__stations">
                {voisines.map((s) => (
                  <Link
                    key={s.id}
                    to="/stations/$id"
                    params={{ id: s.id }}
                    className="sh-menu__lien"
                    onClick={() => setOuvert(false)}
                  >
                    <Trace icone="pin" taille={16} epaisseur={1.7} />
                    {s.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          <div className="sh-menu__pied">
            <AutoSync />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** « Favoris » et le nombre de logements enregistrés. */
function LienFavoris({ actif, libelle }: { actif: boolean; libelle: string }) {
  const n = useFavoris(nombreFavoris);
  // Gardés dans le navigateur : le rendu serveur ne les compte pas.
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  const compte = monte ? n : 0;
  return (
    <Link
      to="/favoris"
      className={`sh-util${actif ? " sh-util--on" : ""}`}
      aria-current={actif ? "page" : undefined}
      title={
        compte > 0
          ? trN(compte, "{n} logement enregistré", "{n} logements enregistrés")
          : tr("Logements enregistrés dans vos dossiers")
      }
    >
      <Trace d={COEUR} taille={15} epaisseur={1.8} />
      <span className="sh-util__lbl">{libelle}</span>
      {compte > 0 ? <span className="sh-util__compte">{compte}</span> : null}
    </Link>
  );
}

/** La pilule centrale : station, dates, voyageurs et la loupe. Sous 1000 px,
 *  la pilule réduite (station et loupe) ouvre la même fenêtre. */
function PiluleRecherche() {
  const stayOpen = useParcours((s) => s.stayOpen);
  const setStayOpen = useParcours((s) => s.setStayOpen);
  const massif = useParcours((s) => s.massif);
  const { checkIn, checkOut, trav, enfants, rooms } = useSejour();
  const station = useStationCourante();
  const nom = station?.name ?? massif ?? tr("Station à choisir");
  const ouvrir = () => setStayOpen(true);
  return (
    <>
      <button
        type="button"
        className="sh-pilule"
        aria-label={tr("Modifier la recherche")}
        aria-expanded={stayOpen}
        aria-haspopup="dialog"
        onClick={ouvrir}
      >
        <span className="sh-pilule__station">{nom}</span>
        <i className="sh-pilule__trait" aria-hidden />
        <span>{datesCourtes(checkIn, checkOut)}</span>
        <i className="sh-pilule__trait" aria-hidden />
        <span className="sh-pilule__groupe">{groupLbl(trav, rooms, enfants)}</span>
        <span className="sh-pilule__loupe">
          <Trace d={LOUPE} taille={13} epaisseur={2.6} />
        </span>
      </button>
      <button
        type="button"
        className="sh-pilule sh-pilule--reduite"
        aria-label={tr("Modifier la recherche")}
        aria-expanded={stayOpen}
        aria-haspopup="dialog"
        onClick={ouvrir}
      >
        <span className="sh-pilule__station">{nom}</span>
        <span className="sh-pilule__loupe">
          <Trace d={LOUPE} taille={12} epaisseur={2.6} />
        </span>
      </button>
    </>
  );
}

function Barre({ pilule }: { pilule: boolean }) {
  const t = useT();
  const go = useGo();
  const ecran = useRouterState({ select: (s) => screenOf(s.location.pathname) });
  const stationId = useParcours((s) => s.stationId);
  const lodgeId = useParcours((s) => s.lodgeId);
  const theme = useTheme((s) => s.theme);
  const bascule = useTheme((s) => s.toggle);
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  // Le relevé des prix continue quand on quitte l'écran ; ailleurs, rien ne
  // disait qu'il tournait ni où l'arrêter. Nul au rendu serveur.
  const enCourse = usePrix((s) => s.course != null);

  return (
    <header className="sh-haut">
      <div className="sh-barre">
        <a
          href="/"
          className="sh-marque"
          onClick={(e) => {
            e.preventDefault();
            void go("home");
          }}
        >
          <b>ski</b>
          <span>track</span>
          <i aria-hidden />
        </a>
        <nav className="sh-etapes" aria-label={tr("Parcours")}>
          {PARCOURS.map((j) => {
            // La fiche station allume « Comparer » : elle en est le détail.
            const actif = ecran !== null && (j.go === ecran || (ecran === "fiche" && j.go === "compare"));
            const verrou =
              !actif && ((j.go === "lodging" && !stationId) || (j.go === "booking" && !lodgeId));
            const titre =
              j.go === "lodging" && verrou
                ? t("nav.lodgingLocked")
                : j.go === "booking" && verrou
                  ? t("nav.bookingLocked")
                  : undefined;
            // Le logement retenu, compté sur l'étape qui le réserve.
            const badge = j.go === "booking" && lodgeId ? 1 : 0;
            return (
              <button
                key={j.go}
                type="button"
                className={`sh-etape${actif ? " sh-etape--on" : ""}${verrou ? " sh-etape--verrou" : ""}`}
                data-go={j.go}
                aria-current={actif ? "page" : undefined}
                title={titre}
                onClick={() => void go(j.go)}
              >
                <span className="sh-etape__num">{j.step}</span>
                <span className="sh-etape__lbl">{t(j.label)}</span>
                {verrou ? <IconeCadenas taille={12} /> : null}
                {badge ? (
                  <span
                    className="sh-etape__badge"
                    title={trN(badge, "{n} logement retenu", "{n} logements retenus")}
                  >
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="sh-centre">{pilule ? <PiluleRecherche /> : null}</div>
        <div className="sh-droite">
          <Link
            to="/prix"
            className={`sh-util${ecran === "prix" ? " sh-util--on" : ""}${enCourse ? " sh-util--course" : ""}`}
            aria-current={ecran === "prix" ? "page" : undefined}
            title={
              enCourse
                ? tr("Relevé des prix en cours")
                : tr("Médiane d’un séjour par station, et logements dans votre budget")
            }
          >
            <Trace d={BARRES} taille={15} epaisseur={1.8} />
            <span className="sh-util__lbl">{t("nav.prices")}</span>
          </Link>
          <LienFavoris actif={ecran === "favoris"} libelle={t("nav.favorites")} />
          <MenuPlus />
          <button
            type="button"
            className="sh-util"
            title={tr("Langue")}
            aria-label={locale === "fr" ? "English" : "Français"}
            onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
          >
            <Trace d={GLOBE} taille={15} epaisseur={1.7} />
            {locale === "fr" ? "FR" : "EN"}
          </button>
          {/* L'icône dit le thème qu'on obtiendra : le soleil en sombre, la
              lune en clair. */}
          <button
            type="button"
            className="sh-util sh-util--rond"
            title={theme === "dark" ? tr("Thème sombre : passer au clair") : tr("Thème clair : passer au sombre")}
            role="switch"
            aria-checked={theme === "dark"}
            aria-label={tr("Thème")}
            onClick={bascule}
            data-testid="theme-toggle"
          >
            <Trace d={theme === "dark" ? SOLEIL : LUNE} taille={16} epaisseur={1.8} />
          </button>
        </div>
      </div>
    </header>
  );
}

function FenetreModifier({ ecran }: { ecran: Screen | null }) {
  const station = useStationCourante();
  return <FenetreRecherche ecran={ecran} station={station} />;
}

let hashLu = false;

export function Coquille({ children, chips }: { children: ReactNode; chips?: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ecran = screenOf(pathname);
  const controle = horsParcours(pathname);
  const go = useGo();
  const stayOpen = useParcours((s) => s.stayOpen);
  const setStayOpen = useParcours((s) => s.setStayOpen);
  const setShared = useParcours((s) => s.setShared);

  // Les critères de recherche s'écrivent dans l'adresse sur les écrans du
  // parcours : un lien se partage, un signet se repose, et le bouton Précédent
  // rend la recherche qu'il vient de quitter.
  // Pas sur « Prix » : il tient sa propre période, et les critères de Comparer
  // encombreraient son adresse sans rien y régler.
  useCriteresUrl(!controle && ecran !== "prix" && ecran !== "favoris", pathname);

  // Changer d'écran ferme « Modifier la recherche » et remonte en haut de page,
  // comme `fromHash` dans la maquette.
  //
  // Le bandeau « Récapitulatif partagé » décrit l'écran de réservation : le
  // quitter l'efface. Il ne s'effaçait qu'à la croix, et l'adresse ayant été
  // nettoyée entre-temps, un aller-retour par Comparer le ramenait devant un
  // lien qui n'existait plus. La maquette remet `shared` à faux à chaque
  // navigation (App.dc.html:539) ; ici la condition sur l'écran suffit, et
  // elle survit à la navigation que la lecture du lien déclenche elle-même.
  useEffect(() => {
    if (screenOf(pathname) !== "booking") setShared(false);
    setStayOpen(false);
    window.scrollTo(0, 0);
    document.querySelectorAll<HTMLElement>(".v6 .screen.on .scroll").forEach((s) => {
      s.scrollTop = 0;
    });
  }, [pathname, setStayOpen, setShared]);

  // Lien de partage :
  // `#s=<station>&l=<logement>&d=<arrivée>&n=<nuits>&t=<voyageurs>&e=<enfants>&r=<chambres>`.
  // Station, logement, dates et voyageurs viennent du lien et remplacent le
  // séjour en cours ; le récapitulatif le dit par un bandeau.
  useEffect(() => {
    if (hashLu) return;
    hashLu = true;
    const h = new URLSearchParams(window.location.hash.slice(1));
    const s = h.get("s");
    if (!s || !stationById(s)) return;
    const p = useParcours.getState();
    const st = useStay.getState();
    // Un lien écrit avant le 26 septembre 2026 peut porter un identifiant
    // retiré (`#s=espace-aubrac`) : on retient la station qu'il ouvre, sous son
    // propre identifiant, pour que la sélection se retrouve partout.
    p.retain(stationById(s)?.id ?? s);
    const n = +(h.get("n") ?? 0),
      t = +(h.get("t") ?? 0),
      e = +(h.get("e") ?? 0),
      r = +(h.get("r") ?? 0);
    const d = h.get("d");
    const patch: Partial<{
      guests: number;
      children: number;
      bedrooms: number;
      checkIn: string;
      checkOut: string;
    }> = {};
    if (t) patch.guests = t;
    // Zéro enfant est une valeur, pas une absence : le lien l'écrit toujours,
    // et un séjour partagé sans enfant doit effacer ceux du séjour en cours.
    if (h.has("e")) patch.children = clampChildren(e, t || st.guests);
    if (r) patch.bedrooms = r;
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) patch.checkIn = d;
    if (n) {
      const [y, m, dd] = (patch.checkIn ?? st.checkIn).split("-").map(Number);
      const out = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (dd ?? 1) + n));
      patch.checkOut = out.toISOString().slice(0, 10);
    }
    if (Object.keys(patch).length) st.setStay(patch);
    const l = h.get("l");
    if (l) p.chooseLodge(l);
    p.setShared(true);
    window.history.replaceState(null, "", window.location.pathname);
    void go(l ? "booking" : "lodging");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className={controle ? "v6 app" : "v7 app"}>
        <div className="v7haut">
          <Barre pilule={ecran !== null && ecran !== "home"} />
        </div>
        {/* « Modifier la recherche » : la pilule de la barre l'ouvre, et les
            boutons de séjour de Logements et de la réservation aussi. */}
        {!controle && stayOpen ? <FenetreModifier ecran={ecran} /> : null}
        {chips ? <div className="coquille__chips">{chips}</div> : null}
        {controle ? <main>{children}</main> : children}
      </div>
      <Toast />
    </>
  );
}
