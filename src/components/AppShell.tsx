import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AutoSync } from "./AutoSync";
import { LangToggle } from "./LangToggle";
import { SearchStayBar } from "./SearchStayBar";
import { Icon } from "@/components/Icon";
import { useStay } from "@/lib/stay";
import { useTheme } from "@/lib/theme";
import { useT, type MsgId } from "@/lib/i18n";

/** Parcours en trois étapes de la maquette. L'accueil n'est pas numéroté.
 *  `to: null` = étape sans cible propre : /reservation/$id s'ouvre depuis un
 *  logement, jamais depuis l'en-tête. */
const JOURNEY: { step: number | null; label: MsgId; to: string | null; owns: string[] }[] = [
  { step: null, label: "nav.home", to: "/", owns: ["/"] },
  { step: 1, label: "nav.compare", to: "/comparer", owns: ["/comparer", "/carte", "/stations"] },
  { step: 2, label: "nav.lodging", to: "/logements", owns: ["/logements"] },
  { step: 3, label: "nav.booking", to: null, owns: ["/reservation"] },
];

/** Liens hors parcours, rangés sous « Plus ». */
const ELSEWHERE: { to: string; label: MsgId }[] = [
  { to: "/carte", label: "nav.map" },
  { to: "/altitudes", label: "nav.alt" },
  { to: "/openskimap", label: "nav.osm" },
  { to: "/forfaits", label: "nav.passes" },
  { to: "/traces", label: "nav.traces" },
  { to: "/comparer", label: "nav.compare" },
];

function owns(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
}

function MoreMenu() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const shortlist = useStay((s) => s.shortlist.length);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!host.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="relative" ref={host}>
      <button
        type="button"
        className={`chip${open ? " chip--on" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        {t("nav.more")}
        <Icon name="chevron-bas" />
      </button>
      {open ? (
        <div className="more" role="dialog" aria-label={t("nav.more")}>
          <p className="more__label">{t("nav.stay")}</p>
          <SearchStayBar />
          <p className="more__label">{t("nav.elsewhere")}</p>
          <div className="more__links">
            {ELSEWHERE.map((l) => (
              <Link key={l.to} to={l.to} className="chip chip--sm" onClick={() => setOpen(false)}>
                {t(l.label)}
                {l.to === "/comparer" && shortlist ? ` · ${shortlist}` : ""}
              </Link>
            ))}
          </div>
          <div className="more__foot">
            <LangToggle />
            <button
              type="button"
              role="switch"
              aria-checked={theme === "dark"}
              onClick={toggle}
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

export function AppShell({
  children,
  chips,
}: {
  children: React.ReactNode;
  chips?: React.ReactNode;
}) {
  const t = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <header className="sticky top-0 z-20">
        <div className="nav">
          <Link to="/" className="brand" aria-label="Skitrack">
            <span className="brand__ski">ski</span>
            <span className="brand__track">track</span>
            <i className="brand__dot" aria-hidden="true" />
          </Link>
          <nav className="journey" aria-label="Parcours">
            {JOURNEY.map((s) => {
              const on = owns(pathname, s.owns);
              const body = (
                <>
                  {s.step ? (
                    <i className="jl__step" aria-hidden="true">
                      {s.step}
                    </i>
                  ) : null}
                  {t(s.label)}
                </>
              );
              if (!s.to) {
                return (
                  <span
                    key={s.label}
                    className={`jl${on ? " jl--on" : " jl--locked"}`}
                    aria-current={on ? "page" : undefined}
                    title={on ? undefined : t("nav.bookingLocked")}
                  >
                    {body}
                  </span>
                );
              }
              return (
                <Link
                  key={s.label}
                  to={s.to}
                  className={`jl${on ? " jl--on" : ""}`}
                  aria-current={on ? "page" : undefined}
                >
                  {body}
                </Link>
              );
            })}
          </nav>
          {/* Le séjour ne se règle plus depuis l'en-tête : dates, voyageurs et
              chambres se posent dans la barre de recherche de l'accueil, seul
              endroit où ils sont modifiables. « Plus » reste. */}
          <div className="utils min-w-0">
            <MoreMenu />
          </div>
        </div>
        {chips ? (
          <div className="flex h-11 items-center gap-2 overflow-x-auto border-b border-bordure-douce bg-panel px-4 text-corps">
            {chips}
          </div>
        ) : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
