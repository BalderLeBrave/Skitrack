/**
 * La coquille de page de SKITRACK : une seule, pour les dix écrans.
 *
 * Elle porte la barre de la maquette v7 (`V7Coquille.dc.html`) : la marque,
 * le parcours en pastille (Accueil, 1 Comparer, 2 Logements, 3 Réservation)
 * avec ses verrous, et à droite le thème, la langue et « Plus ». Hors de
 * l'accueil, un bouton de séjour résume station, dates et groupe, et ouvre le
 * panneau « Votre séjour » : deux mois de calendrier et les deux compteurs.
 *
 * La navigation retenue est `go()` : elle porte les verrous du parcours et
 * l'explication quand une étape n'est pas encore franchissable.
 *
 * Les cinq écrans du parcours défilent avec le document, la barre reste
 * collée en haut : c'est la mise en page de la maquette. Les écrans de
 * contrôle (`/carte`, `/altitudes`, `/openskimap`, `/forfaits`, `/traces`)
 * gardent leur coquille à hauteur fixe et leurs propres feuilles, sous la
 * même barre.
 */

import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AutoSync } from "./AutoSync";
import { Icon } from "./Icon";
import { AILLEURS_PATHS, useGo, screenOf, type Screen } from "./v6/go";
import { Toast } from "./v6/Toast";
import { Calendrier, usePlage } from "./v7/Calendrier";
import { Compteur } from "./v7/Compteur";
import { useFermeture } from "./v7/fermeture";
import { useCriteresUrl } from "@/lib/criteres";
import { useLocale, useT, type MsgId } from "@/lib/i18n";
import {
  arrivalLbl,
  datesLbl,
  departLbl,
  groupLbl,
  useParcours,
  useSejour,
} from "@/lib/parcours";
import { stationsVoisines } from "@/lib/domaineStations";
import { stationById } from "@/lib/stations";
import { useStay } from "@/lib/stay";
import { AGE_ENFANT, clampChildren } from "@/lib/stay/party";
import { useTheme } from "@/lib/theme";

const PARCOURS: { go: Screen; step: number | null; label: MsgId }[] = [
  { go: "home", step: null, label: "nav.home" },
  { go: "compare", step: 1, label: "nav.compare" },
  { go: "lodging", step: 2, label: "nav.lodging" },
  { go: "booking", step: 3, label: "nav.booking" },
];

/** Écrans hors parcours, rangés sous « Plus ». Les chemins viennent de
 *  `AILLEURS_PATHS` (`go.ts`), seule table de ces routes.
 *
 *  Deux groupes, parce que le menu mêlait deux choses : ce qu'on ouvre pour
 *  préparer un séjour — la carte, les forfaits, ses traces — et ce qu'on ouvre
 *  pour vérifier d'où viennent les données. Les seconds ne servent pas au
 *  voyageur et brouillaient les premiers. */
const AILLEURS: { titre: MsgId; liens: { to: (typeof AILLEURS_PATHS)[number]; label: MsgId }[] }[] = [
  {
    titre: "nav.tools",
    liens: [
      { to: "/carte", label: "nav.map" },
      { to: "/forfaits", label: "nav.passes" },
      { to: "/traces", label: "nav.traces" },
    ],
  },
  {
    titre: "nav.control",
    liens: [
      { to: "/altitudes", label: "nav.alt" },
      { to: "/openskimap", label: "nav.osm" },
      { to: "/cles", label: "nav.cles" },
    ],
  },
];

/** Les routes qui ne sont pas une étape du parcours. Une seule question posée
 *  à une seule table : `screenOf` répond `null` hors du parcours. */
export function horsParcours(pathname: string): boolean {
  return screenOf(pathname) === null;
}

