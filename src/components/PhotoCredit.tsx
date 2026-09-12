import { photoCreditFor } from "@/lib/photoCredits";

/**
 * Crédit photo, posé dans le coin du bandeau.
 *
 * Discret par construction : 11 px, pas de cadre, pas de pastille. Il doit se
 * lire sans disputer la place au nom de la station. Quand le crédit n'est pas
 * résoluble, rien ne s'affiche : mieux vaut pas de crédit qu'un crédit faux.
 */
export function PhotoCredit({
  stationId,
  className = "",
}: {
  stationId: string;
  className?: string;
}) {
  const credit = photoCreditFor(stationId);
  if (!credit) return null;
  return (
    <span
      className={`absolute bottom-2 right-3 text-[11px] leading-none text-white/55 ${className}`}
      title={credit.source.home}
    >
      {credit.label}
    </span>
  );
}

/** Même crédit sur fond clair, où le blanc translucide ne se lit plus. */
export function PhotoCreditInk({
  stationId,
  className = "",
}: {
  stationId: string;
  className?: string;
}) {
  const credit = photoCreditFor(stationId);
  if (!credit) return null;
  return (
    <span className={`text-[11px] leading-none text-muted ${className}`} title={credit.source.home}>
      {credit.label}
    </span>
  );
}
