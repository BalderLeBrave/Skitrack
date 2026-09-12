import { useEffect, useState } from "react";
import {
  clampRooms,
  clampTravelers,
  PARTY_LIMITS,
  roomsLabel,
  travelersLabel,
} from "@/lib/stay/party";
import { useStay } from "@/lib/stay";

/**
 * Les compteurs du groupe : voyageurs et chambres.
 *
 * ## Le défaut qu'ils corrigent
 *
 * Ces compteurs existaient en double, chacun avec ses bornes écrites en dur :
 * douze voyageurs, six chambres. Un groupe de quatorze, un chalet de huit
 * chambres, deux demandes ordinaires en location de montagne, étaient donc
 * impossibles à exprimer, et le bouton « + » cessait simplement de répondre
 * sans qu'aucun message dise pourquoi. Ici les bornes viennent de
 * `PARTY_LIMITS`, en un seul endroit, et un bouton arrivé à la borne se
 * **désactive visiblement** plutôt que de rester actif et muet.
 *
 * Le champ central est un `input` : on y tape « 18 » plutôt que de cliquer
 * dix-huit fois, ce qui est la vraie raison pour laquelle un plafond de douze
 * passait inaperçu, personne n'allant jusque-là au clic. La saisie
 * intermédiaire vide est conservée le temps de la frappe : forcer la valeur à
 * chaque touche empêchait d'effacer « 8 » pour écrire « 12 ».
 *
 * Réécrit : l'original lisait `useApp`. Ces compteurs lisent et écrivent
 * `useStay` (`guests`, `bedrooms`).
 */

function Stepper({
  value,
  onChange,
  min,
  max,
  label,
  display,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  label: string;
  /** Rendu de la valeur quand elle mérite un mot plutôt qu'un chiffre. */
  display?: string;
}) {
  // Miroir local de la frappe. `null` = pas d'édition en cours ; la valeur du
  // magasin ne bouge pas tant que rien de lisible n'est écrit.
  const [brouillon, setBrouillon] = useState<string | null>(null);

  // Une modification venue d'ailleurs (les boutons, un autre écran) reprend la
  // main sur un brouillon abandonné.
  useEffect(() => {
    setBrouillon(null);
  }, [value]);

  const valider = (brut: string): void => {
    const n = Number.parseInt(brut, 10);
    // La saisie est ramenée entre les bornes plutôt que refusée : taper « 50 »
    // pose 20 et le montre, là où un rejet silencieux laisserait croire que la
    // frappe n'a pas été prise.
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    setBrouillon(null);
  };

  const affiche = brouillon !== null ? brouillon : (display ?? String(value));
  const btn =
    "h-8 w-8 rounded-md border border-line text-base leading-none disabled:opacity-35 disabled:cursor-not-allowed";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={btn}
        aria-label={`${label}, un de moins`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" className="mx-auto" aria-hidden>
          <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <input
        className="w-28 rounded-md border border-line bg-panel px-2 py-1 text-center text-sm"
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={affiche}
        onFocus={() => setBrouillon(String(value))}
        onChange={(e) => setBrouillon(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={(e) => valider(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <button
        type="button"
        className={btn}
        aria-label={`${label}, un de plus`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" className="mx-auto" aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export function PartyStepper() {
  const guests = useStay((s) => s.guests);
  const bedrooms = useStay((s) => s.bedrooms);
  const setStay = useStay((s) => s.setStay);

  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-sm">
        <span className="text-muted">Voyageurs</span>
        <Stepper
          value={clampTravelers(guests)}
          onChange={(n) => setStay({ guests: clampTravelers(n) })}
          min={PARTY_LIMITS.travelers.min}
          max={PARTY_LIMITS.travelers.max}
          label="Voyageurs"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-muted">Chambres demandées</span>
        <Stepper
          value={clampRooms(bedrooms)}
          onChange={(n) => setStay({ bedrooms: clampRooms(n) })}
          min={PARTY_LIMITS.rooms.min}
          max={PARTY_LIMITS.rooms.max}
          label="Chambres"
          display={clampRooms(bedrooms) === 0 ? roomsLabel(0) : undefined}
        />
      </label>

      <p className="text-xs text-muted">
        {travelersLabel(clampTravelers(guests))}, {roomsLabel(bedrooms)}. Zéro chambre n’est pas «
        aucune chambre » : c’est l’absence d’exigence, donc un studio passe. Au-delà de{" "}
        {PARTY_LIMITS.travelers.max} voyageurs, la recherche bascule dans le séjour de groupe, que
        les sources interrogées ici ne couvrent pas.
      </p>
    </div>
  );
}
