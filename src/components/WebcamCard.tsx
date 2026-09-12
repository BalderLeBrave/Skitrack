import { useMemo, useState } from "react";
import { webcamsForStation } from "@/lib/webcams";

/**
 * Webcams de la station, telles que l'exploitant les diffuse.
 *
 * Le flux reste chez lui : `iframe`, pas de copie ni de réencodage. Le menu
 * déroulant n'apparaît qu'à partir de deux caméras, sinon le libellé seul dit
 * ce qu'on regarde.
 */
export function WebcamCard({ stationId }: { stationId: string }) {
  const cams = useMemo(() => webcamsForStation(stationId), [stationId]);
  const [id, setId] = useState<string | null>(null);
  const current = cams.find((c) => c.id === id) ?? cams[0] ?? null;

  return (
    <section
      className="rounded-[var(--radius-card)] border border-line bg-panel p-4"
      data-testid="webcam-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted">Webcams</p>
        {cams.length > 1 ? (
          <select
            className="rounded-md border border-line bg-panel px-2 py-1 text-sm"
            value={current?.id ?? ""}
            onChange={(e) => setId(e.target.value)}
            aria-label="Choisir la caméra"
          >
            {cams.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        ) : current ? (
          <span className="text-sm">{current.label}</span>
        ) : null}
      </div>

      {current ? (
        <>
          <div className="mt-3 aspect-video overflow-hidden rounded-[var(--radius-card)] border border-line">
            <iframe
              key={current.url}
              src={current.url}
              title={current.label}
              className="h-full w-full"
              loading="lazy"
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin"
              allowFullScreen
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            Flux diffusé par l’exploitant, affiché tel quel. Si l’image ne vient pas, c’est sa
            caméra qui est hors service, pas la fiche.
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Aucune webcam relevée pour cette station. La table est tenue à la main, station par
          station : une caméra absente veut dire qu’elle n’a pas été vérifiée, pas qu’il n’en existe
          pas. Aucune caméra n’est devinée par ressemblance de nom.
        </p>
      )}
    </section>
  );
}
