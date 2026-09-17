/**
 * Le tarif de forfait d'une station, tel que la fiche et le récapitulatif le
 * lisent : le relevé du dépôt quand il en a un, la graine du catalogue sinon.
 *
 * La maquette lisait la seule graine (`d.seed`). Le dépôt fait mieux : son
 * magasin de forfaits relève les pages officielles et date ses relevés. Quand
 * il répond avec un montant, ce montant prime et sa date s'écrit ; un tarif
 * « estimé » n'entre jamais ici, la règle du dépôt étant qu'il reste hors du
 * coût officiel. La saison et la zone n'existent que dans la graine.
 */

import { useEffect, useState } from "react";
import { getForfait } from "@/lib/forfaits/api";
import { rattachementForfait } from "@/lib/forfaits/catalog";
import type { ForfaitRow } from "@/lib/forfaits/types";
import type { Station } from "@/lib/stations";

export type Forfait = {
  j1: number | null;
  j6: number | null;
  enf6: number | null;
  saison: number | null;
  /** Nom de la zone tarifaire, sinon du domaine, sinon de la station. */
  zone: string;
  /** « 11 août 2026 » ou la date du relevé du dépôt. `null` sans relevé. */
  releveLbl: string | null;
  /** Le tarif vient d'une page officielle relevée, pas d'une estimation. */
  releve: boolean;
  /** « prix du forfait Les 3 Vallées » quand le tarif est pris au domaine qui
   *  relie la station, faute d'entrée à son nom. `null` sinon. */
  heriteLbl: string | null;
};

function dateLbl(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** Ce que la graine seule permet d'écrire, avant toute réponse du serveur. */
export function forfaitGraine(s: Station): Forfait | null {
  const r = rattachementForfait(s.id, s.domain);
  const d = r?.domaine;
  const seed = d?.seed ?? null;
  if (!seed || seed.j6 == null) return null;
  return {
    j1: seed.j1,
    j6: seed.j6,
    enf6: seed.enf6,
    saison: seed.saison,
    zone: seed.zone ?? d?.name ?? s.domain ?? s.name,
    releveLbl: seed.majLabel ?? dateLbl(seed.maj),
    releve: true,
    heriteLbl: r?.herite && r.nomDomaine ? `prix du forfait ${r.nomDomaine}` : null,
  };
}

function fusion(s: Station, row: ForfaitRow | null): Forfait | null {
  const graine = forfaitGraine(s);
  if (!row || row.status === "estimé" || row.status === "erreur" || row.j6 == null) return graine;
  const d = rattachementForfait(s.id, s.domain)?.domaine;
  return {
    j1: row.j1 ?? graine?.j1 ?? null,
    j6: row.j6,
    enf6: row.enf6 ?? graine?.enf6 ?? null,
    saison: graine?.saison ?? null,
    zone: graine?.zone ?? d?.name ?? s.domain ?? s.name,
    releveLbl: dateLbl(row.fetchedAt) ?? graine?.releveLbl ?? null,
    releve: true,
    heriteLbl: graine?.heriteLbl ?? null,
  };
}

export function useForfait(s: Station | undefined): Forfait | null {
  const [row, setRow] = useState<ForfaitRow | null>(null);
  const slug = s ? rattachementForfait(s.id, s.domain)?.domaine.slug : undefined;
  useEffect(() => {
    setRow(null);
    if (!slug) return;
    let cancelled = false;
    void getForfait({ data: { slug } })
      .then((r) => {
        if (!cancelled) setRow(r.row);
      })
      .catch((e: unknown) => {
        // Journalisé : le `catch` vide laissait la fiche sans tarif et sans
        // raison.
        console.warn(`[forfaits] ${slug} : lecture en échec`, e);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);
  return s ? fusion(s, row) : null;
}