/**
 * La station qu'on regarde : celle retenue pour le séjour, ou à défaut celle
 * dont on lit la fiche. Même lecture que la pilule de séjour.
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
  useFermeture(ouvert, () => setOuvert(false), hote);
  // Les voisines de forfait : depuis Courchevel, passer à Méribel ou à Val
  // Thorens sans repasser par Comparer. Le menu ne proposait rien de tel, et
  // aucun autre écran ne fait ce saut.
  const station = useStationCourante();
  const voisines = useMemo(
    () => (station ? stationsVoisines(station.id, station.domain) : []),
    [station],
  );

  return (
    <div className="v7nav__plus" ref={hote}>
      <button
        type="button"
        className={`v7nav__util${ouvert ? " v7nav__util--on" : ""}`}
        title="Plus : favoris, suivi, réglages"
        aria-expanded={ouvert}
        aria-haspopup="dialog"
        onClick={() => setOuvert((v) => !v)}
      >
        {t("nav.more")}
        <Icon name="chevron-bas" taille={14} />
      </button>
      {ouvert ? (
        <div className="v7menu" role="dialog" aria-label={t("nav.more")}>
          <span className="v7menu__label">{t("nav.elsewhere")}</span>
          {AILLEURS.map((groupe) => (
            <div key={groupe.titre} className="v7menu__groupe">
              <span className="v7menu__titre">{t(groupe.titre)}</span>
              <div className="v7menu__liens">
                {groupe.liens.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="v7menu__lien"
                    onClick={() => setOuvert(false)}
                  >
                    {t(l.label)}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {voisines.length ? (
            <div className="v7menu__groupe">
              <span className="v7menu__titre">
                {t("nav.domainStations")} · {station?.domain}
              </span>
              <div className="v7menu__liens v7menu__liens--stations">
                {voisines.map((s) => (
                  <Link
                    key={s.id}
                    to="/stations/$id"
                    params={{ id: s.id }}
                    className="v7menu__lien"
                    onClick={() => setOuvert(false)}
                  >
                    {s.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          <div className="v7menu__pied">
            <AutoSync />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Barre() {
  const t = useT();
  const go = useGo();
  const ecran = useRouterState({ select: (s) => screenOf(s.location.pathname) });
  const stationId = useParcours((s) => s.stationId);
  const lodgeId = useParcours((s) => s.lodgeId);
  const theme = useTheme((s) => s.theme);
  const bascule = useTheme((s) => s.toggle);
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);

  return (
    <header className="v7nav">
      <a
        href="/"
        className="v7nav__marque"
        onClick={(e) => {
          e.preventDefault();
          void go("home");
        }}
      >
        <span className="v7nav__ski">ski</span>
        <span className="v7nav__track">track</span>
        <i className="v7nav__point" aria-hidden />
      </a>
      <nav className="v7nav__parcours" aria-label="Parcours">
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
          return (
            <button
              key={j.go}
              type="button"
              className={`v7nav__etape${actif ? " v7nav__etape--on" : ""}${verrou ? " v7nav__etape--verrou" : ""}`}
              data-go={j.go}
              aria-current={actif ? "page" : undefined}
              title={titre}
              onClick={() => void go(j.go)}
            >
              {j.step != null ? <i className="v7nav__num">{j.step}</i> : null}
              {t(j.label)}
              {verrou ? <Icon name="cadenas" taille={13} /> : null}
            </button>
          );
        })}
      </nav>
      <div className="v7nav__utils">
        {/* L'icône dit le thème en cours ; elle montrait un soleil dans les
            deux états, donc rien. */}
        <button
          type="button"
          className="v7nav__util v7nav__util--rond"
          title={theme === "dark" ? "Thème sombre — passer au clair" : "Thème clair — passer au sombre"}
          role="switch"
          aria-checked={theme === "dark"}
          aria-label="Thème"
          onClick={bascule}
          data-testid="theme-toggle"
        >
          <Icon name={theme === "dark" ? "lune" : "soleil"} taille={18} />
        </button>
        <button
          type="button"
          className="v7nav__util v7nav__util--langue"
          title="Langue"
          aria-label={locale === "fr" ? "English" : "Français"}
          onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
        >
          {locale === "fr" ? "FR" : "EN"}
        </button>
        <MenuPlus />
      </div>
    </header>
  );
}

