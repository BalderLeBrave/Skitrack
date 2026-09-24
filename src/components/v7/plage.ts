/**
 * La sélection de dates en cours, partagée entre le calendrier et la barre qui
 * l'affiche. Hors de `Calendrier.tsx`, qui ne doit exporter que des composants
 * pour que le rechargement à chaud (Fast Refresh) fonctionne.
 */

import { useState } from "react";
import { useStay } from "@/lib/stay";
import { monthOfIso, todayIso, type YearMonth } from "@/lib/stay/calendar";

export type Phase = "from" | "to";

/** L'état de la sélection, partagé entre le calendrier et la barre qui
 *  l'affiche (les segments « Arrivée » et « Départ » de l'accueil). */
export function usePlage() {
  const checkIn = useStay((s) => s.checkIn);
  const [phase, setPhase] = useState<Phase>("from");
  const [pending, setPending] = useState<string | null>(null);
  const [mois, setMois] = useState<YearMonth>(
    () => monthOfIso(checkIn) ?? (monthOfIso(todayIso()) as YearMonth),
  );
  /** Ouvre la sélection en attendant une arrivée. */
  const ouvrirArrivee = () => {
    setPhase("from");
    setPending(null);
  };
  /** Ouvre la sélection en attendant un départ, l'arrivée actuelle gardée. */
  const ouvrirDepart = () => {
    setPhase("to");
    setPending(null);
  };
  const reset = () => {
    setPhase("from");
    setPending(null);
  };
  return {
    phase,
    pending,
    mois,
    setMois,
    setPhase,
    setPending,
    ouvrirArrivee,
    ouvrirDepart,
    reset,
  };
}

export type Plage = ReturnType<typeof usePlage>;
