/**
 * La carte d'annonce de la liste des logements, sur la carte Airbnb de la
 * maquette (`CarteAnnonce`, `lCard` de Skitrack App.dc.html) : photos de
 * l'annonce qui défilent, cœur des favoris, titre et note, distance aux
 * remontées, capacité et chambres, prix en gras et « Retenir ».
 *
 * Elle vit hors de la route pour que l'onglet « Par budget » de Prix et les
 * Favoris montrent la même carte que Logements.
 */

import { memo, useCallback, useMemo } from "react";
import { CarteAnnonce, useEnregistrement } from "@/components/maquette";
import type { Altitude } from "@/lib/altitude/altitude";
import { langueIntl } from "@/lib/i18n/langue";
import { tr } from "@/lib/i18n";
import type { Listing } from "@/lib/listings";
import { fmt, nuitsLbl } from "@/lib/parcours";
import { galerieOf } from "@/lib/stay/completude";
import { noteSur5De } from "@/lib/stay/ficheEnrichie";
import { distRemonteePublieeM } from "@/lib/stay/situer";
import { bedLbl, capLbl, distanceOf, NON_RENSEIGNE, prixLbl } from "@/lib/v7";

/**
 * Logements par tranche : « Afficher plus » en ajoute autant. La carte ne
 * porte que ceux qui sont affichés : trois mille pastilles d'un coup la
 * rendaient illisible.
 */
export const PAGE_LOGEMENTS = 18;

/** Écart d'altitude à partir duquel l'annonce est signalée sous le village. */
export const ECART_VILLAGE_M = 300;

const PETITS_MOTS = new Set(["de", "du", "des", "la", "le", "les", "et", "d", "l", "au", "aux", "en", "sur"]);

/** Un titre de source écrit en capitales, avec sa référence interne entre
 *  parenthèses, se lit mal : la carte le remet en casse de phrase et laisse
 *  la référence au volet de l'annonce. Aucun mot n'est ajouté ni retiré. */
function titreLisible(t: string): string {
  const sansRef = t.replace(/\s*\(\s*(?=[A-Z0-9 _-]*\d)[A-Z0-9][A-Z0-9 _-]{2,}\s*\)\s*$/, "");
  return sansRef.replace(/\p{Lu}{2,}(?:[\s'’-]+\p{Lu}{1,})*\p{Lu}/gu, (bloc) => {
    let premier = true;
    return bloc.toLowerCase().replace(/\p{L}+/gu, (mot) => {
      const garder = !premier && PETITS_MOTS.has(mot);
      premier = false;
      return garder ? mot : mot[0].toUpperCase() + mot.slice(1);
    });
  });
}

/** La note sur 5, à une décimale (« 4,8 ») ; rien sans note publiée. */
function noteCourte(l: Listing): string | null {
  const n = noteSur5De(l);
  if (n == null || !Number.isFinite(n) || n <= 0 || n > 5) return null;
  return new Intl.NumberFormat(langueIntl(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
}

/**
 * Une annonce dans la liste. Ce qu'elle lit arrive en propriétés, et `memo`
 * lui évite de se redessiner quand rien de ce qui la concerne n'a bougé.
 */
export const CarteLogement = memo(function CarteLogement({
  l,
  retenu,
  vif,
  stay,
  trav,
  nights,
  ouvrir,
  retenir,
  designer,
  sources,
  autres = null,
  retenuSource,
  altitude,
  altVillage = null,
}: {
  l: Listing;
  /** « Abritel », ou « Airbnb + 2 » quand le logement est aussi ailleurs. */
  sources: string;
  /** Les autres plateformes et leurs prix, lus par les lecteurs d'écran. */
  autres?: string | null;
  /** L'offre retenue parmi celles du logement, ou `null`. */
  retenu: string | null;
  /** Sa plateforme, quand ce n'est pas celle de la carte. */
  retenuSource: string | null;
  /** Déjà ouverte : la pastille de la carte le dit (gardé pour les écrans appelants). */
  vue?: boolean;
  vif: boolean;
  stay: { checkIn: string; checkOut: string };
  trav: number;
  nights: number;
  ouvrir: (id: string) => void;
  retenir: (id: string) => void;
  designer: (id: string | null) => void;
  /** L'altitude au point de l'annonce (`useAltitudes`) : `undefined` tant qu'elle se lit. */
  altitude?: Altitude | null;
  /** Gardé pour les écrans appelants : l'altitude se lit dans la fiche. */
  avecAltitude?: boolean;
  /** L'altitude du village de la station, pour signaler une annonce bien plus bas. */
  altVillage?: number | null;
  /** Gardé pour les écrans appelants : le coût par personne se lit dans la fiche. */
  forfaitsGroupe?: number | null;
}) {
  const isKept = retenu != null;
  const enr = useEnregistrement({ checkIn: stay.checkIn, checkOut: stay.checkOut, trav });
  const photos = useMemo(() => galerieOf(l).map((src) => ({ src })), [l]);

  // La distance comme la maquette : « 1 600 m des remontées », « Ski aux
  // pieds » jusqu'à 50 m, « Distance non mesurée » sans mesure publiée. Un
  // logement d'un autre domaine le dit.
  const d = distanceOf(l);
  const m = distRemonteePublieeM(l);
  const dist =
    d.kind === "other_domain"
      ? d.text
      : m == null
        ? tr("Distance non mesurée")
        : m <= 50
          ? tr("Ski aux pieds")
          : tr("{distance} des remontées", { distance: `${fmt(Math.round(m))} m` });
  const ecart = altVillage != null && altitude ? altVillage - altitude.m : null;
  const sousVillage = ecart != null && ecart >= ECART_VILLAGE_M ? Math.round(ecart / 50) * 50 : null;
  const l2 =
    sousVillage != null ? `${dist} · ${tr("{m} m sous le village", { m: fmt(sousVillage) })}` : dist;

  const inconnu = tr(NON_RENSEIGNE);
  const cap = capLbl(l);
  const ch = bedLbl(l);
  const l3 =
    cap === inconnu && ch === inconnu
      ? tr("Capacité et chambres non renseignées")
      : [
          cap === inconnu ? null : cap,
          ch === inconnu ? null : ch,
          l.beds != null && l.beds > 0 ? tr("{n} lits", { n: l.beds }) : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const priceSub = l.priceIndicative
    ? `${tr("pour {nuits}", { nuits: nuitsLbl(nights) })} · ${tr("Prix « à partir de »")}`
    : tr("pour {nuits}", { nuits: nuitsLbl(nights) });

  const ouvrirCarte = useCallback(() => ouvrir(l.id), [ouvrir, l.id]);
  return (
    <div className="lg-carte" data-l={l.id}>
      <CarteAnnonce
        photos={photos}
        title={titreLisible(l.title)}
        note={noteCourte(l)}
        l2={l2}
        l3={l3}
        price={prixLbl(l)}
        priceSub={priceSub}
        badge={sources}
        onOpen={ouvrirCarte}
        heart={enr.coeur(l)}
        link={{
          label: isKept
            ? retenuSource
              ? tr("Retenu · {source}", { source: retenuSource })
              : tr("Retenu")
            : tr("Retenir"),
          on: isKept,
          onClick: () => retenir(retenu ?? l.id),
        }}
        vif={vif}
        onMouseEnter={() => designer(l.id)}
        onMouseLeave={() => designer(null)}
      />
      {autres ? <span className="m8-lu-seul">{autres}</span> : null}
      {enr.modale}
    </div>
  );
});