/** Le bouton de séjour sous la barre, hors de l'accueil. */
function PiluleSejour() {
  const stationId = useParcours((s) => s.stationId);
  const stayOpen = useParcours((s) => s.stayOpen);
  const setStayOpen = useParcours((s) => s.setStayOpen);
  const { checkIn, checkOut, trav, enfants, rooms, nights } = useSejour();
  /* Sur une fiche de station, la pilule annonçait « Station à choisir » alors
     qu'on en regardait une. Elle nomme donc celle qu'on a sous les yeux quand
     aucune n'est encore retenue ; le panneau qu'elle ouvre, lui, ne change
     pas : c'est toujours celui du séjour. */
  const params = useParams({ strict: false }) as { id?: string };
  const station =
    (stationId ? stationById(stationId) : undefined) ??
    (params.id ? stationById(params.id) : undefined);
  return (
    <div className="v7sejour">
      <button
        type="button"
        className="v7sejour__pilule"
        data-sejour-ouvre
        aria-expanded={stayOpen}
        onClick={() => setStayOpen(!stayOpen)}
      >
        <span className="v7sejour__station">{station?.name ?? "Station à choisir"}</span>
        <span className="v7sejour__dates">{datesLbl(checkIn, checkOut, nights)}</span>
        <span className="v7sejour__groupe">{groupLbl(trav, rooms, enfants)}</span>
        <span className="v7sejour__loupe">
          <Icon name="loupe" taille={14} />
        </span>
      </button>
    </div>
  );
}

/** « Votre séjour » : le panneau flottant sous la barre. */
function PanneauSejour() {
  const setStayOpen = useParcours((s) => s.setStayOpen);
  const { checkIn, checkOut, nights } = useSejour();
  const plage = usePlage();
  const hote = useRef<HTMLDivElement>(null);
  useFermeture(true, () => setStayOpen(false), hote, "[data-sejour-ouvre]");
  return (
    <div className="v7panneau" ref={hote} role="dialog" aria-label="Votre séjour">
      <div className="v7panneau__tete">
        <div>
          <strong>Votre séjour</strong>
          <span>
            Arrivée {arrivalLbl(checkIn)} · départ {departLbl(checkOut)} · {nights} nuit
            {nights > 1 ? "s" : ""}
          </span>
        </div>
        <button type="button" className="v7fermer" aria-label="Fermer" onClick={() => setStayOpen(false)}>
          <Icon name="croix" taille={14} />
        </button>
      </div>
      <Calendrier plage={plage} hauteur={38} />
      <div className="v7panneau__compteurs">
        <Compteur k="trav" titre="Voyageurs" regle="1 à 20" encadre />
        {/* Les enfants, parce que le coût des forfaits comptait huit adultes
            quand le domaine publie aussi son tarif enfant. */}
        <Compteur k="enfants" titre="dont enfants" regle={AGE_ENFANT} encadre />
        <Compteur k="rooms" titre="Chambres" regle="0 = studio accepté" encadre />
      </div>
      <span className="v7panneau__note">
        Dates et voyageurs sont conservés d’un écran à l’autre.
      </span>
    </div>
  );
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
  useCriteresUrl(!controle, pathname);

  // Changer d'écran ferme le panneau de séjour et remonte en haut de page,
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
    p.retain(s);
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
          <Barre />
          {/* `showStay` de la maquette : `part === 'top' && screen !== 'home'
              && showStayBar`, et l'App passe
              `showStayBar: screen !== 'compare' && screen !== 'lodgings'`
              (V7Coquille.dc.html:92, App.dc.html:918). La pilule ne paraît
              donc que sur la fiche station et sur la réservation : Comparer
              porte sa barre collante, Logements son résumé de séjour. */}
          {!controle && ecran !== "home" && ecran !== "compare" && ecran !== "lodging" ? (
            <PiluleSejour />
          ) : null}
          {!controle && stayOpen ? <PanneauSejour /> : null}
        </div>
        {chips ? <div className="coquille__chips">{chips}</div> : null}
        {controle ? <main>{children}</main> : children}
      </div>
      <Toast />
    </>
  );
}
