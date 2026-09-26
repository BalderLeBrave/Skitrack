/**
 * Le tarif de forfait d'une station, tel que la fiche et le récapitulatif le
 * lisent : le relevé du dépôt quand il en a un, la graine du catalogue sinon.
 *
 * La maquette lisait la seule graine (`d.seed`). Le dépôt fait mieux : son
 * magasin de forfaits relève les pages officielles et date ses relevés. Quand
 * il répond avec un montant, ce montant prime et sa date s'écrit ; un tarif
 * « estimé » n'entre jamais ici, la règle du dépôt étant qu'il reste hors du
 * coût officiel. La saison et la zone n'existent que dans la graine.
 *
 * Depuis le 26 septembre 2026, la graine de 142 domaines ne porte plus que le
 * 6 jours adulte : leur journée et leur 6 jours enfant étaient calculés à
 * partir de lui, et la fiche les montrait sous « Relevé le 11 août 2026 ». Ils
 * voyagent à part, dans `estime`, pour être écrits « estimé » ; `j1` et `enf6`
 * restent nuls, si bien que le coût du séjour, qui ne lit qu'eux, n'en compte
 * aucun.
 */

import { useEffect, useState } from "react";
import { getForfait } from "@/lib/forfaits/api";
import { estimationDuDomaine, rattachementForfait, type EstimationForfait } from "@/lib/forfaits/catalog";
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
  /** La journée et le 6 jours enfant que le catalogue estime d'après le
   *  6 jours adulte, quand ils ne sont pas relevés. À écrire « estimé » ; ils
   *  n'entrent dans aucun coût. `null` sans estimation. */
  estime: EstimationForfait | null;
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
    estime: estimationDuDomaine(d),
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
    // L'estimation part du 6 jours du catalogue : un autre 6 jours, relevé
    // depuis sur la page officielle, la rendrait sans objet.
    estime: row.j6 === graine?.j6 ? (graine?.estime ?? null) : null,
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
