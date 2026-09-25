/**
 * La pagination des listes de logements.
 *
 * Hors de la route pour que Logements et l'onglet « Par budget » de Prix
 * tournent leurs pages de la même façon.
 */

import { Icon } from "@/components/Icon";

/**
 * La pagination de la liste, comme sur Airbnb : la première page, la dernière,
 * et deux voisines de la page en cours ; des points de suspension entre.
 */
export function Pages({ page, n, aller }: { page: number; n: number; aller: (p: number) => void }) {
  const vues = [...new Set([0, page - 1, page, page + 1, n - 1])]
    .filter((p) => p >= 0 && p < n)
    .sort((a, b) => a - b);
  const rendus: (number | "…")[] = [];
  vues.forEach((p, i) => {
    if (i > 0 && p - vues[i - 1] > 1) rendus.push("…");
    rendus.push(p);
  });
  return (
    <nav className="pages7" aria-label="Pages de logements">
      <button
        type="button"
        className="pages7__fleche"
        disabled={page === 0}
        onClick={() => aller(page - 1)}
        aria-label="Page précédente"
      >
        <Icon name="chevron-gauche" taille={18} />
      </button>
      {rendus.map((p, i) =>
        p === "…" ? (
          <span key={`s${i}`} className="pages7__ellipse" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={`pages7__num${p === page ? " pages7__num--on" : ""}`}
            aria-current={p === page ? "page" : undefined}
            onClick={() => aller(p)}
          >
            {p + 1}
          </button>
        ),
      )}
      <button
        type="button"
        className="pages7__fleche"
        disabled={page >= n - 1}
        onClick={() => aller(page + 1)}
        aria-label="Page suivante"
      >
        <Icon name="chevron-droite" taille={18} />
      </button>
    </nav>
  );
}
