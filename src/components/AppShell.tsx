import { Link } from "@tanstack/react-router";
import { LangToggle } from "./LangToggle";
import { SearchStayBar } from "./SearchStayBar";
import { useStay } from "@/lib/stay";
import { useTheme } from "@/lib/theme";
import { useT } from "@/lib/i18n";

export function AppShell({
  children,
  chips,
}: {
  children: React.ReactNode;
  chips?: React.ReactNode;
}) {
  const n = useStay((s) => s.shortlist.length);
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/94 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-3">
          <Link to="/" className="shrink-0 font-display text-base tracking-tight">
            Skitrack
          </Link>
          <div className="hidden min-w-0 flex-1 md:block">
            <SearchStayBar compact />
          </div>
          <LangToggle />
          <button
            type="button"
            role="switch"
            aria-checked={theme === "dark"}
            onClick={toggle}
            className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm"
            data-testid="theme-toggle"
          >
            {theme === "dark" ? "Sombre" : "Clair"}
          </button>
          <Link to="/forfaits" className="shrink-0 text-sm text-muted hover:text-ink">
            {t("nav.passes")}
          </Link>
          <Link to="/traces" className="hidden shrink-0 text-sm text-muted hover:text-ink sm:inline">
            {t("nav.traces")}
          </Link>
          <Link to="/comparer" className="hidden shrink-0 text-sm text-muted hover:text-ink sm:inline">
            {t("nav.compare")}
            {n ? ` (${n})` : ""}
          </Link>
        </div>
        {chips ? (
          <div className="flex h-11 items-center gap-2 overflow-x-auto border-t border-line px-4 text-sm">
            {chips}
          </div>
        ) : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
