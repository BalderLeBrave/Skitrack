/**
 * La coquille de page de SKITRACK : une seule, pour les dix écrans.
 *
 * L'application en portait deux qui rendaient la même barre de parcours par
 * deux chemins : `AppShell` avec des liens et l'i18n, `v6/App` avec `go()` et
 * ses verrous. Les deux dessinaient le même en-tête. Il n'en reste qu'une.
 *
 * La navigation retenue est `go()` : elle porte les verrous du parcours et
 * l'explication quand une étape n'est pas encore franchissable. Les libellés
 * viennent du catalogue, comme dans l'ancienne coquille.
 *
 * Le menu « Plus » n'apparaît que hors du parcours, là où il était déjà : les
 * écrans de contrôle n'ont pas d'autre chemin de retour.
 */

import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AutoSync } from "./AutoSync";
import { Icon } from "./Icon";
import { LangToggle } from "./LangToggle";
import { SearchStayBar } from "./SearchStayBar";
import { useGo, screenOf, type Screen } from "./v6/go";
import { Toast } from "./v6/Toast";
import { useT, type MsgId } from "@/lib/i18n";
import { useParcours } from "@/lib/parcours";
import { stationById } from "@/lib/stations";
import { useStay } from "@/lib/stay";
import { useTheme } from "@/lib/theme";

const PARCOURS: { go: Screen; step: number | null; label: MsgId }[] = [
  { go: "home", step: null, label: "nav.home" },
  { go: "compare", step: 1, label: "nav.compare" },
  { go: "lodging", step: 2, label: "nav.lodging" },
  { go: "booking", step: 3, label: "nav.booking" },
];

/** Écrans de contrôle, hors parcours, rangés sous « Plus ». */
const AILLEURS: { to: string; label: MsgId }[] = [
  { to: "/carte", label: "nav.map" },
  { to: "/altitudes", label: "nav.alt" },
  { to: "/openskimap", label: "nav.osm" },
  { to: "/forfaits", label: "nav.passes" },
  { to: "/traces", label: "nav.traces" },
];

/** Les cinq routes qui ne sont pas une étape du parcours. */
function horsParcours(pathname: string): boolean {
  if (pathname === "/" || pathname.startsWith("/stations/")) return false;
  return !["/comparer", "/logements", "/reservation"].some((p) => pathname.startsWith(p));
}

function MenuPlus() {
  const t = useT();
  const [ouvert, setOuvert] = useState(false);
  const hote = useRef<HTMLDivElement>(null);
  const theme = useTheme((s) => s.theme);
  const bascule = useTheme((s) => s.toggle);
  const retenues = useStay((s) => s.shortlist.length);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (!hote.current?.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  return (
    <div className="relative" ref={hote}>
      <button
        type="button"
        className={`chip${ouvert ? " chip--on" : ""}`}
        aria-expanded={ouvert}
        aria-haspopup="dialog"
        onClick={() => setOuvert((v) => !v)}
      >
        {t("nav.more")}
        <Icon name="chevron-bas" />
      </button>
      {ouvert ? (
        <div className="more" role="dialog" aria-label={t("nav.more")}>
          <p className="more__label">{t("nav.stay")}</p>
          <SearchStayBar />
          <p className="more__label">{t("nav.elsewhere")}</p>
          <div className="more__links">
            {AILLEURS.map((l) => (
              <Link key={l.to} to={l.to} className="chip chip--sm" onClick={() => setOuvert(false)}>
                {t(l.label)}
              </Link>
            ))}
            <Link to="/comparer" className="chip chip--sm" onClick={() => setOuvert(false)}>
              {t("nav.compare")}
              {retenues ? ` · ${retenues}` : ""}
            </Link>
          </div>
          <div className="more__foot">
            <LangToggle />
            <button
              type="button"
              role="switch"
              aria-checked={theme === "dark"}
              onClick={bascule}
              className="chip chip--sm"
              data-testid="theme-toggle"
            >
              {theme === "dark" ? "Sombre" : "Clair"}
            </button>
            <AutoSync />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Barre({ avecPlus }: { avecPlus: boolean }) {
  const t = useT();
  const go = useGo();
  const ecran = useRouterState({ select: (s) => screenOf(s.location.pathname) });
  const stationId = useParcours((s) => s.stationId);
  const lodgeId = useParcours((s) => s.lodgeId);

  return (
    <header className="nav nav--slim">
      <span className="brand" data-go="home" onClick={() => go("home")}>
        <span className="brand__ski">ski</span>
        <span className="brand__track">track</span>
        <i className="brand__dot" />
      </span>
      <nav className="journey" id="journey" aria-label={t("nav.home")}>
        {PARCOURS.map((j) => {
          // La fiche station allume « Comparer » : elle en est le détail.
          const actif = j.go === ecran || (ecran === "fiche" && j.go === "compare");
          const verrou = (j.go === "lodging" && !stationId) || (j.go === "booking" && !lodgeId);
          return (
            <button
              key={j.go}
              type="button"
              className={`jl${actif ? " jl--on" : ""}${verrou && !actif ? " jl--locked" : ""}`}
              data-go={j.go}
              aria-current={actif ? "page" : undefined}
              onClick={() => go(j.go)}
            >
              {j.step != null ? <i className="step">{j.step}</i> : null}
              {t(j.label)}
            </button>
          );
        })}
      </nav>
      {avecPlus ? (
        <div className="utils min-w-0">
          <MenuPlus />
        </div>
      ) : null}
    </header>
  );
}

let hashLu = false;

export function Coquille({ children, chips }: { children: ReactNode; chips?: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const go = useGo();

  useEffect(() => {
    document.querySelectorAll<HTMLElement>(".v6 .screen.on .scroll").forEach((s) => {
      s.scrollTop = 0;
    });
  }, [pathname]);

  // Lien de partage : `#s=<station>&l=<logement>&n=<nuits>&t=<voyageurs>&r=<chambres>`.
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
      r = +(h.get("r") ?? 0);
    const patch: Partial<{ guests: number; bedrooms: number; checkOut: string }> = {};
    if (t) patch.guests = t;
    if (r) patch.bedrooms = r;
    if (n) {
      const [y, m, d] = st.checkIn.split("-").map(Number);
      const out = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n));
      patch.checkOut = out.toISOString().slice(0, 10);
    }
    if (Object.keys(patch).length) st.setStay(patch);
    const l = h.get("l");
    if (l) p.chooseLodge(l);
    window.history.replaceState(null, "", window.location.pathname);
    void go(l ? "booking" : "lodging");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="v6 app">
        <Barre avecPlus={horsParcours(pathname)} />
        {chips ? <div className="coquille__chips">{chips}</div> : null}
        <main>{children}</main>
      </div>
      <Toast />
    </>
  );
}
