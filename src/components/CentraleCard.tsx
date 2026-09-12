import { centraleFor } from "@/lib/centrales";

function External() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M14 5h5v5M19 5l-8 8M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Réservation auprès de l'exploitant, quand la station en a une.
 *
 * Le lien mène à la page d'accueil relevée, pas à une recherche datée : chaque
 * centrale a sa syntaxe de paramètres, et une URL fabriquée qui tombe sur une
 * erreur est pire que le lien d'accueil. Les dates du séjour sont rappelées à
 * côté pour qu'elles soient à recopier, pas à retrouver.
 */
export function CentraleCard({
  stationId,
  checkIn,
  checkOut,
  guests,
}: {
  stationId: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
}) {
  const centrale = centraleFor(stationId);
  if (!centrale) return null;

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-panel p-4" data-testid="centrale-card">
      <p className="text-xs uppercase tracking-wide text-muted">Réserver auprès de la station</p>
      <a
        href={centrale.url}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-2 inline-flex items-center gap-2 text-sm font-semibold underline-offset-2 hover:underline"
      >
        {centrale.nom}
        <External />
      </a>
      <p className="mt-1 text-xs text-muted">
        {centrale.host}
        {centrale.portee === "domaine" ? " · centrale du domaine, pas de la station seule" : ""}
      </p>
      {checkIn && checkOut ? (
        <p className="mt-3 text-xs text-muted">
          À recopier dans leur formulaire : {checkIn} au {checkOut}
          {guests ? `, ${guests} personne${guests > 1 ? "s" : ""}` : ""}. Le lien mène à leur page
          d'accueil : leurs paramètres de recherche ne sont pas publics, et une URL fabriquée
          tomberait sur une erreur.
        </p>
      ) : null}
    </section>
  );
}
